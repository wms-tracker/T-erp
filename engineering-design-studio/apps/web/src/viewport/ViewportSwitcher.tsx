import React from "react";
import { useEditorStore, type ViewMode } from "../project/store";
import { exportSvgToPng, exportCanvasToPng } from "./exportImage";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "2d", label: "2D Plan" },
  { id: "iso", label: "Isometric" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
  { id: "walk", label: "🚶 Walkthrough" },
];

export function ViewportSwitcher() {
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const project = useEditorStore((s) => s.project);

  const exportPng = () => {
    const container = document.getElementById("eds-viewport");
    if (!container) return;
    const nameSlug = (project?.meta.name ?? "export").replace(/[^a-z0-9]+/gi, "_");
    const filename = `${nameSlug}_${viewMode}.png`;
    const svg = container.querySelector("svg");
    if (svg) {
      exportSvgToPng(svg, filename);
      return;
    }
    const canvas = container.querySelector("canvas");
    if (canvas) exportCanvasToPng(canvas, filename);
  };

  return (
    <div className="flex items-center gap-1 px-2 h-9 bg-panel2 border-b border-border shrink-0">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setViewMode(v.id)}
          className={`px-3 py-1 text-[12px] rounded ${viewMode === v.id ? "bg-accent text-slate-900 font-medium" : "text-slate-300 hover:bg-panel"}`}
        >
          {v.label}
        </button>
      ))}
      <span className="ml-3 text-[10.5px] text-slate-500">Left / Back / Bottom follow the same pattern — Phase 1 ships the four shown.</span>
      <button
        onClick={exportPng}
        disabled={!project}
        className="ml-auto px-3 py-1 text-[12px] rounded text-slate-300 hover:bg-panel disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📷 Export PNG
      </button>
    </div>
  );
}
