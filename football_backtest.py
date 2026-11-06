"""
============================================================
 Backtest โมเดล Dixon-Coles กับข้อมูลจริง (club_historical_data.csv)
============================================================
แนวคิด (walk-forward / out-of-sample):
  - ประมาณค่าพลังรุก/รับของแต่ละทีม จากนัดที่ "เกิดก่อนหน้า" ในฤดูกาลนั้น (expanding window)
  - ทำนายผล 1X2 ของนัดถัดไป แล้วเทียบกับผลจริง (โมเดลไม่เคยเห็นผลนัดนั้น)
  - วัด: ความแม่น (accuracy), Log-Loss, และกราฟ Calibration

รัน:
  python football_backtest.py
  (ต้องมี club_historical_data.csv ที่ได้จาก football_extract.py ก่อน)
============================================================
"""
import sys
import math
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

RHO = -0.13          # ค่าปรับ Dixon-Coles (เท่ากับในแอป)
MAX_GOALS = 8
WARMUP = 40          # ข้ามนัดต้นฤดูกาล (ยังไม่มีข้อมูลพอประมาณค่าพลังทีม)


# ---------- Dixon-Coles tau + Poisson ----------
def poisson(k, lam):
    return lam**k * math.exp(-lam) / math.factorial(k)

def tau(x, y, lh, la):
    if x == 0 and y == 0: return 1 - lh*la*RHO
    if x == 0 and y == 1: return 1 + lh*RHO
    if x == 1 and y == 0: return 1 + la*RHO
    if x == 1 and y == 1: return 1 - RHO
    return 1.0

def market_probs(lh, la):
    """คืนความน่าจะเป็นทุกตลาดจาก score matrix + DC:
       P_home, P_draw, P_away, P(Over2.5), P(BTTS yes)"""
    ph = pd_ = pa = over = btts = tot = 0.0
    for i in range(MAX_GOALS+1):
        for j in range(MAX_GOALS+1):
            p = poisson(i, lh) * poisson(j, la) * tau(i, j, lh, la)
            tot += p
            if i > j: ph += p
            elif i == j: pd_ += p
            else: pa += p
            if i + j > 2.5: over += p
            if i >= 1 and j >= 1: btts += p
    return ph/tot, pd_/tot, pa/tot, over/tot, btts/tot


def load_matches(path="club_historical_data.csv"):
    """CSV มี 2 แถว/นัด (มุมเหย้า+เยือน) → ดึงเฉพาะมุมเหย้าให้เป็น 1 แถว/นัด"""
    df = pd.read_csv(path)
    home = df[df["venue"] == "Home"].copy()
    home = home.rename(columns={"team": "home", "opponent": "away",
                                "GF": "hg", "GA": "ag"})
    home = home[["competition", "season", "date", "home", "away", "hg", "ag"]]
    home["date"] = pd.to_datetime(home["date"])
    return home.sort_values("date").reset_index(drop=True)


def backtest(matches):
    """เดินทีละนัดในแต่ละฤดูกาล: ประมาณพลังทีมจากอดีต → ทำนาย → เทียบจริง"""
    records = []
    # แยกทำทีละ ลีก+ฤดูกาล (พลังทีมเทียบภายในลีก/ฤดูกาลเดียวกัน)
    for (comp, season), g in matches.groupby(["competition", "season"]):
        g = g.sort_values("date").reset_index(drop=True)
        for idx in range(len(g)):
            past = g.iloc[:idx]
            if len(past) < WARMUP:
                continue
            # league baselines
            lg_home = past["hg"].mean()
            lg_away = past["ag"].mean()
            if lg_home <= 0 or lg_away <= 0:
                continue
            row = g.iloc[idx]
            h, a = row["home"], row["away"]
            asof = row["date"]

            # พลังรุก/รับ (รวมเหย้า+เยือน) — โมเดลที่พิสูจน์แล้วแม่นสุด
            lg_goal = (lg_home + lg_away) / 2
            def att_def(team):
                hp = past[past["home"] == team]
                ap = past[past["away"] == team]
                gf = pd.concat([hp["hg"], ap["ag"]])
                ga = pd.concat([hp["ag"], ap["hg"]])
                if len(gf) < 3:
                    return None
                return (gf.mean()/lg_goal, ga.mean()/lg_goal)

            sh, sa = att_def(h), att_def(a)
            if sh is None or sa is None:
                continue
            lh = lg_home * sh[0] * sa[1]
            la = lg_away * sa[0] * sh[1]
            lh = min(max(lh, 0.2), 4.5)
            la = min(max(la, 0.2), 4.5)

            ph, pdr, pa, p_over, p_btts = market_probs(lh, la)
            actual = "H" if row["hg"] > row["ag"] else ("D" if row["hg"] == row["ag"] else "A")
            pred = ["H", "D", "A"][int(np.argmax([ph, pdr, pa]))]
            p_actual = {"H": ph, "D": pdr, "A": pa}[actual]
            total_goals = row["hg"] + row["ag"]
            records.append({"comp": comp, "season": season, "actual": actual,
                            "pred": pred, "p_home": ph, "p_actual": max(p_actual, 1e-9),
                            "correct": int(pred == actual),
                            # ตลาด Over/Under 2.5
                            "p_over": p_over, "over_actual": int(total_goals > 2.5),
                            # ตลาด BTTS (ทั้งคู่ยิง)
                            "p_btts": p_btts, "btts_actual": int(row["hg"] >= 1 and row["ag"] >= 1)})
    return pd.DataFrame(records)


