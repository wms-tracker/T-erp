"""
============================================================
 Football Data Extraction & Analysis (3 ฤดูกาลย้อนหลัง)
 แหล่งข้อมูล: football-data.org (ใช้ token ฟรีที่คุณมีอยู่)
============================================================
ทำอะไร:
  1) ดึงข้อมูลสโมสร 5 ลีกใหญ่ยุโรป (PL, PD, BL1, SA, FL1) 3 ฤดูกาล
     - ผลการแข่งขัน, ประตูได้/เสีย (GF/GA), ตารางคะแนน
  2) ดึงข้อมูลทีมชาติทัวร์นาเมนต์ใหญ่ (เท่าที่แพ็กฟรีให้: WC, EC)
  3) เซฟเป็น CSV 2 ตาราง: club_historical_data.csv / national_team_historical_data.csv
  4) วิเคราะห์: Win Rate สูงสุด 3 ปี + พล็อต Form Trend ท็อป 5

วิธีรัน:
  pip install requests pandas matplotlib seaborn
  set FD_TOKEN=<token ของคุณ>      (Windows CMD)   หรือ
  $env:FD_TOKEN="<token>"          (PowerShell)
  python football_extract.py

หมายเหตุข้อจำกัดแพ็กฟรี:
  - 10 requests/นาที  → โค้ดหน่วงเวลาอัตโนมัติ
  - ?season=<ปีเก่า> อาจถูกบล็อก (เป็นฟีเจอร์เสียเงิน) → โค้ดจะข้ามและแจ้ง
  - Copa America / Nations League / WC Qualifiers ไม่อยู่ในแพ็กฟรี → ข้าม
============================================================
"""
import os
import time
import sys
import requests
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# กัน UnicodeEncodeError บน console ภาษาไทย (cp874) เวลา print อักขระ/emoji
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------- ตั้งค่า ----------
FD_TOKEN = os.environ.get("FD_TOKEN", "")            # อ่านจาก env var (อย่า hardcode token)
BASE = "https://api.football-data.org/v4"
HEADERS = {"X-Auth-Token": FD_TOKEN}

CLUB_COMPS = {            # 5 ลีกใหญ่ยุโรป
    "PL":  "Premier League",
    "PD":  "La Liga",
    "BL1": "Bundesliga",
    "SA":  "Serie A",
    "FL1": "Ligue 1",
}
NATIONAL_COMPS = {        # ทีมชาติ (เท่าที่แพ็กฟรีรองรับ)
    "WC": "FIFA World Cup",
    "EC": "European Championship",
    # "CLI": "Copa America",      # ปกติไม่อยู่ในแพ็กฟรี
    # "UNL": "UEFA Nations League"# ปกติไม่อยู่ในแพ็กฟรี
}
SEASONS = [2023, 2024, 2025]      # 3 ฤดูกาลย้อนหลัง (2023/24, 2024/25, 2025/26)

RATE_DELAY = 6.5                  # วินาที/คำขอ (กันชน 10 req/นาที)


# ---------- helper: เรียก API พร้อม rate-limit + จัดการ error ----------
def fd_get(path, params=None):
    """เรียก football-data.org คืน JSON หรือ None ถ้าถูกบล็อก/ผิดพลาด"""
    try:
        r = requests.get(f"{BASE}{path}", headers=HEADERS, params=params, timeout=20)
    except requests.RequestException as e:
        print(f"    ⚠️  network error: {e}")
        return None
    finally:
        time.sleep(RATE_DELAY)                     # หน่วงทุกครั้งเพื่อกัน rate limit

    if r.status_code == 429:                       # โดน rate limit → รอแล้วลองใหม่ 1 ครั้ง
        print("    ⏳ rate limited, รอ 60 วิ...")
        time.sleep(60)
        return fd_get(path, params)
    if r.status_code == 403:
        print(f"    🔒 ถูกจำกัดสิทธิ์ (แพ็กฟรีไม่รองรับ): {path} {params or ''}")
        return None
    if r.status_code != 200:
        print(f"    ⚠️  HTTP {r.status_code}: {path}")
        return None
    return r.json()


# ============================================================
#  ส่วนที่ 1 — ดึงข้อมูลสโมสร
# ============================================================
def extract_club_data():
    """คืน DataFrame ผลการแข่งขันสโมสร (1 แถว = 1 ทีม/1 นัด)"""
    rows = []
    for code, name in CLUB_COMPS.items():
        for season in SEASONS:
            print(f"  • {name} {season}/{season+1} ...")
            data = fd_get(f"/competitions/{code}/matches",
                          {"season": season, "status": "FINISHED"})
            if not data or "matches" not in data:
                continue
            for m in data["matches"]:
                gh = m["score"]["fullTime"]["home"]
                ga = m["score"]["fullTime"]["away"]
                if gh is None or ga is None:
                    continue
                # สร้าง 2 แถวต่อ 1 นัด: มุมมองของแต่ละทีม (home/away)
                for side in ("home", "away"):
                    is_home = side == "home"
                    gf, gaa = (gh, ga) if is_home else (ga, gh)
                    rows.append({
                        "competition": name,
                        "season": f"{season}/{season+1}",
                        "date": m["utcDate"][:10],
                        "team": m[f"{side}Team"]["name"],
                        "opponent": m[("away" if is_home else "home") + "Team"]["name"],
                        "venue": "Home" if is_home else "Away",
                        "GF": gf,
                        "GA": gaa,
                        "result": "W" if gf > gaa else ("D" if gf == gaa else "L"),
                        "points": 3 if gf > gaa else (1 if gf == gaa else 0),
                    })
    return pd.DataFrame(rows)


