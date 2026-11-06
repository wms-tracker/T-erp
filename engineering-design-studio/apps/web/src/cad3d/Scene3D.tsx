import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Grid, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useEditorStore, type ViewMode } from "../project/store";
import { Box3D, Cylinder3D } from "./Primitives3D";
import { CompositeAsset } from "./Composite3D";
import { useSimulationStore } from "../project/simulationStore";
import { resolveAnchor, type ObjectDataModel, type Path } from "@eds/schema";
import { formatLength, dist2, pathPositionAndHeading } from "@eds/geometry-core";

const EYE_HEIGHT_MM = 1700;
const WALK_SPEED_MMPS = 1400; // ~brisk human walking pace
const RUN_SPEED_MMPS = 3000;

/** WASD + mouse-look (via pointer lock) at a fixed eye height — a simple first-person walkthrough
 *  of the warehouse floor. No collision with objects yet (needs the building/wall phase first). */
function WalkthroughCamera() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.y = EYE_HEIGHT_MM;
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current = {};
    };
  }, [camera]);

  useFrame((_, delta) => {
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? RUN_SPEED_MMPS : WALK_SPEED_MMPS) * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(forward, speed);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(forward, -speed);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -speed);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, speed);
    camera.position.y = EYE_HEIGHT_MM;
  });

  return <PointerLockControls />;
}

/** Renders one object with the primitive matching its `kind` — shared by static objects and
 *  the path-driven wrapper below so both go through the exact same mesh-building logic. */
function RenderObject({ obj, selected, onSelect }: { obj: ObjectDataModel; selected: boolean; onSelect: (shiftKey: boolean) => void }) {
  if (obj.kind === "cylinder") return <Cylinder3D obj={obj} selected={selected} onSelect={onSelect} />;
  if (obj.kind === "composite") return <CompositeAsset obj={obj} selected={selected} onSelect={onSelect} />;
  return <Box3D obj={obj} selected={selected} onSelect={onSelect} />;
}

const PATH_UPDATE_HZ = 20;

/** Drives an object along its recorded path during playback by cloning it with an overridden
 *  position/rotation each tick (throttled to ~20fps) — avoids fighting the primitive components'
 *  own position/rotation application and avoids full 60fps React re-renders. */
function PathDrivenWrapper({ obj, path, selected, onSelect }: { obj: ObjectDataModel; path: Path; selected: boolean; onSelect: (shiftKey: boolean) => void }) {
  const [animatedObj, setAnimatedObj] = React.useState(obj);
  const lastUpdate = useRef(0);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdate.current < 1 / PATH_UPDATE_HZ) return;
    lastUpdate.current = state.clock.elapsedTime;
    const elapsed = useSimulationStore.getState().elapsed;
    const pose = pathPositionAndHeading(path.waypoints, path.speedMmPerSec, elapsed);
    setAnimatedObj({ ...obj, position: { ...obj.position, x: pose.x, y: pose.y }, rotation: { ...obj.rotation, z: pose.headingDeg } });
  });

  return <RenderObject obj={animatedObj} selected={selected} onSelect={onSelect} />;
}

/** Advances the simulation clock once per rendered frame — lives inside <Canvas> so it only
 *  runs while the 3D view is actually mounted, and never touches React state itself. */
function SimulationTicker() {
  useFrame((_, delta) => useSimulationStore.getState().tick(delta));
  return null;
}

interface CameraPreset {
  position: [number, number, number];
  ortho: boolean;
  orbit: boolean;
}

const PRESETS: Record<Exclude<ViewMode, "2d" | "walk">, CameraPreset> = {
  iso: { position: [3200, 2600, 3200], ortho: false, orbit: true },
  top: { position: [0, 6000, 0.01], ortho: true, orbit: true },
  front: { position: [0, 1200, 6000], ortho: true, orbit: true },
  right: { position: [6000, 1200, 0], ortho: true, orbit: true },
};