def report(res):
    n = len(res)
    acc = res["correct"].mean()
    logloss = -np.log(res["p_actual"]).mean()
    # baseline: เดา "เหย้าชนะเสมอ" (ฐานนิยมในฟุตบอล)
    base = (res["actual"] == "H").mean()

    print(f"\n===== ผล Backtest ({n:,} นัด out-of-sample) =====")
    print(f"  ความแม่น (1X2 accuracy) : {acc*100:.1f}%")
    print(f"  Baseline (ทายเหย้าล้วน) : {base*100:.1f}%")
    print(f"  Log-Loss (ยิ่งต่ำยิ่งดี) : {logloss:.4f}")
    print(f"  (อ้างอิง: ทายมั่ว 3 ทาง log-loss = {math.log(3):.4f})")

    # ----- เปรียบเทียบความแม่นแต่ละตลาด (ตลาด 2 ทาง: ทาย "ใช่" ถ้า prob>0.5) -----
    def eval_binary(p_col, y_col, name):
        p = res[p_col].values
        y = res[y_col].values
        pred = (p > 0.5).astype(int)
        acc_b = (pred == y).mean()
        base_b = max(y.mean(), 1 - y.mean())          # เดาฝั่งที่พบบ่อยสุด
        brier = np.mean((p - y) ** 2)                  # ยิ่งต่ำยิ่งดี (0=สมบูรณ์)
        ll = -np.mean(y*np.log(np.clip(p,1e-9,1)) + (1-y)*np.log(np.clip(1-p,1e-9,1)))
        return {"name": name, "acc": acc_b, "base": base_b, "brier": brier, "ll": ll}

    markets = [
        eval_binary("p_home", None, "1X2 (เหย้าชนะ)") if False else None,  # 1X2 รายงานแยกด้านบนแล้ว
        eval_binary("p_over", "over_actual", "Over/Under 2.5"),
        eval_binary("p_btts", "btts_actual", "ทั้งคู่ยิง (BTTS)"),
    ]
    markets = [m for m in markets if m]
    print(f"\n----- ความแม่นแยกตามตลาด (โมเดลเก่งตลาดไหนสุด) -----")
    print(f"  {'ตลาด':22} {'แม่น':>7} {'baseline':>9} {'Brier↓':>8} {'LogLoss↓':>9}")
    for m in sorted(markets, key=lambda x: -(x['acc']-x['base'])):
        edge = (m['acc']-m['base'])*100
        print(f"  {m['name']:22} {m['acc']*100:6.1f}% {m['base']*100:8.1f}% "
              f"{m['brier']:8.3f} {m['ll']:9.4f}   (เหนือ baseline {edge:+.1f})")
    best = max(markets, key=lambda x: x['acc']-x['base'])
    print(f"\n  🏆 โมเดลเก่งสุดที่ตลาด: {best['name']} "
          f"(แม่น {best['acc']*100:.1f}% เหนือ baseline {(best['acc']-best['base'])*100:+.1f} จุด)")

    # ----- Calibration: P(home win) ที่ทำนาย vs ความถี่จริง -----
    res = res.copy()
    res["bin"] = pd.cut(res["p_home"], bins=np.linspace(0, 1, 11))
    cal = res.groupby("bin", observed=True).agg(
        pred=("p_home", "mean"),
        obs=("actual", lambda s: (s == "H").mean()),
        n=("actual", "size")).dropna()

    sns.set_theme(style="darkgrid")
    plt.figure(figsize=(7, 7))
    plt.plot([0, 1], [0, 1], "--", color="gray", label="Perfect calibration")
    plt.plot(cal["pred"], cal["obs"], "o-", color="#22d3ee", linewidth=2,
             markersize=8, label="Model")
    plt.title(f"Calibration - Home Win Probability\n{n:,} matches, accuracy {acc*100:.1f}%")
    plt.xlabel("Predicted P(home win)")
    plt.ylabel("Observed frequency")
    plt.xlim(0, 1); plt.ylim(0, 1)
    plt.legend()
    plt.tight_layout()
    plt.savefig("backtest_calibration.png", dpi=130)
    print("📈 บันทึกกราฟ: backtest_calibration.png")
    plt.close()


def main():
    try:
        matches = load_matches()
    except FileNotFoundError:
        sys.exit("❌ ไม่พบ club_historical_data.csv — รัน football_extract.py ก่อน")
    print(f"โหลด {len(matches):,} นัด · กำลัง backtest (อาจใช้เวลาสักครู่)...")
    res = backtest(matches)
    if res.empty:
        sys.exit("❌ ข้อมูลไม่พอ backtest")
    report(res)
    print("\n🎉 เสร็จสิ้น")


if __name__ == "__main__":
    main()
