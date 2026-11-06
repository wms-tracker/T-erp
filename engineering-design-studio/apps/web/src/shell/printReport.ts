import type { Project, Assembly } from "@eds/schema";
import { PRELIMINARY_BANNER, PRELIMINARY_DISCLAIMER } from "@eds/schema";
import { formatLength } from "@eds/geometry-core";

interface BomRow {
  type: string;
  name: string;
  qty: number;
  length: number;
  width: number;
  height: number;
  unitWeight: number;
  totalWeight: number;
}

function buildBom(asm: Assembly): BomRow[] {
  const byType = new Map<string, BomRow>();
  // Groups are a selection/movement convenience, not physical equipment — they don't belong in
  // a bill of materials (their children are already counted individually).
  for (const o of asm.objects.filter((o) => o.kind !== "group")) {
    const key = o.type;
    const existing = byType.get(key);
    if (existing) {
      existing.qty += 1;
      existing.totalWeight += o.weight ?? 0;
    } else {
      byType.set(key, {
        type: o.type,
        name: o.name,
        qty: 1,
        length: o.dimension.length,
        width: o.dimension.width,
        height: o.dimension.height,
        unitWeight: o.weight ?? 0,
        totalWeight: o.weight ?? 0,
      });
    }
  }
  return [...byType.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

/** Renders a print-friendly report (project info + BOM) into a hidden same-page iframe and
 *  triggers the browser's print dialog — the user saves it as PDF from there ("Save as PDF" in
 *  the destination picker). A hidden iframe (rather than window.open) sidesteps popup blockers,
 *  which treat even a direct-click-triggered new tab as a popup in some browsers. */
export function printProjectReport(project: Project, asm: Assembly, unit: "mm" | "cm" | "m") {
  const rows = buildBom(asm);
  const totalWeight = rows.reduce((s, r) => s + r.totalWeight, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(project.meta.name)} — Report</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 14px; }
  .banner { background: #fff4e5; border: 1px solid #f0c36d; color: #7a4a00; padding: 8px 12px; font-size: 11.5px; border-radius: 4px; margin-bottom: 18px; }
  .banner b { display: block; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #f2f2f2; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: bold; background: #f8f8f8; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <div class="banner"><b>${esc(PRELIMINARY_BANNER)}</b>${esc(PRELIMINARY_DISCLAIMER)}</div>
  <h1>${esc(project.meta.name)}</h1>
  <div class="meta">Revision ${esc(project.meta.revision)} · ${esc(project.meta.date)} · Assembly: ${esc(asm.name)}</div>
  <table>
    <thead>
      <tr><th>Name</th><th>Type</th><th class="num">Qty</th><th class="num">L</th><th class="num">W</th><th class="num">H</th><th class="num">Unit kg</th><th class="num">Total kg</th></tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.type)}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${esc(formatLength(r.length, unit))}</td>
        <td class="num">${esc(formatLength(r.width, unit))}</td>
        <td class="num">${esc(formatLength(r.height, unit))}</td>
        <td class="num">${r.unitWeight.toLocaleString()}</td>
        <td class="num">${r.totalWeight.toLocaleString()}</td>
      </tr>`
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr><td colspan="2">Total</td><td class="num">${totalQty}</td><td colspan="3"></td><td></td><td class="num">${totalWeight.toLocaleString()} kg</td></tr>
    </tfoot>
  </table>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => iframe.parentNode?.removeChild(iframe);
  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    cleanup();
    return;
  }
  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  iframe.onload = () => {
    frameWindow.focus();
    frameWindow.print();
    setTimeout(cleanup, 1000);
  };
}
