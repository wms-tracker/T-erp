import React, { useState, useMemo } from "react";
import { Tabs } from "../ui/primitives";
import { useEditorStore } from "../project/store";
import { rotatedRectOverlap } from "@eds/geometry-core";

export function BottomConsole() {
  const [tab, setTab] = useState("warnings");
  const project = useEditorStore((s) => s.project);
  const asm = useEditorStore((s) => s.activeAssembly());

  const collisions = useMemo(() => {
    // A group's own entry is a virtual bounding box around its children, not real geometry —
    // checking it for overlap would just flag every grouped object as colliding with its group.
    const objects = (asm?.objects ?? []).filter((o) => o.kind !== "group");
    const found: string[] = [];
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        const rectA = { x: a.position.x, y: a.position.y, length: a.dimension.length, width: a.dimension.width, rotationDeg: a.rotation.z };
        const rectB = { x: b.position.x, y: b.position.y, length: b.dimension.length, width: b.dimension.width, rotationDeg: b.rotation.z };
        if (rotatedRectOverlap(rectA, rectB)) found.push(`⚠ ${a.name} ชนกับ ${b.name} — OBJECT COLLISION`);
      }
    }
    return found;
  }, [asm]);

  const physicalObjects = (asm?.objects ?? []).filter((o) => o.kind !== "group");
  const totalWeight = physicalObjects.reduce((s, o) => s + (o.weight ?? 0), 0);

  return (
    <div className="h-40 bg-panel border-t border-border shrink-0 flex flex-col">
      <Tabs
        tabs={[
          { id: "warnings", label: `Warning${collisions.length ? ` (${collisions.length})` : ""}` },
          { id: "calc", label: "Calculation" },
          { id: "bom", label: "BOM" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex-1 overflow-y-auto p-3 text-[12px] text-slate-400">
        {!project && "No project open."}
        {project && tab === "warnings" && (
          <div className="flex flex-col gap-1">
            {physicalObjects.length === 0 ? (
              <span>No objects yet — nothing to check.</span>
            ) : collisions.length === 0 ? (
              <span className="text-emerald-400">✓ {physicalObjects.length} object(s), 0 geometry warnings.</span>
            ) : (
              collisions.map((c, i) => (
                <span key={i} className="text-amber-400">
                  {c}
                </span>
              ))
            )}
            {physicalObjects.length > 0 && (
              <span className="text-slate-500 mt-1">
                {physicalObjects.length} object(s) · {totalWeight.toLocaleString()} kg total
              </span>
            )}
          </div>
        )}
        {project && tab === "calc" && <span>Engineering Calculator (Motor / Belt / Roller / Structural) arrives in Phase 3.</span>}
        {project && tab === "bom" && <span>BOM Generator arrives in Phase 4 — will list every object in this assembly with qty/weight/cost.</span>}
      </div>
    </div>
  );
}
