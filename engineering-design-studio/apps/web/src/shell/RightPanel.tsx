import React from "react";
import { useEditorStore } from "../project/store";
import { Panel, Field, NumberField, TextField } from "../ui/primitives";
import { formatLength } from "@eds/geometry-core";
import { MATERIAL_PRESETS } from "@eds/schema";

const ALIGN_BUTTONS: { mode: import("../project/store").AlignMode; label: string }[] = [
  { mode: "left", label: "⯇ Left" },
  { mode: "centerX", label: "│ Center H" },
  { mode: "right", label: "Right ⯈" },
  { mode: "top", label: "⯅ Top" },
  { mode: "centerY", label: "─ Center V" },
  { mode: "bottom", label: "Bottom ⯆" },
];

export function RightPanel() {
  const project = useEditorStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const updateObject = useEditorStore((s) => s.updateObject);
  const deleteObject = useEditorStore((s) => s.deleteObject);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  const alignSelected = useEditorStore((s) => s.alignSelected);
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroup = useEditorStore((s) => s.ungroup);
  const activeAssembly = useEditorStore((s) => s.activeAssembly);
  const unit = useEditorStore((s) => s.unit);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const tool = useEditorStore((s) => s.tool);
  const pathDraft = useEditorStore((s) => s.pathDraft);
  const startPathRecording = useEditorStore((s) => s.startPathRecording);
  const finishPathRecording = useEditorStore((s) => s.finishPathRecording);
  const cancelPathRecording = useEditorStore((s) => s.cancelPathRecording);
  const deletePath = useEditorStore((s) => s.deletePath);
  const updatePathSpeed = useEditorStore((s) => s.updatePathSpeed);

  const asm = activeAssembly();
  const obj = asm?.objects.find((o) => o.id === selectedId) ?? null;
  const objPath = asm?.paths.find((p) => p.objectId === obj?.id) ?? null;
  const recordingThisObj = tool === "path" && pathDraft?.objectId === obj?.id;
  const multi = selectedIds.length > 1;
  const locked = !!obj?.locked;
  const isGroup = obj?.kind === "group";
  const groupableCount = asm?.objects.filter((o) => selectedIds.includes(o.id) && !o.locked && !o.parentId && o.kind !== "group").length ?? 0;

  return (
    <Panel title="Properties" className="w-[260px] bg-panel border-l border-border shrink-0">
      {!project && <div className="p-3 text-[12px] text-slate-500">Create or open a project to begin.</div>}
      {project && !obj && !multi && (
        <div className="p-3 text-[12px] text-slate-500">
          Select an object to edit its properties, or place a Box/Cylinder from the library on the left.
        </div>
      )}
      {project && multi && (
        <div className="py-2">
          <div className="px-3 py-1 text-[12px] text-slate-300">{selectedIds.length} objects selected</div>
          {groupableCount > 1 && (
            <div className="px-3 pb-2">
              <button onClick={groupSelected} className="w-full py-1.5 rounded text-[12px] text-slate-200 bg-panel2 hover:bg-panel2/70">
                📦 Group
              </button>
            </div>
          )}
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Align</div>
          <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
            {ALIGN_BUTTONS.map((b) => (
              <button
                key={b.mode}
                onClick={() => alignSelected(b.mode)}
                className="py-1.5 rounded text-[11px] text-slate-200 bg-panel2 hover:bg-panel2/70"
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="px-3 pt-1">
            <button onClick={deleteSelected} className="w-full py-1.5 rounded text-[12px] text-red-400 border border-red-900 hover:bg-red-950/40">
              🗑 Delete Selected
            </button>
          </div>
        </div>
      )}
      {obj && !multi && isGroup && (
        <div className="py-2">
          <div className="px-3 pb-2">
            <button
              onClick={() => toggleLock(obj.id)}
              className={`w-full py-1.5 rounded text-[12px] ${locked ? "text-amber-400 bg-amber-950/30 border border-amber-900" : "text-slate-200 bg-panel2 hover:bg-panel2/70"}`}
            >
              {locked ? "🔒 Locked — click to unlock" : "🔓 Lock Group"}
            </button>
          </div>
          <Field label="Name">
            <TextField value={obj.name} onChange={(v) => updateObject(obj.id, { name: v })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Position (mm)</div>
          <Field label="X">
            <NumberField value={obj.position.x} onChange={(v) => updateObject(obj.id, { position: { ...obj.position, x: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Y">
            <NumberField value={obj.position.y} onChange={(v) => updateObject(obj.id, { position: { ...obj.position, y: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <div className="px-3 py-2 text-[11.5px] text-slate-400">📦 Group of {obj.children?.length ?? 0} object(s)</div>
          <div className="px-3 pb-2">
            <button onClick={() => ungroup(obj.id)} disabled={locked} className="w-full py-1.5 rounded text-[12px] text-slate-200 bg-panel2 hover:bg-panel2/70 disabled:opacity-40 disabled:cursor-not-allowed">
              🗂 Ungroup
            </button>
          </div>
          <div className="px-3 pt-1">
            <button
              onClick={() => deleteObject(obj.id)}
              disabled={locked}
              className="w-full py-1.5 rounded text-[12px] text-red-400 border border-red-900 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🗑 Delete Group (and its objects)
            </button>
          </div>
        </div>
      )}
      {obj && !multi && !isGroup && (
        <div className="py-2">
          <div className="px-3 pb-2">
            <button
              onClick={() => toggleLock(obj.id)}
              className={`w-full py-1.5 rounded text-[12px] ${locked ? "text-amber-400 bg-amber-950/30 border border-amber-900" : "text-slate-200 bg-panel2 hover:bg-panel2/70"}`}
            >
              {locked ? "🔒 Locked — click to unlock" : "🔓 Lock Object"}
            </button>
          </div>
          <Field label="Name">
            <TextField value={obj.name} onChange={(v) => updateObject(obj.id, { name: v })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Position (mm)</div>
          <Field label="X">
            <NumberField value={obj.position.x} onChange={(v) => updateObject(obj.id, { position: { ...obj.position, x: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Y">
            <NumberField value={obj.position.y} onChange={(v) => updateObject(obj.id, { position: { ...obj.position, y: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Z (elev.)">
            <NumberField value={obj.position.z} onChange={(v) => updateObject(obj.id, { position: { ...obj.position, z: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Rotation (°)</div>
          <Field label="Z-axis">
            <NumberField value={obj.rotation.z} onChange={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, z: v } })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Dimension (mm)</div>
          <Field label="Length">
            <NumberField
              value={obj.dimension.length}
              onChange={(v) => updateObject(obj.id, { dimension: { ...obj.dimension, length: Math.max(1, v) } })}
              onCommit={pushHistory}
              disabled={locked}
            />
          </Field>
          <Field label={obj.kind === "cylinder" ? "Diameter" : "Width"}>
            <NumberField
              value={obj.dimension.width}
              onChange={(v) => updateObject(obj.id, { dimension: { ...obj.dimension, width: Math.max(1, v) } })}
              onCommit={pushHistory}
              disabled={locked}
            />
          </Field>
          <Field label="Height">
            <NumberField
              value={obj.dimension.height}
              onChange={(v) => updateObject(obj.id, { dimension: { ...obj.dimension, height: Math.max(1, v) } })}
              onCommit={pushHistory}
              disabled={locked}
            />
          </Field>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Material</div>
          <Field label="Material">
            <TextField value={obj.material ?? ""} onChange={(v) => updateObject(obj.id, { material: v })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Preset">
            <select
              defaultValue=""
              disabled={locked}
              onChange={(e) => {
                const preset = MATERIAL_PRESETS[e.target.value];
                if (!preset) return;
                updateObject(obj.id, { material: preset.label, color: preset.color, metalness: preset.metalness, roughness: preset.roughness });
                pushHistory();
                e.target.value = "";
              }}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 text-[12.5px] text-slate-100 focus:outline-none focus:border-accent disabled:opacity-40"
            >
              <option value="" disabled>
                Apply a preset…
              </option>
              {Object.entries(MATERIAL_PRESETS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={obj.color ?? "#8aa2c8"}
              disabled={locked}
              onChange={(e) => updateObject(obj.id, { color: e.target.value })}
              onBlur={pushHistory}
              className="w-9 h-7 bg-panel2 border border-border rounded disabled:opacity-40"
            />
          </Field>
          <Field label="Metalness">
            <NumberField value={obj.metalness ?? 0.1} step={0.05} onChange={(v) => updateObject(obj.id, { metalness: Math.min(1, Math.max(0, v)) })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Roughness">
            <NumberField value={obj.roughness ?? 0.7} step={0.05} onChange={(v) => updateObject(obj.id, { roughness: Math.min(1, Math.max(0, v)) })} onCommit={pushHistory} disabled={locked} />
          </Field>
          <Field label="Weight (kg)">
            <NumberField value={obj.weight ?? 0} onChange={(v) => updateObject(obj.id, { weight: v })} onCommit={pushHistory} disabled={locked} />
          </Field>

          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">Path (AGV / Forklift)</div>
          <div className="px-3 pb-2">
            {recordingThisObj ? (
              <div className="flex gap-2">
                <button onClick={finishPathRecording} className="flex-1 py-1.5 rounded text-[12px] text-slate-900 bg-accent font-medium">
                  ✓ Finish ({pathDraft!.waypoints.length})
                </button>
                <button onClick={cancelPathRecording} className="flex-1 py-1.5 rounded text-[12px] text-slate-200 bg-panel2 hover:bg-panel2/70">
                  ✕ Cancel
                </button>
              </div>
            ) : objPath ? (
              <div className="space-y-2">
                <div className="text-[11.5px] text-slate-300">🛣 {objPath.waypoints.length} waypoints · {objPath.speedMmPerSec} mm/s</div>
                <Field label="Speed (mm/s)">
                  <NumberField
                    value={objPath.speedMmPerSec}
                    onChange={(v) => updatePathSpeed(objPath.id, Math.max(1, v))}
                    onCommit={pushHistory}
                  />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => startPathRecording(obj.id)} className="flex-1 py-1.5 rounded text-[12px] text-slate-200 bg-panel2 hover:bg-panel2/70">
                    ✏ Re-record
                  </button>
                  <button onClick={() => deletePath(objPath.id)} className="flex-1 py-1.5 rounded text-[12px] text-red-400 border border-red-900 hover:bg-red-950/40">
                    🗑 Delete
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => startPathRecording(obj.id)} className="w-full py-1.5 rounded text-[12px] text-slate-200 bg-panel2 hover:bg-panel2/70">
                🛣 Record Path
              </button>
            )}
          </div>

          <div className="px-3 py-2 text-[11px] text-slate-500">
            Footprint: {formatLength(obj.dimension.length, unit)} × {formatLength(obj.dimension.width, unit)} × {formatLength(obj.dimension.height, unit)}
          </div>

          <div className="px-3 pt-2">
            <button
              onClick={() => deleteObject(obj.id)}
              disabled={locked}
              className="w-full py-1.5 rounded text-[12px] text-red-400 border border-red-900 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🗑 Delete Object
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
