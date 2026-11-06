import React, { useRef, useState, useCallback, useEffect } from "react";
import { useEditorStore } from "../project/store";
import { resolveAnchor, type ObjectDataModel, type Anchor } from "@eds/schema";
import { dist2, formatLength } from "@eds/geometry-core";

interface ScreenXform {
  scale: number; // px per mm
  offsetX: number;
  offsetY: number;
}

const ANCHORS: Anchor["anchor"][] = ["center", "minX", "maxX", "minY", "maxY"];

function localHitTest(obj: ObjectDataModel, wx: number, wy: number): boolean {
  const dx = wx - obj.position.x;
  const dy = wy - obj.position.y;
  const rad = (-(obj.rotation.z ?? 0) * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  if (obj.kind === "cylinder") {
    return Math.hypot(dx, dy) <= obj.dimension.length / 2;
  }
  return Math.abs(lx) <= obj.dimension.length / 2 && Math.abs(ly) <= obj.dimension.width / 2;
}

function nearestAnchor(obj: ObjectDataModel, wx: number, wy: number): Anchor["anchor"] {
  let best: Anchor["anchor"] = "center";
  let bestD = Infinity;
  for (const a of ANCHORS) {
    const p = resolveAnchor(obj, a);
    const d = dist2({ x: wx, y: wy }, { x: p.x, y: p.y });
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function Canvas2D() {
  const project = useEditorStore((s) => s.project);
  const asm = useEditorStore((s) => s.activeAssembly());
  const tool = useEditorStore((s) => s.tool);
  const unit = useEditorStore((s) => s.unit);
  const gridMm = useEditorStore((s) => s.gridMm);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const pendingAnchor = useEditorStore((s) => s.pendingAnchor);
  const pathDraft = useEditorStore((s) => s.pathDraft);
  const select = useEditorStore((s) => s.select);
  const addObjectAt = useEditorStore((s) => s.addObjectAt);
  const updateObject = useEditorStore((s) => s.updateObject);
  const setPendingAnchor = useEditorStore((s) => s.setPendingAnchor);
  const addDimension = useEditorStore((s) => s.addDimension);
  const addPathWaypoint = useEditorStore((s) => s.addPathWaypoint);
  const finishPathRecording = useEditorStore((s) => s.finishPathRecording);
  const cancelPathRecording = useEditorStore((s) => s.cancelPathRecording);
  const snap = useEditorStore((s) => s.snap);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  const svgRef = useRef<SVGSVGElement>(null);
  const [xform, setXform] = useState<ScreenXform>({ scale: 0.28, offsetX: 420, offsetY: 260 });
  const dragRef = useRef<{
    mode: "pan" | "move";
    startClientX: number;
    startClientY: number;
    startOffset?: { x: number; y: number };
    objId?: string;
    startPos?: { x: number; y: number };
    moved?: boolean;
  } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    // svgRef.current is null on the very first render pass; re-render once mounted so the
    // grid (which reads getBoundingClientRect()) has real dimensions to work with.
    forceRerender((n) => n + 1);
    const onResize = () => forceRerender((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(true);
      if (e.code === "Escape") cancelPathRecording();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const w2s = useCallback((wx: number, wy: number) => ({ x: xform.offsetX + wx * xform.scale, y: xform.offsetY + wy * xform.scale }), [xform]);
  const s2w = useCallback((sx: number, sy: number) => ({ x: (sx - xform.offsetX) / xform.scale, y: (sy - xform.offsetY) / xform.scale }), [xform]);

  const clientToWorld = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return s2w(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!project || !asm) return;
    if (e.button === 1 || spaceHeld) {
      dragRef.current = { mode: "pan", startClientX: e.clientX, startClientY: e.clientY, startOffset: { x: xform.offsetX, y: xform.offsetY } };
      return;
    }
    const w = clientToWorld(e);

    if (tool.startsWith("place-")) {
      addObjectAt(tool.slice("place-".length), { x: snap(w.x), y: snap(w.y), z: 0 });
      return;
    }

    if (tool === "path") {
      addPathWaypoint({ x: snap(w.x), y: snap(w.y) });
      return;
    }

    if (tool === "dimension") {
      const hit = [...asm.objects].reverse().find((o) => o.kind !== "group" && localHitTest(o, w.x, w.y));
      if (!hit) return;
      const anchor: Anchor = { objectId: hit.id, anchor: nearestAnchor(hit, w.x, w.y) };
      if (!pendingAnchor) setPendingAnchor(anchor);
      else {
        addDimension(pendingAnchor, anchor);
      }
      return;
    }

    // select tool — clicking a grouped child selects/drags its group instead, since the group
    // (not the child) is the thing with a movable identity once objects are grouped.
    const hit = [...asm.objects].reverse().find((o) => o.kind !== "group" && localHitTest(o, w.x, w.y));
    if (hit) {
      const target = hit.parentId ? asm.objects.find((o) => o.id === hit.parentId) ?? hit : hit;
      select(target.id, e.shiftKey);
      if (!target.locked && !e.shiftKey) {
        dragRef.current = { mode: "move", startClientX: e.clientX, startClientY: e.clientY, objId: target.id, startPos: { x: target.position.x, y: target.position.y } };
      }
    } else if (!e.shiftKey) {
      select(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan" && drag.startOffset) {
      setXform((s) => ({ ...s, offsetX: drag.startOffset!.x + (e.clientX - drag.startClientX), offsetY: drag.startOffset!.y + (e.clientY - drag.startClientY) }));
      return;
    }
    if (drag.mode === "move" && drag.objId && drag.startPos) {
      const dxWorld = (e.clientX - drag.startClientX) / xform.scale;
      const dyWorld = (e.clientY - drag.startClientY) / xform.scale;
      const nx = snap(drag.startPos.x + dxWorld);
      const ny = snap(drag.startPos.y + dyWorld);
      if (nx !== drag.startPos.x || ny !== drag.startPos.y) {
        drag.moved = true;
        updateObject(drag.objId, { position: { x: nx, y: ny, z: 0 } });
      }
    }
  };

  const onPointerUp = () => {
    // only commit a history entry if the object actually moved — a plain click-to-select
    // (pointerdown+pointerup with no drag) must not push a no-op snapshot.
    if (dragRef.current?.mode === "move" && dragRef.current.moved) pushHistory();
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = s2w(sx, sy);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setXform((s) => {
      const scale = Math.max(0.01, Math.min(3, s.scale * factor));
      // keep the world point under the cursor fixed on screen while zooming
      return { scale, offsetX: sx - before.x * scale, offsetY: sy - before.y * scale };
    });
  };

  // grid lines
  const gridLines: JSX.Element[] = [];
  if (svgRef.current) {
    const rect = svgRef.current.getBoundingClientRect();
    const topLeft = s2w(0, 0);
    const botRight = s2w(rect.width, rect.height);
    const minor = gridMm;
    if (minor * xform.scale >= 6) {
      const startX = Math.floor(topLeft.x / minor) * minor;
      for (let x = startX; x <= botRight.x; x += minor) {
        const sx = w2s(x, 0).x;
        gridLines.push(<line key={`gx${x}`} x1={sx} y1={0} x2={sx} y2={rect.height} stroke={x === 0 ? "#3a4a5a" : "#1e2733"} strokeWidth={x === 0 ? 1.4 : 1} />);
      }
      const startY = Math.floor(topLeft.y / minor) * minor;
      for (let y = startY; y <= botRight.y; y += minor) {
        const sy = w2s(0, y).y;
        gridLines.push(<line key={`gy${y}`} x1={0} y1={sy} x2={rect.width} y2={sy} stroke={y === 0 ? "#3a4a5a" : "#1e2733"} strokeWidth={y === 0 ? 1.4 : 1} />);
      }
    }
  }

  return (
    <div className="relative flex-1 bg-[#0e1318] overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => { if (tool === "path") finishPathRecording(); }}
        onWheel={onWheel}
        style={{ cursor: tool === "select" ? "default" : "crosshair" }}
      >
        <g>{gridLines}</g>
        {asm?.objects.filter((o) => o.kind !== "group").map((o) => {
          const c = w2s(o.position.x, o.position.y);
          const isSel = selectedIds.includes(o.id) || (!!o.parentId && selectedIds.includes(o.parentId));
          const stroke = isSel ? "#4da3ff" : o.locked ? "#f59e0b" : "rgba(0,0,0,.5)";
          const dash = o.locked ? "4 2" : undefined;
          if (o.kind === "cylinder") {
            const r = (o.dimension.length / 2) * xform.scale;
            return (
              <g key={o.id} transform={`translate(${c.x} ${c.y})`}>
                <circle r={r} fill={o.color ?? "#c8a06a"} stroke={stroke} strokeWidth={isSel ? 2.5 : 1} strokeDasharray={dash} />
                {o.locked && <text x={0} y={4} textAnchor="middle" fontSize={11}>🔒</text>}
              </g>
            );
          }
          const w = o.dimension.length * xform.scale;
          const h = o.dimension.width * xform.scale;
          return (
            <g key={o.id} transform={`translate(${c.x} ${c.y}) rotate(${o.rotation.z ?? 0})`}>
              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill={o.color ?? "#8aa2c8"} stroke={stroke} strokeWidth={isSel ? 2.5 : 1} strokeDasharray={dash} />
              {o.locked && w > 20 && h > 20 && (
                <text x={w / 2 - 10} y={-h / 2 + 14} textAnchor="middle" fontSize={11}>🔒</text>
              )}
              {w > 30 && h > 16 && (
                <text x={0} y={4} textAnchor="middle" fontSize={11} fill="rgba(0,0,0,.6)">
                  {o.name}
                </text>
              )}
            </g>
          );
        })}
        {asm?.dimensions.map((dim) => {
          const objA = asm.objects.find((o) => o.id === dim.refA.objectId);
          const objB = asm.objects.find((o) => o.id === dim.refB.objectId);
          if (!objA || !objB) return null;
          const pa = resolveAnchor(objA, dim.refA.anchor);
          const pb = resolveAnchor(objB, dim.refB.anchor);
          const sA = w2s(pa.x, pa.y);
          const sB = w2s(pb.x, pb.y);
          const mm = dist2({ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y });
          const mx = (sA.x + sB.x) / 2;
          const my = (sA.y + sB.y) / 2;
          return (
            <g key={dim.id}>
              <line x1={sA.x} y1={sA.y} x2={sB.x} y2={sB.y} stroke="#22c55e" strokeWidth={1.4} strokeDasharray="5 3" />
              <circle cx={sA.x} cy={sA.y} r={3} fill="#22c55e" />
              <circle cx={sB.x} cy={sB.y} r={3} fill="#22c55e" />
              <rect x={mx - 34} y={my - 16} width={68} height={16} fill="#0e1318" stroke="#22c55e" strokeWidth={0.6} />
              <text x={mx} y={my - 4} textAnchor="middle" fontSize={11} fill="#22c55e">
                {formatLength(mm, unit)}
              </text>
            </g>
          );
        })}
        {asm?.paths.map((path) => {
          const pts = path.waypoints.map((wp) => w2s(wp.x, wp.y));
          const closed = pts.length > 1 ? `${pts.map((p) => `${p.x},${p.y}`).join(" ")} ${pts[0].x},${pts[0].y}` : "";
          return (
            <g key={path.id}>
              <polyline points={closed} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="8 5" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#f59e0b" />
              ))}
            </g>
          );
        })}
        {pathDraft && (() => {
          const pts = pathDraft.waypoints.map((wp) => w2s(wp.x, wp.y));
          return (
            <g>
              <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fbbf24" stroke="#0e1318" strokeWidth={1} />
              ))}
            </g>
          );
        })()}
        {pendingAnchor && (() => {
          const obj = asm?.objects.find((o) => o.id === pendingAnchor.objectId);
          if (!obj) return null;
          const p = resolveAnchor(obj, pendingAnchor.anchor);
          const s = w2s(p.x, p.y);
          return <circle cx={s.x} cy={s.y} r={6} fill="none" stroke="#22c55e" strokeWidth={2} />;
        })()}
      </svg>
      {!project && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm pointer-events-none">
          Create or open a project from the File menu to start drawing.
        </div>
      )}
      {project && tool === "dimension" && (
        <div className="absolute top-2 left-2 text-[11px] text-emerald-400 bg-black/40 px-2 py-1 rounded">
          {pendingAnchor ? "Click the second anchor to complete the dimension." : "Click an object's edge/center for the first anchor."}
        </div>
      )}
      {project && tool === "path" && (
        <div className="absolute top-2 left-2 text-[11px] text-amber-400 bg-black/40 px-2 py-1 rounded">
          Click to add waypoints ({pathDraft?.waypoints.length ?? 0} so far) — double-click to finish the loop.
        </div>
      )}
      {project && tool === "select" && selectedIds.length > 1 && (
        <div className="absolute top-2 left-2 text-[11px] text-sky-400 bg-black/40 px-2 py-1 rounded">
          {selectedIds.length} objects selected — use Align in Properties, or Shift+Click to adjust the selection.
        </div>
      )}
    </div>
  );
}
