/* ============================================================
   AI Predictive Engine — Backend Proxy (Node.js, ไม่มี dependency)
   หน้าที่:
     1) เสิร์ฟไฟล์ ai-predictive-engine.html (same-origin → ไม่มีปัญหา CORS)
     2) เป็น proxy ดึงข้อมูลจริงจาก football-data.org
        (เก็บ API token ไว้ฝั่ง server — ไม่หลุดในเบราว์เซอร์)

   วิธีใช้:
     1) สมัครฟรีรับ token: https://www.football-data.org/client/register
     2) ใส่ token ด้านล่าง (FD_TOKEN) หรือ set env var FD_TOKEN
     3) เปิด terminal ในโฟลเดอร์นี้ แล้วรัน:  node server.js
     4) เปิดเบราว์เซอร์ไปที่:  http://localhost:3000
   ============================================================ */
const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

// token อ่านจาก environment variable เท่านั้น (ไม่ hardcode — กันหลุดบน GitHub)
// - บนเครื่อง: START.bat ตั้ง FD_TOKEN ให้
// - บน cloud (Render): ตั้งในเมนู Environment ของ service
const FD_TOKEN = process.env.FD_TOKEN || "";
const PORT     = process.env.PORT || 3000;

/* ---------- helper: เรียก football-data.org (รอแล้วลองใหม่อัตโนมัติเมื่อชน rate limit) ---------- */
const sleep = ms => new Promise(r=>setTimeout(r, ms));
function fdGet(apiPath, tries=0){
  return new Promise((resolve, reject)=>{
    const req = https.request({
      hostname:"api.football-data.org",
      path:"/v4"+apiPath,
      headers:{ "X-Auth-Token": FD_TOKEN }
    }, res=>{
      let data="";
      res.on("data", c=> data+=c);
      res.on("end", async ()=>{
        // 429 = เกิน 10 req/นาที → รอตามที่ API บอก แล้วลองใหม่ (สูงสุด 3 ครั้ง)
        if(res.statusCode===429 && tries<3){
          const wait=(parseInt(res.headers["x-requestcounter-reset"]||"6",10)+1)*1000;
          await sleep(wait);
          return fdGet(apiPath, tries+1).then(resolve, reject);
        }
        try{
          const json=JSON.parse(data);
          if(res.statusCode>=400) return reject(new Error(json.message||("HTTP "+res.statusCode)));
          resolve(json);
        }catch(e){ reject(new Error("อ่านข้อมูลไม่ได้ (HTTP "+res.statusCode+")")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/* ---------- cache ข้อมูลลีก (กัน rate limit 10 req/นาที) ----------
   แพ็กฟรีใช้ /teams/{id}/matches ไม่ได้ → ต้องดึงทั้งลีกทีเดียวแล้ว cache ไว้
   เก็บทั้ง teams + matches ต่อ 1 ลีก อายุ 5 นาที */
const cache = new Map();          // comp -> { ts, teams, matches }
const TTL = 5*60*1000;

// กลุ่มรายการ: รหัสพิเศษที่รวมหลายรายการเข้าด้วยกัน
// NATIONAL = ทีมชาติทุกรายการ (บอลโลก + ยูโร) → ดึง 5 นัดหลังข้ามทัวร์นาเมนต์ได้
const COMP_GROUPS = { NATIONAL:["WC","EC"] };

/* ============================================================
   แหล่งข้อมูลที่ 2 — API-Football (v3.football.api-sports.io)
   สำหรับลีกเอเชียที่ football-data.org ไม่มี (ญี่ปุ่น/ไทย/เกาหลี)
   แพ็กฟรีดึงได้ถึงฤดูกาล 2023 → ใช้ season 2023 ตายตัว
   ============================================================ */
const AF_TOKEN = process.env.AF_TOKEN || "";
const AF_LEAGUES = {            // code → league id (แพ็กฟรีดึงได้ฤดูกาล 2022-2024)
  JP1: { id:98,  label:"J1 League (ญี่ปุ่น)" },
  TH1: { id:296, label:"Thai League 1" },
  KR1: { id:292, label:"K League 1 (เกาหลี)" },
};
const AF_DEFAULT_SEASON = 2024;        // ใหม่สุดที่แพ็กฟรีให้
const afCache = new Map();

function afGet(qs){
  return new Promise((resolve,reject)=>{
    const req = https.request({ hostname:"v3.football.api-sports.io", path:"/"+qs,
      headers:{ "x-apisports-key":AF_TOKEN } }, res=>{
      let data=""; res.on("data",c=>data+=c);
      res.on("end",()=>{ try{
        const j=JSON.parse(data);
        const errs=j.errors;
        if(errs && (Array.isArray(errs)?errs.length:Object.keys(errs).length))
          return reject(new Error(JSON.stringify(errs)));
        resolve(j.response||[]);
      }catch(e){ reject(new Error("API-Football อ่านข้อมูลไม่ได้")); } });
    });
    req.on("error",reject); req.end();
  });
}

// แปลง season ให้อยู่ในช่วงที่แพ็กฟรีรองรับ (2022-2024)
function afSeason(s){
  const y = parseInt(s, 10);
  return (y >= 2022 && y <= 2024) ? y : AF_DEFAULT_SEASON;
}

// ดึง fixtures ทั้งฤดูกาลของลีก (cache) แล้วสร้างรายชื่อทีมจากในนั้น
async function afFetch(code, season){
  if(!AF_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า AF_TOKEN (API-Football key)");
  const yr=afSeason(season);
  const key=code+":"+yr;
  const hit=afCache.get(key);
  if(hit && Date.now()-hit.ts < TTL) return hit;
  const lg=AF_LEAGUES[code];
  const fixtures=await afGet(`fixtures?league=${lg.id}&season=${yr}`);
  const teamMap=new Map();
  fixtures.forEach(fx=>{ teamMap.set(fx.teams.home.id,fx.teams.home.name);
                         teamMap.set(fx.teams.away.id,fx.teams.away.name); });
  const entry={ ts:Date.now(), fixtures,
                teams:[...teamMap.entries()].map(([id,name])=>({id,name})) };
  afCache.set(key,entry); return entry;
}

async function afTeamList(code, season){
  const { teams }=await afFetch(code, season);
  return teams.map(t=>t.name).sort((a,b)=>a.localeCompare(b));
}

/* ---------- ทีมชาติทั่วโลก (รวมเกมอุ่นเครื่อง/คัดเลือก) ---------- */
async function afFindNational(name){
  const r=await afGet(`teams?search=${encodeURIComponent(name.trim())}`);
  const nat=r.find(t=>t.team.national===true) || r[0];
  if(!nat) throw new Error(`ไม่พบทีมชาติ "${name}"`);
  return { id:nat.team.id, name:nat.team.name };
}

async function afNationalLastFive(name, season){
  if(!AF_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า AF_TOKEN (API-Football key)");
  const team=await afFindNational(name);
  // team+season = ทุกนัดของทีมชาตินั้นในปีนั้น (อุ่นเครื่อง+คัดเลือก+ทัวร์นาเมนต์)
  const fixtures=await afGet(`fixtures?team=${team.id}&season=${afSeason(season)}`);
  const recent=fixtures
    .filter(fx=>fx.fixture.status.short==="FT")
    .sort((a,b)=> new Date(b.fixture.date)-new Date(a.fixture.date))
    .slice(0,5);
  let gf=0,ga=0; const form=[];
  for(const fx of recent){
    const isHome=fx.teams.home.id===team.id;
    const my=isHome?fx.goals.home:fx.goals.away;
    const opp=isHome?fx.goals.away:fx.goals.home;
    gf+=my; ga+=opp; form.push(my>opp?"W":my<opp?"L":"D");
  }
  const n=recent.length||1;
  return { id:team.id, name:team.name, games:recent.length, form:form.join(" "),
           goalsFor:+(gf/n).toFixed(2), goalsAg:+(ga/n).toFixed(2) };
}

// ค้นทีมทั่วไป (สโมสร/ทีมชาติ) เอา id — ใช้กับ H2H
async function afFindTeam(name){
  const r=await afGet(`teams?search=${encodeURIComponent(name.trim())}`);
  if(!r.length) throw new Error(`ไม่พบทีม "${name}"`);
  const q=name.trim().toLowerCase();
  const t=r.find(x=>x.team.name.toLowerCase()===q) || r[0];
  return { id:t.team.id, name:t.team.name };
}

/* ---------- สถิติการเจอกัน (Head-to-Head) ผ่าน API-Football ----------
   ดึงทุกนัดที่ 2 ทีมเคยเจอกัน → สรุป W-D-L, ค่าเฉลี่ยประตู, สูง/ต่ำ, ทั้งคู่ยิง */
async function afHeadToHead(homeName, awayName){
  if(!AF_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า AF_TOKEN (API-Football key)");
  const [h,a]=await Promise.all([afFindTeam(homeName), afFindTeam(awayName)]);
  const fx=(await afGet(`fixtures/headtohead?h2h=${h.id}-${a.id}`))
    .filter(f=>f.fixture.status.short==="FT")
    .sort((x,y)=> new Date(y.fixture.date)-new Date(x.fixture.date));
  let hw=0,d=0,aw=0,tg=0,over=0,btts=0; const recent=[];
  for(const f of fx){
    const homeIsH=f.teams.home.id===h.id;
    const my =homeIsH?f.goals.home:f.goals.away;
    const opp=homeIsH?f.goals.away:f.goals.home;
    if(my>opp) hw++; else if(my===opp) d++; else aw++;
    const tot=f.goals.home+f.goals.away; tg+=tot;
    if(tot>2.5) over++;
    if(f.goals.home>=1 && f.goals.away>=1) btts++;
    if(recent.length<6) recent.push({ date:f.fixture.date.slice(0,10),
      home:f.teams.home.name, away:f.teams.away.name,
      score:`${f.goals.home}-${f.goals.away}` });
  }
  const n=fx.length;
  return { home:h.name, away:a.name, meetings:n, wdl:`${hw}-${d}-${aw}`,
    homeWins:hw, draws:d, awayWins:aw,
    avgGoals: n?+(tg/n).toFixed(2):0,
    over25: n?Math.round(over/n*100):0,
    btts: n?Math.round(btts/n*100):0, recent };
}

async function afLastFive(code, name, season){
  const { fixtures, teams }=await afFetch(code, season);
  const q=name.trim().toLowerCase();
  const team=teams.find(t=>t.name.toLowerCase()===q)
          || teams.find(t=>t.name.toLowerCase().includes(q));
  if(!team) throw new Error(`ไม่พบทีม "${name}" ในลีกนี้`);
  const recent=fixtures
    .filter(fx=>fx.fixture.status.short==="FT" &&
                (fx.teams.home.id===team.id || fx.teams.away.id===team.id))
    .sort((a,b)=> new Date(b.fixture.date)-new Date(a.fixture.date))
    .slice(0,5);
  let gf=0,ga=0; const form=[];
  for(const fx of recent){
    const isHome=fx.teams.home.id===team.id;
    const my=isHome?fx.goals.home:fx.goals.away;
    const opp=isHome?fx.goals.away:fx.goals.home;
    gf+=my; ga+=opp; form.push(my>opp?"W":my<opp?"L":"D");
  }
  const n=recent.length||1;
  return { id:team.id, name:team.name, games:recent.length, form:form.join(" "),
           goalsFor:+(gf/n).toFixed(2), goalsAg:+(ga/n).toFixed(2) };
}

// ดึง 1 รายการเดี่ยว (cache แยกต่อรายการ+ฤดูกาล)
// season: ปีเริ่มฤดูกาล (เช่น 2025 = 2025/26) — ใส่สำหรับลีกสโมสรเพื่อดึงฤดูกาลที่จบแล้ว
async function fetchOne(competition, season){
  const key = competition + ":" + (season || "current");
  const hit = cache.get(key);
  if(hit && Date.now()-hit.ts < TTL) return hit;
  const q = season ? `&season=${season}` : "";
  const teamQ = season ? `?season=${season}` : "";
  const [teamsRes, matchRes] = await Promise.all([
    fdGet(`/competitions/${competition}/teams${teamQ}`),
    fdGet(`/competitions/${competition}/matches?status=FINISHED${q}`)
  ]);
  const entry = { ts:Date.now(), teams:teamsRes.teams, matches:matchRes.matches };
  cache.set(key, entry);
  return entry;
}

// ดึงรายการเดี่ยว หรือกลุ่ม (รวมทีม+นัดจากหลายรายการ, ทีมซ้ำใช้ id เดียวกันทั่วระบบ)
// season ใช้กับลีกสโมสรเท่านั้น (ทัวร์นาเมนต์ทีมชาติมีฤดูกาลตายตัว ไม่ส่ง season)
async function getLeague(competition, season){
  const comps = COMP_GROUPS[competition];
  if(!comps) return fetchOne(competition, season);  // รายการเดี่ยว

  const parts = [];
  for(const c of comps) parts.push(await fetchOne(c)); // กลุ่มทีมชาติ ไม่ใช้ season
  const teamMap = new Map();
  let matches = [];
  for(const p of parts){
    p.teams.forEach(t=> teamMap.set(t.id, t));         // dedupe ทีมด้วย id
    matches = matches.concat(p.matches);
  }
  return { ts:Date.now(), teams:[...teamMap.values()], matches };
}

/* ---------- จับคู่ทีมจากชื่อ ---------- */
function matchTeam(teams, name){
  const q = name.trim().toLowerCase();
  const cand = teams.find(t=>[t.name,t.shortName,t.tla].some(x=>x&&x.toLowerCase()===q))
            || teams.find(t=>[t.name,t.shortName].some(x=>x&&x.toLowerCase().startsWith(q)))
            || teams.find(t=>[t.name,t.shortName].some(x=>x&&x.toLowerCase().includes(q)));
  if(!cand) throw new Error(`ไม่พบทีม "${name}" ในลีกนี้`);
  return cand;
}

/* ---------- สรุป 5 นัดหลัง (ฟอร์ม + ประตูจริง เฉลี่ย) ---------- */
async function lastFive(competition, teamName, season){
  const { teams, matches } = await getLeague(competition, season);
  const team = matchTeam(teams, teamName);
  // กรองเฉพาะนัดของทีมนี้ → เรียงใหม่→เก่า → เอา 5 นัดล่าสุด
  const recent = matches
    .filter(m => m.homeTeam.id===team.id || m.awayTeam.id===team.id)
    .sort((a,b)=> new Date(b.utcDate)-new Date(a.utcDate))
    .slice(0,5);

  let gf=0, ga=0; const form=[];
  for(const m of recent){
    const isHome = m.homeTeam.id===team.id;
    const my  = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const opp = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    gf+=my; ga+=opp;
    form.push(my>opp?"W":my<opp?"L":"D");
  }
  const n=recent.length||1;
  return {
    id:team.id, name:team.name, crest:team.crest,
    games:recent.length,
    form: form.join(" "),
    goalsFor:+(gf/n).toFixed(2),
    goalsAg :+(ga/n).toFixed(2),
  };
}

/* ============================================================
   โมเดล Dixon-Coles ฝั่ง server (สำหรับหน้าทำนายรวม /api/predictions)
   ============================================================ */
const RHO=-0.13, MAXG=8;
function poisson(k,l){ let f=1; for(let i=2;i<=k;i++) f*=i; return Math.pow(l,k)*Math.exp(-l)/f; }
function tau(x,y,lh,la){
  if(x===0&&y===0) return 1-lh*la*RHO;
  if(x===0&&y===1) return 1+lh*RHO;
  if(x===1&&y===0) return 1+la*RHO;
  if(x===1&&y===1) return 1-RHO;
  return 1;
}

// คำนวณพลังรุก/รับ — โมเดลที่ backtest พิสูจน์แล้วแม่นสุด (1X2 = 52.0%, เหนือ baseline +9)
// ใช้ 3 เทคนิคร่วม: cross-season (ข้อมูลหลายฤดูกาล) + time-decay (half-life 365 วัน)
//                  + shrinkage K=6 (ทีมเตะน้อยดึงเข้าค่าเฉลี่ยลีก กันค่าสุดโต่ง)
const HL_MS = 365*86400000, SHRINK_K = 6;
function buildStrengths(matches, asof=Date.now()){
  const fin=matches.filter(m=>m.score.fullTime.home!=null && new Date(m.utcDate).getTime()<asof);
  const wOf=m=> Math.pow(0.5, (asof-new Date(m.utcDate).getTime())/HL_MS);  // นัดเก่าน้ำหนักน้อย
  let shW=0,saW=0,wSum=0;
  fin.forEach(m=>{ const w=wOf(m);
    shW+=m.score.fullTime.home*w; saW+=m.score.fullTime.away*w; wSum+=w; });
  const lgHome=(shW/(wSum||1))||1, lgAway=(saW/(wSum||1))||1, lg=((lgHome+lgAway)/2)||1;
  const map={};
  fin.forEach(m=>{ const w=wOf(m);
    const H=map[m.homeTeam.id]=map[m.homeTeam.id]||{gf:0,ga:0,w:0,n:0};
    const A=map[m.awayTeam.id]=map[m.awayTeam.id]||{gf:0,ga:0,w:0,n:0};
    H.gf+=m.score.fullTime.home*w; H.ga+=m.score.fullTime.away*w; H.w+=w; H.n++;
    A.gf+=m.score.fullTime.away*w; A.ga+=m.score.fullTime.home*w; A.w+=w; A.n++;
  });
  const teams={};
  for(const id in map){ const t=map[id];
    teams[id]={ att:(t.gf+SHRINK_K*lg)/(t.w+SHRINK_K)/lg,
                def:(t.ga+SHRINK_K*lg)/(t.w+SHRINK_K)/lg, n:t.n }; }
  return { lgHome, lgAway, teams };
}

// คำนวณ "ฤดูกาลปัจจุบัน" จากวันที่จริง → แอปตามฤดูกาลใหม่เองทุกปี ไม่ต้องแก้โค้ด
//  - ลีกยุโรป/UCL = ข้ามปี (เริ่ม ก.ค.) → ก.ค.2026 = ฤดูกาล 2026 (2026/27)
//  - บราซิล = ปีปฏิทิน → ใช้ปีปัจจุบันตรงๆ
function currentSeason(comp){
  const d=new Date(), y=d.getFullYear(), m=d.getMonth()+1;
  if(comp==="BSA"||comp==="CLI") return y;    // อเมริกาใต้ = ปีปฏิทิน
  return m>=7 ? y : y-1;
}

// ฤดูกาลที่ใช้รวมเป็นฐานข้อมูล (cross-season) ตามประเภทรายการ
function seasonsFor(comp){
  if(comp==="WC") return [2026];
  if(comp==="EC") return [2024];
  const c=currentSeason(comp);
  return [c-2, c-1, c];             // ลีก + UCL: 3 ฤดูกาลล่าสุด (เพดานแพ็กฟรี)
}
// รวมนัดที่จบแล้วจากหลายฤดูกาล (cache รายฤดูกาลอยู่แล้ว)
async function multiSeasonMatches(comp){
  const all=[];
  for(const s of seasonsFor(comp)){
    try{ const { matches }=await fetchOne(comp, s); all.push(...matches); }
    catch(e){ /* ฤดูกาลนั้นอาจไม่มี/ถูกจำกัด — ข้าม */ }
  }
  return all;
}

// ทำนาย 1 คู่ → 1X2, สูง/ต่ำ, ทั้งคู่ยิง, สกอร์เด่น
function predictPair(hId, aId, S){
  const h=S.teams[hId], a=S.teams[aId];
  if(!h||!a) return null;
  let lh=S.lgHome*h.att*a.def, la=S.lgAway*a.att*h.def;
  lh=Math.max(0.2,Math.min(lh,4.5)); la=Math.max(0.2,Math.min(la,4.5));
  let ph=0,pd=0,pa=0,over=0,btts=0,tot=0,best={p:0,s:"0-0"};
  for(let i=0;i<=MAXG;i++) for(let j=0;j<=MAXG;j++){
    const p=poisson(i,lh)*poisson(j,la)*tau(i,j,lh,la); tot+=p;
    if(i>j) ph+=p; else if(i===j) pd+=p; else pa+=p;
    if(i+j>2.5) over+=p; if(i>=1&&j>=1) btts+=p;
    if(p>best.p) best={p,s:`${i}-${j}`};
  }
  return { pHome:Math.round(ph/tot*100), pDraw:Math.round(pd/tot*100), pAway:Math.round(pa/tot*100),
           over25:Math.round(over/tot*100), btts:Math.round(btts/tot*100),
           score:best.s, gH:h.n, gA:a.n };
}

// วัดความแม่นจริง (walk-forward): เดินทีละนัดที่จบแล้ว ใช้เฉพาะข้อมูลก่อนหน้าทำนาย
// แล้วเทียบผลจริง → คืน accuracy, log-loss, ความแม่นรายตลาด + ตัวอย่างล่าสุด
// แกนกลาง: เดินทำนายย้อนหลัง (target=นัดที่จะเทียบ, hist=ฐานข้อมูลสำหรับพลังทีม)
function gradeWalkForward(target, hist, comp, season){
  const WARMUP = 5;
  let n=0, correct=0, ll=0, ouN=0, ouOK=0, bttsN=0, bttsOK=0;
  const recent=[];
  for(let i=WARMUP; i<target.length; i++){
    const m=target[i];
    const S=buildStrengths(hist, new Date(m.utcDate).getTime());
    const p=predictPair(m.homeTeam.id, m.awayTeam.id, S);
    if(!p) continue;
    const hg=m.score.fullTime.home, ag=m.score.fullTime.away;
    const actual = hg>ag?"H":(hg===ag?"D":"A");
    const probs={H:p.pHome/100, D:p.pDraw/100, A:p.pAway/100};
    const pred = p.pHome>=p.pDraw&&p.pHome>=p.pAway?"H":(p.pAway>=p.pDraw?"A":"D");
    n++; if(pred===actual) correct++;
    ll += -Math.log(Math.max(probs[actual],0.001));
    const over=(hg+ag)>2.5?1:0;       ouN++;   if((p.over25>=50?1:0)===over) ouOK++;
    const bt=(hg>=1&&ag>=1)?1:0;      bttsN++; if((p.btts>=50?1:0)===bt) bttsOK++;
    if(recent.length<10) recent.push({
      date:m.utcDate.slice(0,10), home:m.homeTeam.name, away:m.awayTeam.name,
      score:`${hg}-${ag}`, predScore:p.score,
      pick: pred==="H"?m.homeTeam.name:(pred==="A"?m.awayTeam.name:"เสมอ"),
      hit: pred===actual });
  }
  recent.reverse();
  return {
    comp, season: season||"current", games:n,
    accuracy: n?Math.round(correct/n*1000)/10:0,
    logloss: n?Math.round(ll/n*1000)/1000:0,
    ouAcc: ouN?Math.round(ouOK/ouN*1000)/10:0,
    bttsAcc: bttsN?Math.round(bttsOK/bttsN*1000)/10:0,
    recent
  };
}

// วัดความแม่น — football-data (ยุโรป/บราซิล/บอลโลก/ยูโร)
async function getAccuracy(comp, season){
  if(comp==="WC") season=2026;        // ทัวร์นาเมนต์มีฤดูกาลตายตัว
  if(comp==="EC") season=2024;
  const target = (await fetchOne(comp, season)).matches
    .filter(m=>m.score.fullTime.home!=null)
    .sort((a,b)=> new Date(a.utcDate)-new Date(b.utcDate));
  const hist = await multiSeasonMatches(comp);
  return gradeWalkForward(target, hist, comp, season);
}

// แปลง fixture ของ API-Football → รูปแบบมาตรฐาน (เหมือน football-data)
function afToStd(fx){
  return { utcDate:fx.fixture.date,
    homeTeam:{ id:fx.teams.home.id, name:fx.teams.home.name },
    awayTeam:{ id:fx.teams.away.id, name:fx.teams.away.name },
    score:{ fullTime:{ home:fx.goals.home, away:fx.goals.away } } };
}

// วัดความแม่น — ลีกเอเชีย (API-Football: เจลีก/เกาหลี/ไทย)
async function getAccuracyAF(code, season){
  const { fixtures } = await afFetch(code, season);
  const std = fixtures.filter(f=>f.fixture.status.short==="FT").map(afToStd)
    .sort((a,b)=> new Date(a.utcDate)-new Date(b.utcDate));
  return gradeWalkForward(std, std, code, afSeason(season));  // ฤดูกาลเดียว (แพ็กฟรี)
}

// หน้าทำนายรวม: ดึงนัดที่จะแข่ง + รันโมเดลทุกคู่
async function getPredictions(comp){
  const hist = await multiSeasonMatches(comp);           // ข้ามฤดูกาล → พลังทีม
  const S = buildStrengths(hist);                        // asof = ตอนนี้ (decay ให้นัดล่าสุดหนัก)
  const sched = await fdGet(`/competitions/${comp}/matches?status=SCHEDULED`);
  const out=[];
  for(const m of (sched.matches||[]).slice(0,20)){
    const pred=predictPair(m.homeTeam.id, m.awayTeam.id, S);
    out.push({ date:m.utcDate, home:m.homeTeam.name, away:m.awayTeam.name,
               crestH:m.homeTeam.crest, crestA:m.awayTeam.crest, pred });
  }
  return out;
}

/* ============================================================
   หวยไทย — ดึงผลงวดล่าสุดจาก mthai.com (scrape ฝั่ง server เลี่ยง CORS)
   ⚠️ เป็นการ scrape HTML — อาจต้องปรับ regex ถ้าเว็บเปลี่ยนโครงสร้าง
   ============================================================ */
const TH_MONTHS={"มกราคม":1,"กุมภาพันธ์":2,"มีนาคม":3,"เมษายน":4,"พฤษภาคม":5,"มิถุนายน":6,
  "กรกฎาคม":7,"สิงหาคม":8,"กันยายน":9,"ตุลาคม":10,"พฤศจิกายน":11,"ธันวาคม":12};
function httpsGet(url){
  return new Promise((resolve,reject)=>{
    https.get(url,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0) Chrome/120"}},r=>{
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>resolve(d));
    }).on("error",reject);
  });
}
async function scrapeLottoLatest(){
  const html=await httpsGet("https://lotto.mthai.com/");
  const t=html.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ");
  const grab=(label,len,count=1)=>{
    let pat=label; for(let i=0;i<count;i++) pat+="[^0-9]{0,40}?(\\d{"+len+"})";
    const m=t.match(new RegExp(pat)); return m?m.slice(1):[];
  };
  const first=grab("รางวัลที่ 1",6)[0]||"";
  const last2=grab("เลขท้าย 2 ตัว",2)[0]||"";
  const front3=grab("เลขหน้า 3 ตัว",3,2);
  const last3=grab("เลขท้าย 3 ตัว",3,2);
  const dm=t.match(/(\d{1,2})\s*(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})/);
  let date="", period="";
  if(dm){ const y=(+dm[3])-543, mo=String(TH_MONTHS[dm[2]]).padStart(2,"0"), da=dm[1].padStart(2,"0");
    date=`${y}-${mo}-${da}`; period=`${dm[1]} ${dm[2]} ${dm[3]}`; }
  if(!first||!date) throw new Error("parse ไม่สำเร็จ (เว็บ mthai อาจเปลี่ยนโครงสร้าง)");
  return { date, period, first, last2, front3:[front3[0]||"",front3[1]||""], last3:[last3[0]||"",last3[1]||""] };
}

/* ============================================================
   HTTP SERVER
   ============================================================ */
const MIME={ ".html":"text/html",".js":"text/javascript",".css":"text/css",
  ".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".json":"application/json" };

const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ----- API: /api/lotto/latest → ผลหวยงวดล่าสุด (เปิด CORS ให้ไฟล์หวย local เรียกได้) -----
  if(url.pathname==="/api/lotto/latest"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin","*");
    try{ res.end(JSON.stringify(await scrapeLottoLatest())); }
    catch(e){ res.statusCode=502; res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  // ----- API: /api/teams?comp=PL → รายชื่อทีมทั้งหมดในลีก (สำหรับ dropdown) -----
  if(url.pathname==="/api/teams"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try{
      const comp=url.searchParams.get("comp")||"PL";
      const season=url.searchParams.get("season")||undefined;
      let list;
      if(comp==="INTL"){                           // ทีมชาติทั่วโลก = พิมพ์ค้นเอง (datalist ฝั่งหน้าเว็บ)
        list=[];
      }else if(AF_LEAGUES[comp]){                  // ลีกเอเชีย → API-Football
        list=await afTeamList(comp, season);
      }else{                                       // ยุโรป/ทีมชาติ → football-data.org
        if(!FD_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า FD_TOKEN");
        const { teams }=await getLeague(comp, season);
        list=teams.map(t=>t.name).sort((a,b)=>a.localeCompare(b));
      }
      res.end(JSON.stringify({ teams:list }));
    }catch(e){ res.statusCode=400; res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  // ----- API: /api/predictions?comp=WC → ทำนายทุกนัดที่จะแข่ง -----
  if(url.pathname==="/api/predictions"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try{
      if(!FD_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า FD_TOKEN");
      const comp=url.searchParams.get("comp")||"WC";
      res.end(JSON.stringify({ comp, matches: await getPredictions(comp) }));
    }catch(e){ res.statusCode=400; res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  // ----- API: /api/accuracy?comp=PL&season=2024 → วัดความแม่นจริง -----
  if(url.pathname==="/api/accuracy"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try{
      const comp=url.searchParams.get("comp")||"PL";
      const season=url.searchParams.get("season")||undefined;
      let result;
      if(AF_LEAGUES[comp]){                       // ลีกเอเชีย → API-Football
        result=await getAccuracyAF(comp, season);
      }else{                                       // ยุโรป/บราซิล/บอลโลก/ยูโร → football-data
        if(!FD_TOKEN) throw new Error("ยังไม่ได้ตั้งค่า FD_TOKEN");
        result=await getAccuracy(comp, season);
      }
      res.end(JSON.stringify(result));
    }catch(e){ res.statusCode=400; res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  // ----- API: /api/h2h?home=Thailand&away=Laos → สถิติเจอกัน -----
  if(url.pathname==="/api/h2h"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try{
      const home=url.searchParams.get("home")||"";
      const away=url.searchParams.get("away")||"";
      if(!home||!away) throw new Error("ต้องระบุทั้งสองทีม");
      res.end(JSON.stringify(await afHeadToHead(home, away)));
    }catch(e){ res.statusCode=400; res.end(JSON.stringify({ error:e.message })); }
    return;
  }

  // ----- API: /api/team?comp=PL&name=Liverpool -----
  if(url.pathname==="/api/team"){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try{
      const comp = url.searchParams.get("comp") || "PL";
      const name = url.searchParams.get("name") || "";
      const season = url.searchParams.get("season") || undefined;
      let data;
      if(comp==="INTL"){                            // ทีมชาติทั่วโลก → API-Football
        data = await afNationalLastFive(name, season);
      }else if(AF_LEAGUES[comp]){                   // ลีกเอเชีย → API-Football
        data = await afLastFive(comp, name, season);
      }else{                                        // ยุโรป/ทีมชาติ → football-data.org
        if(!FD_TOKEN)
          throw new Error("ยังไม่ได้ตั้งค่า FD_TOKEN ใน server.js (สมัครฟรีที่ football-data.org)");
        data = await lastFive(comp, name, season);
      }
      res.end(JSON.stringify(data));
    }catch(e){
      res.statusCode=400;
      res.end(JSON.stringify({ error:e.message }));
    }
    return;
  }

  // ----- เสิร์ฟไฟล์หน้าเว็บ (allowlist เท่านั้น — กันเสิร์ฟซอร์ส/token/config) -----
  const PUBLIC = new Set([
    "/ai-predictive-engine.html", "/predictions.html", "/accuracy.html", "/dashboard.html",
    "/space-designer.html",
    "/sw.js", "/icon.svg", "/manifest.webmanifest"
  ]);
  const file = url.pathname==="/" ? "/ai-predictive-engine.html" : url.pathname;
  if(!PUBLIC.has(file)){ res.statusCode=404; res.end("Not found"); return; }
  fs.readFile(path.join(__dirname, file), (err,buf)=>{
    if(err){ res.statusCode=404; res.end("Not found"); return; }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
});

server.listen(PORT, ()=>{
  console.log(`\n  ✅ AI Predictive Engine ทำงานแล้ว`);
  console.log(`  🌐 เปิดเบราว์เซอร์ที่:  http://localhost:${PORT}\n`);
  if(!FD_TOKEN)
    console.log(`  ⚠️  ยังไม่ได้ใส่ FD_TOKEN — สมัครฟรีที่ https://www.football-data.org/client/register\n`);
});
