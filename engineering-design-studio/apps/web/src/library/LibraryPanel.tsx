import React from "react";
import { CATALOG, type CatalogCategory } from "@eds/schema";
import { useEditorStore } from "../project/store";
import { Panel } from "../ui/primitives";

const ICON_BY_TYPE: Record<string, string> = { box: "▭", cylinder: "⬤" };
const ICON_BY_CATEGORY: Record<CatalogCategory, string> = {
  primitive: "◻",
  warehouse: "📦",
  automation: "🤖",
  "material-handling": "🚜",
  safety: "⚠",
};
const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  primitive: "Primitives",
  warehouse: "Warehouse",
  automation: "Automation",
  "material-handling": "Material Handling",
  safety: "Safety",
};
const CATEGORY_ORDER: CatalogCategory[] = ["warehouse", "automation", "material-handling", "safety", "primitive"];

export function LibraryPanel() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const project = useEditorStore((s) => s.project);

  return (
    <Panel title="Object Library" className="w-[200px] bg-panel border-r border-border shrink-0">
      <div className="p-2">
        <button
          onClick={() => setTool("select")}
          className={`w-full mb-2 flex items-center gap-2 px-2 py-2 rounded text-[12.5px] ${
            tool === "select" ? "bg-accent text-slate-900 font-medium" : "bg-panel2 text-slate-200 hover:bg-panel2/70"
          }`}
        >
          <span>⭤</span> Select
        </button>
        <button
          onClick={() => setTool("dimension")}
          disabled={!project}
          className={`w-full mb-3 flex items-center gap-2 px-2 py-2 rounded text-[12.5px] disabled:opacity-40 ${
            tool === "dimension" ? "bg-accent text-slate-900 font-medium" : "bg-panel2 text-slate-200 hover:bg-panel2/70"
          }`}
        >
          <span>📏</span> Dimension
        </button>

        {CATEGORY_ORDER.map((cat) => {
          const items = CATALOG.filter((c) => c.category === cat);
          if (items.length === 0) return null;
          return (
            <details key={cat} open className="mb-1">
              <summary className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 px-1 cursor-pointer select-none hover:text-slate-300">
                {ICON_BY_CATEGORY[cat]} {CATEGORY_LABEL[cat]}
              </summary>
              {items.map((c) => {
                const toolId = `place-${c.type}` as const;
                return (
                  <button
                    key={c.type}
                    disabled={!project}
                    onClick={() => setTool(toolId)}
                    title={`${c.defaultDimension.length}×${c.defaultDimension.width}×${c.defaultDimension.height} mm`}
                    className={`w-full mb-1 flex items-center gap-2 px-2 py-2 rounded text-[12px] text-left disabled:opacity-40 ${
                      tool === toolId ? "bg-accent text-slate-900 font-medium" : "bg-panel2 text-slate-200 hover:bg-panel2/70"
                    }`}
                  >
                    <span>{ICON_BY_TYPE[c.type] ?? ICON_BY_CATEGORY[c.category]}</span>
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </details>
          );
        })}

        <div className="mt-3 text-[10.5px] text-slate-500 px-1 leading-relaxed">
          Select an object, then use "Record Path" in Properties for AGV/Forklift loops. Building elements (wall/door/window) arrive in a later phase.
        </div>
      </div>
    </Panel>
  );
}
