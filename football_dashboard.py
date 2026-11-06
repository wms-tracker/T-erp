"""
============================================================
 Football Dashboard Generator
 อ่าน club_historical_data.csv → สร้าง dashboard.html (ไฟล์เดียว เปิดออฟไลน์ได้)
============================================================
แสดง: ตารางคะแนน 5 ลีกใหญ่ + กราฟแต้มทีมท็อป (ฝังในไฟล์ HTML)
รัน:  python football_dashboard.py   (ต้องมี club_historical_data.csv ก่อน)
============================================================
"""
import sys
import io
import base64
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def standings(df):
    """คำนวณตารางคะแนนจากแถวมุมมองทีม (1 แถว = 1 ทีม/1 นัด)"""
    g = (df.groupby("team")
           .agg(P=("result", "size"),
                W=("result", lambda s: (s == "W").sum()),
                D=("result", lambda s: (s == "D").sum()),
                L=("result", lambda s: (s == "L").sum()),
                GF=("GF", "sum"), GA=("GA", "sum"),
                Pts=("points", "sum"))
           .reset_index())
    g["GD"] = g["GF"] - g["GA"]
    g["WinRate"] = (g["W"] / g["P"] * 100).round(1)
    return g.sort_values(["Pts", "GD"], ascending=False).reset_index(drop=True)


def table_html(g, title):
    rows = ""
    for i, r in g.iterrows():
        rank = i + 1
        medal = "🥇" if rank == 1 else "🥈" if rank == 2 else "🥉" if rank == 3 else f"{rank}"
        hot = "style='color:#4ade80;font-weight:700'" if rank <= 4 else ""
        rows += (f"<tr><td {hot}>{medal}</td><td {hot}>{r['team']}</td>"
                 f"<td>{r['P']}</td><td>{r['W']}</td><td>{r['D']}</td><td>{r['L']}</td>"
                 f"<td>{r['GF']}</td><td>{r['GA']}</td><td>{r['GD']:+d}</td>"
                 f"<td style='color:#22d3ee'>{r['WinRate']}%</td>"
                 f"<td style='font-weight:800'>{r['Pts']}</td></tr>")
    return f"""
    <div class="card">
      <h2>{title}</h2>
      <table>
        <tr><th>#</th><th>ทีม</th><th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th>Win%</th><th>Pts</th></tr>
        {rows}
      </table>
    </div>"""


def chart_b64(tables):
    """กราฟแต้มทีมท็อป 8 ของแต่ละลีก → คืนเป็น base64 PNG"""
    sns.set_theme(style="darkgrid")
    n = len(tables)
    fig, axes = plt.subplots((n + 1) // 2, 2, figsize=(13, 4 * ((n + 1) // 2)))
    axes = axes.flatten()
    for ax, (name, g) in zip(axes, tables.items()):
        top = g.head(8)[::-1]
        ax.barh(top["team"], top["Pts"], color="#22d3ee")
        ax.set_title(name, fontsize=12, color="#e9eefb")
        ax.set_xlabel("Points")
    for ax in axes[n:]:
        ax.axis("off")
    fig.patch.set_facecolor("#0d1224")
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=110, facecolor="#0d1224")
    plt.close()
    return base64.b64encode(buf.getvalue()).decode()


def main():
    try:
        df = pd.read_csv("club_historical_data.csv")
    except FileNotFoundError:
        sys.exit("❌ ไม่พบ club_historical_data.csv — รัน football_extract.py ก่อน")

    season = sorted(df["season"].unique())[-1]      # ฤดูกาลล่าสุด
    df = df[df["season"] == season]
    print(f"สร้าง dashboard ฤดูกาล {season} ...")

    tables = {}
    for comp in sorted(df["competition"].unique()):
        tables[comp] = standings(df[df["competition"] == comp])

    img = chart_b64(tables)
    cards = "".join(table_html(g, comp) for comp, g in tables.items())

    html = f"""<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📊 Football Dashboard — {season}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  :root{{--font:"Plus Jakarta Sans","Noto Sans Thai",system-ui,"Segoe UI",sans-serif}}
  *{{box-sizing:border-box}}
  body{{margin:0;min-height:100vh;color:#eef2fb;font-family:var(--font);line-height:1.5;-webkit-font-smoothing:antialiased;
    background:radial-gradient(900px 480px at 12% -8%,rgba(74,222,128,.10),transparent),
      radial-gradient(900px 520px at 88% 4%,rgba(34,211,238,.12),transparent),
      linear-gradient(165deg,#0a0e1f,#121a35);background-attachment:fixed;padding:28px 15px 60px}}
  .wrap{{max-width:1000px;margin:0 auto}}
  h1{{text-align:center;font-weight:800;letter-spacing:-.5px;font-size:clamp(24px,5vw,32px);margin:.1em 0;
    background:linear-gradient(90deg,#4ade80,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}}
  .sub{{text-align:center;color:#9aa7c7;margin-bottom:24px;font-size:13px}}
  a{{color:#22d3ee;text-decoration:none}} a:hover{{text-decoration:underline}}
  .card{{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(12px);
    border-radius:16px;padding:18px;margin-bottom:16px;overflow-x:auto;box-shadow:0 10px 30px rgba(0,0,0,.35)}}
  .card h2{{color:#22d3ee;font-size:16px;margin:0 0 14px;font-weight:700}}
  table{{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}}
  th,td{{padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center}}
  th{{color:#9aa7c7;font-weight:600}}
  tr:hover td{{background:rgba(255,255,255,.03)}}
  td:nth-child(2){{text-align:left;font-weight:600}}
  img{{width:100%;border-radius:14px;margin-bottom:18px}}
  .foot{{text-align:center;color:#9aa7c7;font-size:12px;margin-top:20px}}
</style></head><body><div class="wrap">
  <h1>📊 Football Dashboard</h1>
  <div class="sub">ตารางคะแนน 5 ลีกใหญ่ยุโรป · ฤดูกาล {season} · จาก dataset จริง (football-data.org) · <a href="/">← หน้าหลัก</a></div>
  <div class="card"><h2>🏆 แต้มทีมท็อป 8 แต่ละลีก</h2><img src="data:image/png;base64,{img}"></div>
  {cards}
  <div class="foot">สร้างจาก club_historical_data.csv · 4 อันดับแรกไฮไลต์เขียว (โซนยุโรป)</div>
</div></body></html>"""

    with open("dashboard.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ สร้าง dashboard.html สำเร็จ ({len(tables)} ลีก) — เปิดในเบราว์เซอร์ได้เลย")


if __name__ == "__main__":
    main()