export function Scene3D() {
  const asm = useEditorStore((s) => s.activeAssembly());
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  const viewMode = useEditorStore((s) => s.viewMode);
  const unit = useEditorStore((s) => s.unit);
  const isWalk = viewMode === "walk";
  const preset = PRESETS[viewMode === "2d" || isWalk ? "iso" : viewMode];

  const dimensionLines = useMemo(() => {
    if (!asm) return [];
    return asm.dimensions
      .map((dim) => {
        const objA = asm.objects.find((o) => o.id === dim.refA.objectId);
        const objB = asm.objects.find((o) => o.id === dim.refB.objectId);
        if (!objA || !objB) return null;
        const pa = resolveAnchor(objA, dim.refA.anchor);
        const pb = resolveAnchor(objB, dim.refB.anchor);
        const mm = dist2({ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y });
        return { id: dim.id, a: [pa.x, pa.z + 5, pa.y] as [number, number, number], b: [pb.x, pb.z + 5, pb.y] as [number, number, number], mm };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [asm]);

  const pathLines = useMemo(() => {
    if (!asm) return [];
    return asm.paths
      .filter((p) => p.waypoints.length >= 2)
      .map((p) => {
        const loop = [...p.waypoints, p.waypoints[0]];
        const flat = loop.flatMap((wp) => [wp.x, 20, wp.y]);
        return { id: p.id, points: new Float32Array(flat) };
      });
  }, [asm]);

  return (
    <div className="relative flex-1 bg-[#0e1318]">
      <Canvas shadows gl={{ preserveDrawingBuffer: true }} onPointerMissed={() => select(null)}>
        {isWalk ? (
          <PerspectiveCamera makeDefault position={[0, EYE_HEIGHT_MM, 3000]} near={10} far={50000} fov={70} />
        ) : preset.ortho ? (
          <OrthographicCamera makeDefault position={preset.position} zoom={0.55} near={0.1} far={50000} />
        ) : (
          <PerspectiveCamera makeDefault position={preset.position} near={1} far={50000} fov={45} />
        )}
        {isWalk ? <WalkthroughCamera /> : <OrbitControls enableRotate={viewMode === "iso"} makeDefault target={[0, 0, 0]} />}
        <ambientLight intensity={0.6} />
        <directionalLight position={[2000, 4000, 2000]} intensity={0.9} castShadow />
        <directionalLight position={[-2000, 1500, -1000]} intensity={0.3} />
        <Grid args={[20000, 20000]} cellSize={500} sectionSize={5000} sectionColor="#3a4a5a" cellColor="#20242c" fadeDistance={20000} infiniteGrid position={[0, 0, 0]} />
        <SimulationTicker />

        {asm?.objects.filter((o) => o.kind !== "group").map((o) => {
          const sel = selectedIds.includes(o.id) || (!!o.parentId && selectedIds.includes(o.parentId));
          // Clicking a grouped child selects/moves its group instead — mirrors Canvas2D.
          const onSelect = (shiftKey: boolean) => select(o.parentId ?? o.id, shiftKey);
          const path = asm.paths.find((p) => p.objectId === o.id);
          if (path) return <PathDrivenWrapper key={o.id} obj={o} path={path} selected={sel} onSelect={onSelect} />;
          return <RenderObject key={o.id} obj={o} selected={sel} onSelect={onSelect} />;
        })}

        {pathLines.map((pl) => (
          <line key={pl.id}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pl.points, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#f59e0b" />
          </line>
        ))}

        {dimensionLines.map((d) => (
          <line key={d.id}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array([...d.a, ...d.b]), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#22c55e" />
          </line>
        ))}
      </Canvas>
      {isWalk && (
        <div className="absolute top-2 left-2 text-[11px] text-sky-400 bg-black/40 px-2 py-1 rounded">
          Click the view to enable mouse-look · WASD / arrows to move · hold Shift to run · Esc releases the mouse
        </div>
      )}
      {dimensionLines.length > 0 && (
        <div className="absolute bottom-2 left-2 text-[10.5px] text-emerald-400 bg-black/40 px-2 py-1 rounded space-x-3">
          {dimensionLines.map((d) => (
            <span key={d.id}>{formatLength(d.mm, unit)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
