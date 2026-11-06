import React, { useState } from "react";
import { useEditorStore } from "../project/store";
import { TopBarButton, TextField } from "../ui/primitives";
import { printProjectReport } from "./printReport";

const DISABLED_MENUS: { label: string; phase: number }[] = [
  { label: "Design", phase: 2 },
  { label: "Calculate", phase: 3 },
  { label: "Simulation", phase: 7 },
  { label: "Drawing", phase: 8 },
  { label: "BOM", phase: 4 },
];

export function TopBar() {
  const project = useEditorStore((s) => s.project);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const unit = useEditorStore((s) => s.unit);
  const setUnit = useEditorStore((s) => s.setUnit);
  const newProject = useEditorStore((s) => s.newProject);
  const saveProject = useEditorStore((s) => s.saveProject);
  const openProject = useEditorStore((s) => s.openProject);
  const refreshProjectList = useEditorStore((s) => s.refreshProjectList);
  const projectList = useEditorStore((s) => s.projectList);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const historyLen = useEditorStore((s) => s.history.length);
  const activeAssembly = useEditorStore((s) => s.activeAssembly);

  const [openMenu, setOpenMenu] = useState<"new" | "open" | null>(null);
  const [newName, setNewName] = useState("New Project");

  return (
    <div className="relative flex items-center gap-1 px-2 h-11 bg-panel border-b border-border shrink-0">
      <span className="font-semibold text-[14px] text-accent mr-2 whitespace-nowrap">⚙ Engineering Design Studio</span>
      <div className="relative">
        <TopBarButton onClick={() => setOpenMenu(openMenu === "new" ? null : "new")} active={openMenu === "new"}>
          📄 New
        </TopBarButton>
        {openMenu === "new" && (
          <div className="absolute top-9 left-0 z-50 w-56 bg-panel2 border border-border rounded-md p-3 shadow-xl">
            <TextField value={newName} onChange={setNewName} />
            <button
              className="mt-2 w-full bg-accent text-slate-900 text-[12.5px] font-medium rounded py-1.5"
              onClick={async () => {
                await newProject(newName || "New Project");
                setOpenMenu(null);
              }}
            >
              Create Project
            </button>
          </div>
        )}
      </div>
      <div className="relative">
        <TopBarButton
          onClick={async () => {
            if (openMenu !== "open") await refreshProjectList();
            setOpenMenu(openMenu === "open" ? null : "open");
          }}
          active={openMenu === "open"}
        >
          📂 Open
        </TopBarButton>
        {openMenu === "open" && (
          <div className="absolute top-9 left-0 z-50 w-72 bg-panel2 border border-border rounded-md p-2 shadow-xl max-h-80 overflow-y-auto">
            {projectList.length === 0 && <div className="text-[12px] text-slate-500 px-2 py-3">No saved projects yet.</div>}
            {projectList.map((p) => (
              <button
                key={p.id}
                onClick={async () => {
                  await openProject(p.id);
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-panel text-[12.5px]"
              >
                <div className="text-slate-100">{p.name}</div>
                <div className="text-[10.5px] text-slate-500">
                  {p.revision} · {new Date(p.modifiedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <TopBarButton onClick={() => saveProject()} disabled={!project}>
        💾 {saving ? "Saving…" : "Save"}
      </TopBarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <TopBarButton onClick={undo} disabled={historyIndex <= 0}>
        ↩ Undo
      </TopBarButton>
      <TopBarButton onClick={redo} disabled={historyIndex >= historyLen - 1}>
        ↪ Redo
      </TopBarButton>
      <div className="w-px h-5 bg-border mx-1" />
      {DISABLED_MENUS.map((m) => (
        <TopBarButton key={m.label} disabled title={`Available from Phase ${m.phase}`}>
          {m.label}
        </TopBarButton>
      ))}
      <TopBarButton
        onClick={() => {
          const asm = activeAssembly();
          if (project && asm) printProjectReport(project, asm, unit);
        }}
        disabled={!project}
        title="Print a BOM report — use the print dialog's destination picker to save as PDF"
      >
        🖨 Report
      </TopBarButton>
      <div className="ml-auto flex items-center gap-3 pr-2">
        {project && (
          <span className="text-[11px] text-slate-500 whitespace-nowrap">
            {project.meta.name} · {project.meta.revision} · {dirty ? "unsaved changes" : "saved"}
          </span>
        )}
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as "mm" | "cm" | "m")}
          className="bg-panel2 border border-border rounded px-1.5 py-1 text-[12px]"
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
      </div>
    </div>
  );
}