# ============================================================
#  ส่วนที่ 2 — ดึงข้อมูลทีมชาติ
# ============================================================
def extract_national_data():
    """คืน DataFrame ผลการแข่งขันทีมชาติในทัวร์นาเมนต์ใหญ่"""
    rows = []
    for code, name in NATIONAL_COMPS.items():
        print(f"  • {name} ...")
        data = fd_get(f"/competitions/{code}/matches", {"status": "FINISHED"})
        if not data or "matches" not in data:
            continue
        for m in data["matches"]:
            gh = m["score"]["fullTime"]["home"]
            ga = m["score"]["fullTime"]["away"]
            if gh is None or ga is None:
                continue
            for side in ("home", "away"):
                is_home = side == "home"
                gf, gaa = (gh, ga) if is_home else (ga, gh)
                rows.append({
                    "tournament": name,
                    "season": str(m.get("season", {}).get("startDate", "")[:4]),
                    "date": m["utcDate"][:10],
                    "stage": m.get("stage", ""),
                    "team": m[f"{side}Team"]["name"],
                    "opponent": m[("away" if is_home else "home") + "Team"]["name"],
                    "GF": gf,
                    "GA": gaa,
                    "result": "W" if gf > gaa else ("D" if gf == gaa else "L"),
                    "points": 3 if gf > gaa else (1 if gf == gaa else 0),
                })
    return pd.DataFrame(rows)


# ============================================================
#  ส่วนที่ 3 — วิเคราะห์ + พล็อต
# ============================================================
def analyse(df, label, out_prefix, min_games=10):
    """คำนวณ Win Rate + พล็อต Form Trend ท็อป 5
       min_games = จำนวนนัดขั้นต่ำที่จะนับ (สโมสร 10, ทีมชาติ 4 เพราะเตะน้อยกว่า)"""
    if df.empty:
        print(f"  (ไม่มีข้อมูล {label} ให้วิเคราะห์)")
        return

    # ----- Win Rate ต่อทีม (ตลอด 3 ปี) -----
    stat = (df.groupby("team")
              .agg(games=("result", "size"),
                   wins=("result", lambda s: (s == "W").sum()),
                   GF=("GF", "sum"), GA=("GA", "sum"),
                   points=("points", "sum"))
              .reset_index())
    stat = stat[stat["games"] >= min_games]           # ตัดทีมที่เล่นน้อยเกินไป
    stat["win_rate"] = (stat["wins"] / stat["games"] * 100).round(1)
    stat["GD"] = stat["GF"] - stat["GA"]
    stat = stat.sort_values("win_rate", ascending=False)

    print(f"\n===== Win Rate สูงสุด — {label} =====")
    print(stat.head(10).to_string(index=False))
    stat.to_csv(f"{out_prefix}_winrate.csv", index=False, encoding="utf-8-sig")

    top5 = stat.head(5)["team"].tolist()
    print(f"\nท็อป 5: {', '.join(top5)}")

    # ----- Form Trend: คะแนนสะสมแบบ rolling ของท็อป 5 ตามเวลา -----
    sns.set_theme(style="darkgrid")
    plt.figure(figsize=(12, 6))
    for team in top5:
        t = df[df["team"] == team].sort_values("date").copy()
        t["match_no"] = range(1, len(t) + 1)
        # ฟอร์ม = ค่าเฉลี่ยคะแนนแบบ rolling 5 นัด (0–3)
        t["form"] = t["points"].rolling(5, min_periods=1).mean()
        plt.plot(t["match_no"], t["form"], marker="", linewidth=2, label=team)

    # ใช้ภาษาอังกฤษในกราฟ เพราะฟอนต์ default ของ matplotlib ไม่รองรับไทย (จะเป็นกล่อง)
    label_en = "Clubs" if label == "สโมสร" else "National Teams"
    plt.title(f"Form Trend (rolling 5 games) - Top 5 {label_en}", fontsize=14)
    plt.xlabel("Match number (chronological)")
    plt.ylabel("Form = avg points/game (0-3)")
    plt.ylim(0, 3.1)
    plt.legend()
    plt.tight_layout()
    plt.savefig(f"{out_prefix}_form_trend.png", dpi=130)
    print(f"📈 บันทึกกราฟ: {out_prefix}_form_trend.png")
    plt.close()


# ============================================================
#  MAIN
# ============================================================
def main():
    if not FD_TOKEN:
        sys.exit("❌ ยังไม่ได้ตั้งค่า FD_TOKEN (env var) — สมัครฟรีที่ football-data.org")

    print("⬇️  กำลังดึงข้อมูลสโมสร (อาจใช้เวลาหลายนาทีเพราะหน่วงกัน rate limit)...")
    club = extract_club_data()
    club.to_csv("club_historical_data.csv", index=False, encoding="utf-8-sig")
    print(f"✅ บันทึก club_historical_data.csv ({len(club)} แถว)\n")

    print("⬇️  กำลังดึงข้อมูลทีมชาติ...")
    national = extract_national_data()
    national.to_csv("national_team_historical_data.csv", index=False, encoding="utf-8-sig")
    print(f"✅ บันทึก national_team_historical_data.csv ({len(national)} แถว)\n")

    analyse(club, "สโมสร", "club", min_games=10)
    analyse(national, "ทีมชาติ", "national", min_games=4)   # ทีมชาติเตะน้อยกว่า
    print("\n🎉 เสร็จสิ้น")


if __name__ == "__main__":
    main()
