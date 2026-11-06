import React, { useEffect } from "react";
import { useEditorStore } from "./project/store";
import { PreliminaryBanner } from "./shell/PreliminaryBanner";
import { TopBar } from "./shell/TopBar";
import { RightPanel } from "./shell/RightPanel";
import { BottomConsole } from "./shell/BottomConsole";
import { LibraryPanel } from "./library/LibraryPanel";
import { ViewportSwitcher } from "./viewport/ViewportSwitcher";
import { Canvas2D } from "./cad2d/Canvas2D";
import { Scene3D } from "./cad3d/Scene3D";
import { SimulationBar } from "./shell/SimulationBar";

const AUTOSAVE_MS = 30_000;

export default function App() {
  const project = useEditorStore((s) => s.project);
  const dirty = useEditorStore((s) => s.dirty);
  const viewMode = useEditorStore((s) => s.viewMode);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const setTool = useEditorStore((s) => s.setTool);
  const saveProject = useEditorStore((s) => s.saveProject);
  const refreshProjectList = useEditorStore((s) => s.refreshProjectList);

  useEffect(() => {
    refreshProjectList();
  }, [refreshProjectList]);

  // autosave
  useEffect(() => {
    const id = setInterval(() => {
      if (useEditorStore.getState().dirty) saveProject();
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [saveProject]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") {
        setTool("select");
      } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedIds, deleteSelected, setTool, saveProject]);

  // warn before closing with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="relative flex flex-col h-screen w-screen overflow-hidden bg-ink text-slate-100">
      <PreliminaryBanner />
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LibraryPanel />
        <div className="flex flex-col flex-1 min-w-0">
          <ViewportSwitcher />
          {viewMode !== "2d" && <SimulationBar />}
          <div id="eds-viewport" className="flex flex-1 min-h-0">
            {viewMode === "2d" ? <Canvas2D /> : <Scene3D />}
          </div>
          <BottomConsole />
        </div>
        <RightPanel />
      </div>
      {!project && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-panel border border-border rounded-lg px-6 py-5 text-center pointer-events-auto">
            <div className="text-[15px] font-medium mb-1">Engineering Design Studio</div>
            <div className="text-[12px] text-slate-400">Use <span className="text-accent">File → New</span> or <span className="text-accent">File → Open</span> to begin.</div>
          </div>
        </div>
      )}
    </div>
  );
}
