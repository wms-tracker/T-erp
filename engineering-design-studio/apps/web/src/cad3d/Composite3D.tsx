import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ObjectDataModel } from "@eds/schema";
import { useSimulationStore } from "../project/simulationStore";

/**
 * Multi-part "realistic" assets (§8) — each built from primitives like space-designer.html's
 * buildObjectMesh, but as declarative R3F JSX. Parts are positioned in a LOCAL frame where
 * y=0 is the floor directly under the object's footprint centre, x is along `dimension.length`
 * and z is along `dimension.width` — the wrapping <group> (below) places/rotates the whole
 * thing using the same world convention as Primitives3D's toThreePosition.
 */

interface CompositeProps {
  obj: ObjectDataModel;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
}

function compositeOrigin(obj: ObjectDataModel): [number, number, number] {
  return [obj.position.x, obj.position.z, obj.position.y];
}

interface PartProps {
  w: number;
  h: number;
  d: number;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}
function Part({ w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, color, metalness = 0.3, roughness = 0.5, emissive, emissiveIntensity = 0.6 }: PartProps) {
  return (
    <mesh position={[x, y, z]} rotation={[rx, ry, rz]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? emissiveIntensity : 0} />
    </mesh>
  );
}

interface CylPartProps {
  r: number;
  h: number;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  color: string;
  metalness?: number;
  roughness?: number;
  segments?: number;
}
function CylPart({ r, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, color, metalness = 0.3, roughness = 0.5, segments = 16 }: CylPartProps) {
  return (
    <mesh position={[x, y, z]} rotation={[rx, ry, rz]}>
      <cylinderGeometry args={[r, r, h, segments]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

function Wheels({ L, W, H, color = "#1a1a1a" }: { L: number; W: number; H: number; color?: string }) {
  const r = H * 0.22;
  const positions: [number, number][] = [
    [L * 0.32, W * 0.46],
    [-L * 0.32, W * 0.46],
    [L * 0.32, -W * 0.46],
    [-L * 0.32, -W * 0.46],
  ];
  return (
    <>
      {positions.map(([x, z], i) => (
        <CylPart key={i} r={r} h={H * 0.12} x={x} y={r} z={z} rx={Math.PI / 2} color={color} metalness={0.1} roughness={0.9} segments={20} />
      ))}
    </>
  );
}

function PalletRack({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const color = obj.color ?? "#f2a71b";
  const postW = Math.min(60, L * 0.03);
  const levels = Number(obj.properties?.levels ?? 4);
  const corners: [number, number][] = [
    [L / 2 - postW / 2, W / 2 - postW / 2],
    [-(L / 2 - postW / 2), W / 2 - postW / 2],
    [L / 2 - postW / 2, -(W / 2 - postW / 2)],
    [-(L / 2 - postW / 2), -(W / 2 - postW / 2)],
  ];
  return (
    <>
      {corners.map(([x, z], i) => (
        <Part key={i} w={postW} h={H} d={postW} x={x} y={H / 2} z={z} color="#d97706" metalness={0.5} roughness={0.4} />
      ))}
      {Array.from({ length: levels }).map((_, i) => {
        const y = 100 + ((H - 150) * i) / Math.max(1, levels - 1);
        return <Part key={i} w={L} h={50} d={W} x={0} y={y} z={0} color={color} metalness={0.3} roughness={0.5} />;
      })}
    </>
  );
}

function WorkTable({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const color = obj.color ?? "#8d95a0";
  const legW = Math.min(50, L * 0.03);
  const legs: [number, number][] = [
    [L / 2 - legW, W / 2 - legW],
    [-(L / 2 - legW), W / 2 - legW],
    [L / 2 - legW, -(W / 2 - legW)],
    [-(L / 2 - legW), -(W / 2 - legW)],
  ];
  return (
    <>
      <Part w={L} h={40} d={W} x={0} y={H - 20} z={0} color={color} metalness={obj.metalness ?? 0.9} roughness={obj.roughness ?? 0.22} />
      {legs.map(([x, z], i) => (
        <Part key={i} w={legW} h={H - 40} d={legW} x={x} y={(H - 40) / 2} z={z} color="#555555" metalness={0.5} roughness={0.4} />
      ))}
    </>
  );
}

function RollerBed({ L, W, H, rollerCount = 9, color = "#6b6b6b" }: { L: number; W: number; H: number; rollerCount?: number; color?: string }) {
  const legW = Math.min(60, W * 0.08);
  const railH = H * 0.14;
  const rollerR = railH * 0.5;
  return (
    <>
      {/* legs */}
      {[-(L / 2 - legW), L / 2 - legW].map((x, i) =>
        [-(W / 2 - legW / 2), W / 2 - legW / 2].map((z, j) => (
          <Part key={`${i}-${j}`} w={legW} h={H - railH} d={legW} x={x} y={(H - railH) / 2} z={z} color="#444a52" metalness={0.5} roughness={0.5} />
        ))
      )}
      {/* side rails */}
      <Part w={L} h={railH} d={W * 0.06} x={0} y={H - railH / 2} z={-(W / 2 - W * 0.03)} color="#30343a" metalness={0.5} roughness={0.5} />
      <Part w={L} h={railH} d={W * 0.06} x={0} y={H - railH / 2} z={W / 2 - W * 0.03} color="#30343a" metalness={0.5} roughness={0.5} />
      {/* rollers */}
      {Array.from({ length: rollerCount }).map((_, i) => {
        const x = -L / 2 + ((i + 0.5) * L) / rollerCount;
        return <CylPart key={i} r={rollerR} h={W * 0.92} x={x} y={H - railH / 2} z={0} rx={Math.PI / 2} color={color} metalness={0.6} roughness={0.35} segments={14} />;
      })}
    </>
  );
}

function ConveyorRoller({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  return <RollerBed L={L} W={W} H={H} color={obj.color ?? "#6b6b6b"} />;
}

function BarcodeScanner({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const poleR = Math.min(L, W) * 0.18;
  return (
    <>
      <Part w={L * 1.6} h={30} d={W * 1.6} x={0} y={15} z={0} color="#2b2b2b" metalness={0.2} roughness={0.6} />
      <CylPart r={poleR} h={H * 0.82} x={0} y={H * 0.41} z={0} color="#3a3a3a" metalness={0.4} roughness={0.5} />
      <Part w={L * 1.4} h={H * 0.18} d={W * 1.1} x={0} y={H * 0.9} z={0} ry={0.35} color="#1d1d1d" metalness={0.3} roughness={0.4} />
      <Part w={L * 0.5} h={H * 0.02} d={W * 0.2} x={L * 0.25} y={H * 0.86} z={0} ry={0.35} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.2} />
    </>
  );
}

function Forklift({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const color = obj.color ?? "#f2c11b";
  return (
    <>
      {/* body */}
      <Part w={L * 0.62} h={H * 0.4} d={W * 0.78} x={-L * 0.12} y={H * 0.26} z={0} color={color} metalness={0.4} roughness={0.4} />
      {/* counterweight */}
      <Part w={L * 0.18} h={H * 0.3} d={W * 0.7} x={-L * 0.42} y={H * 0.2} z={0} color="#333333" metalness={0.3} roughness={0.6} />
      {/* overhead guard posts + roof */}
      <Part w={0.03 * L} h={H * 0.55} d={0.03 * L} x={-L * 0.05} y={H * 0.72} z={W * 0.32} color="#2b2b2b" metalness={0.4} roughness={0.5} />
      <Part w={0.03 * L} h={H * 0.55} d={0.03 * L} x={-L * 0.05} y={H * 0.72} z={-W * 0.32} color="#2b2b2b" metalness={0.4} roughness={0.5} />
      <Part w={L * 0.4} h={H * 0.04} d={W * 0.8} x={-L * 0.05} y={H * 0.98} z={0} color="#2b2b2b" metalness={0.4} roughness={0.5} />
      {/* mast */}
      <Part w={0.04 * L} h={H * 0.95} d={0.04 * L} x={L * 0.26} y={H * 0.48} z={W * 0.26} color="#555555" metalness={0.6} roughness={0.35} />
      <Part w={0.04 * L} h={H * 0.95} d={0.04 * L} x={L * 0.26} y={H * 0.48} z={-W * 0.26} color="#555555" metalness={0.6} roughness={0.35} />
      {/* forks */}
      <Part w={L * 0.55} h={H * 0.04} d={W * 0.1} x={L * 0.52} y={H * 0.06} z={W * 0.2} color="#777777" metalness={0.6} roughness={0.35} />
      <Part w={L * 0.55} h={H * 0.04} d={W * 0.1} x={L * 0.52} y={H * 0.06} z={-W * 0.2} color="#777777" metalness={0.6} roughness={0.35} />
      <Wheels L={L} W={W} H={H * 0.5} />
    </>
  );
}

function HandPalletTruck({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const color = obj.color ?? "#c81e1e";
  return (
    <>
      <Part w={L * 0.85} h={H * 0.1} d={W * 0.38} x={L * 0.15} y={H * 0.08} z={W * 0.28} color="#b0b0b0" metalness={0.6} roughness={0.35} />
      <Part w={L * 0.85} h={H * 0.1} d={W * 0.38} x={L * 0.15} y={H * 0.08} z={-W * 0.28} color="#b0b0b0" metalness={0.6} roughness={0.35} />
      <Part w={L * 0.18} h={H * 0.35} d={W * 0.5} x={-L * 0.38} y={H * 0.2} z={0} color={color} metalness={0.4} roughness={0.4} />
      <Part w={0.05 * L} h={H * 0.7} d={W * 0.08} x={-L * 0.42} y={H * 0.5} z={0} ry={0} rz={-0.35} color="#333333" metalness={0.3} roughness={0.5} />
      <CylPart r={H * 0.06} h={W * 0.3} x={-L * 0.42} y={H * 0.12} z={0} rx={Math.PI / 2} color="#1a1a1a" metalness={0.1} roughness={0.9} />
    </>
  );
}

function WarningSign({ obj }: { obj: ObjectDataModel }) {
  const { height: H } = obj.dimension;
  const color = obj.color ?? "#f5c518";
  return (
    <>
      <CylPart r={25} h={H * 0.75} x={0} y={H * 0.375} z={0} color="#8a8f98" metalness={0.5} roughness={0.5} />
      <Part w={600} h={400} d={20} x={0} y={H * 0.75 + 220} z={0} color={color} metalness={0} roughness={0.5} />
      <Part w={560} h={360} d={22} x={0} y={H * 0.75 + 220} z={0} color="#1a1a1a" metalness={0} roughness={0.6} />
      <Part w={520} h={320} d={24} x={0} y={H * 0.75 + 220} z={0} color={color} metalness={0} roughness={0.5} />
    </>
  );
}

/** READY -> DETECTING -> WEIGHING -> COMPLETE, looping — the one fully-animated machine for Phase 2. */
type WeighState = "READY" | "DETECTING" | "WEIGHING" | "COMPLETE";
const CYCLE = { READY: 1.5, DETECTING: 1.0, WEIGHING: 2.0, COMPLETE: 1.0 };
const TOTAL = CYCLE.READY + CYCLE.DETECTING + CYCLE.WEIGHING + CYCLE.COMPLETE;

function weighPhase(elapsed: number): { state: WeighState; t: number; cycleIndex: number } {
  const cycleIndex = Math.floor(elapsed / TOTAL);
  let local = elapsed % TOTAL;
  if (local < CYCLE.READY) return { state: "READY", t: local / CYCLE.READY, cycleIndex };
  local -= CYCLE.READY;
  if (local < CYCLE.DETECTING) return { state: "DETECTING", t: local / CYCLE.DETECTING, cycleIndex };
  local -= CYCLE.DETECTING;
  if (local < CYCLE.WEIGHING) return { state: "WEIGHING", t: local / CYCLE.WEIGHING, cycleIndex };
  local -= CYCLE.WEIGHING;
  return { state: "COMPLETE", t: local / CYCLE.COMPLETE, cycleIndex };
}

function AutoWeighingMachine({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const boxRef = useRef<THREE.Mesh>(null);
  const sensorRef = useRef<THREE.MeshStandardMaterial>(null);
  const [label, setLabel] = React.useState("READY");

  useFrame(() => {
    const elapsed = useSimulationStore.getState().elapsed;
    const { state, t, cycleIndex } = weighPhase(elapsed);
    const targetWeight = 8 + (cycleIndex % 5) * 7.3;

    let boxX = -L * 0.42; // off to the infeed side, hidden-ish
    let boxVisible = true;
    let weightNow = 0;
    let sensorColor = "#3a3a3a";

    if (state === "READY") {
      boxVisible = false;
    } else if (state === "DETECTING") {
      boxX = THREE.MathUtils.lerp(-L * 0.42, 0, t);
      sensorColor = t % 0.4 < 0.2 ? "#ffd60a" : "#3a3a3a";
    } else if (state === "WEIGHING") {
      boxX = 0;
      weightNow = t < 0.4 ? THREE.MathUtils.lerp(0, targetWeight, t / 0.4) : targetWeight;
      sensorColor = "#0a84ff";
    } else {
      boxX = THREE.MathUtils.lerp(0, L * 0.42, t);
      weightNow = targetWeight;
      sensorColor = "#30d158";
    }

    if (boxRef.current) {
      boxRef.current.visible = boxVisible;
      boxRef.current.position.x = boxX;
    }
    if (sensorRef.current) sensorRef.current.color.set(sensorColor);
    const text = weightNow > 0 ? `${state} — ${weightNow.toFixed(2)} kg` : state;
    setLabel((prev) => (prev === text ? prev : text));
  });

  return (
    <>
      <RollerBed L={L} W={W * 0.7} H={H * 0.5} rollerCount={10} color="#8d95a0" />
      {/* product box riding the conveyor */}
      <mesh ref={boxRef} position={[-L * 0.42, H * 0.5 + 90, 0]}>
        <boxGeometry args={[220, 180, 220]} />
        <meshStandardMaterial color="#c8a06a" roughness={0.8} />
      </mesh>
      {/* control box + display + e-stop, on a post to the side */}
      <Part w={60} h={H * 0.75} d={60} x={0} y={H * 0.375} z={-(W * 0.5 + 60)} color="#555555" metalness={0.4} roughness={0.5} />
      <Part w={260} h={220} d={80} x={0} y={H * 0.78} z={-(W * 0.5 + 60)} color="#2b2b2b" metalness={0.3} roughness={0.5} />
      <Part w={200} h={120} d={10} x={0} y={H * 0.82} z={-(W * 0.5 + 95)} color="#0a2a12" emissive="#30d158" emissiveIntensity={0.8} />
      <CylPart r={25} h={30} x={70} y={H * 0.68} z={-(W * 0.5 + 95)} rx={Math.PI / 2} color="#c81e1e" metalness={0.2} roughness={0.5} />
      {/* sensor at infeed */}
      <Part w={40} h={40} d={120} x={-L * 0.4} y={H * 0.5 + 220} z={0} color="#2b2b2b" metalness={0.3} roughness={0.5} />
      <mesh position={[-L * 0.4, H * 0.5 + 195, 0]}>
        <boxGeometry args={[20, 10, 100]} />
        <meshStandardMaterial ref={sensorRef} color="#3a3a3a" emissive="#3a3a3a" emissiveIntensity={0.9} />
      </mesh>
      <Html position={[0, H + 260, 0]} center distanceFactor={6000} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(10,20,35,.85)",
            color: "#9fe8b0",
            fontFamily: "monospace",
            fontSize: 13,
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid #2f7d5c",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </Html>
    </>
  );
}

/**
 * READY -> DETECTED -> POSITIONING -> PRESSING -> TAPING -> COMPLETE, looping — §5 of the spec.
 * Same state-machine shape as the weighing machine; this is the "straightforward follow-up"
 * that Phase 2's plan deferred the second machine as, now that the pattern is proven.
 */
type SealState = "READY" | "DETECTED" | "POSITIONING" | "PRESSING" | "TAPING" | "COMPLETE";
const SEAL_CYCLE: Record<SealState, number> = { READY: 1.2, DETECTED: 0.8, POSITIONING: 1.0, PRESSING: 1.0, TAPING: 1.2, COMPLETE: 1.0 };
const SEAL_ORDER: SealState[] = ["READY", "DETECTED", "POSITIONING", "PRESSING", "TAPING", "COMPLETE"];
const SEAL_TOTAL = SEAL_ORDER.reduce((s, k) => s + SEAL_CYCLE[k], 0);

function sealPhase(elapsed: number): { state: SealState; t: number } {
  let local = elapsed % SEAL_TOTAL;
  for (const state of SEAL_ORDER) {
    const dur = SEAL_CYCLE[state];
    if (local < dur) return { state, t: local / dur };
    local -= dur;
  }
  return { state: "COMPLETE", t: 1 };
}

function AutoCartonSealer({ obj }: { obj: ObjectDataModel }) {
  const { length: L, width: W, height: H } = obj.dimension;
  const conveyorH = H * 0.5;
  const boxSize = 200;
  const boxRef = useRef<THREE.Mesh>(null);
  const leftBeltRef = useRef<THREE.Group>(null);
  const rightBeltRef = useRef<THREE.Group>(null);
  const topBeltRef = useRef<THREE.Group>(null);
  const tapeRef = useRef<THREE.Mesh>(null);
  const sensorRef = useRef<THREE.MeshStandardMaterial>(null);
  const [label, setLabel] = React.useState<SealState>("READY");

  const beltOpenZ = W * 0.42;
  const beltClosedZ = W * 0.28;
  const topRaisedY = conveyorH + boxSize * 1.6;
  const topLoweredY = conveyorH + boxSize * 1.05;

  useFrame(() => {
    const elapsed = useSimulationStore.getState().elapsed;
    const { state, t } = sealPhase(elapsed);

    let boxX = -L * 0.42;
    let boxVisible = true;
    let beltZ = beltOpenZ;
    let topY = topRaisedY;
    let tapeVisible = false;
    let sensorColor = "#3a3a3a";

    if (state === "READY") {
      boxVisible = false;
    } else if (state === "DETECTED") {
      boxX = THREE.MathUtils.lerp(-L * 0.42, -L * 0.1, t);
      sensorColor = t % 0.4 < 0.2 ? "#ffd60a" : "#3a3a3a";
    } else if (state === "POSITIONING") {
      boxX = THREE.MathUtils.lerp(-L * 0.1, 0, t);
      beltZ = THREE.MathUtils.lerp(beltOpenZ, beltClosedZ, t);
      sensorColor = "#0a84ff";
    } else if (state === "PRESSING") {
      boxX = 0;
      beltZ = beltClosedZ;
      topY = THREE.MathUtils.lerp(topRaisedY, topLoweredY, t);
      sensorColor = "#0a84ff";
    } else if (state === "TAPING") {
      boxX = 0;
      beltZ = beltClosedZ;
      topY = topLoweredY;
      tapeVisible = true;
      sensorColor = "#ff9500";
    } else {
      // COMPLETE
      boxX = THREE.MathUtils.lerp(0, L * 0.42, t);
      beltZ = THREE.MathUtils.lerp(beltClosedZ, beltOpenZ, t);
      topY = THREE.MathUtils.lerp(topLoweredY, topRaisedY, t);
      sensorColor = "#30d158";
    }

    if (boxRef.current) {
      boxRef.current.visible = boxVisible;
      boxRef.current.position.x = boxX;
    }
    if (leftBeltRef.current) leftBeltRef.current.position.z = -beltZ;
    if (rightBeltRef.current) rightBeltRef.current.position.z = beltZ;
    if (topBeltRef.current) topBeltRef.current.position.y = topY;
    if (tapeRef.current) tapeRef.current.visible = tapeVisible;
    if (sensorRef.current) sensorRef.current.color.set(sensorColor);
    setLabel((prev) => (prev === state ? prev : state));
  });

  return (
    <>
      <RollerBed L={L} W={W * 0.6} H={conveyorH} rollerCount={8} color="#8d95a0" />
      {/* product box riding the conveyor */}
      <mesh ref={boxRef} position={[-L * 0.42, conveyorH + boxSize / 2, 0]}>
        <boxGeometry args={[boxSize, boxSize, boxSize]} />
        <meshStandardMaterial color="#c8a06a" roughness={0.8} />
      </mesh>
      {/* side belts — squeeze inward to centre/position the box */}
      <group ref={leftBeltRef} position={[0, conveyorH + 150, -beltOpenZ]}>
        <Part w={L * 0.3} h={300} d={40} color="#2b2b2b" metalness={0.3} roughness={0.6} />
      </group>
      <group ref={rightBeltRef} position={[0, conveyorH + 150, beltOpenZ]}>
        <Part w={L * 0.3} h={300} d={40} color="#2b2b2b" metalness={0.3} roughness={0.6} />
      </group>
      {/* frame uprights holding the top belt assembly */}
      {[-L * 0.18, L * 0.18].map((x, i) =>
        [-(W * 0.42 + 40), W * 0.42 + 40].map((z, j) => (
          <Part key={`${i}-${j}`} w={40} h={H * 0.9} d={40} x={x} y={H * 0.45} z={z} color="#555555" metalness={0.5} roughness={0.4} />
        ))
      )}
      {/* top belt — presses the carton flaps down */}
      <group ref={topBeltRef} position={[0, topRaisedY, 0]}>
        <Part w={L * 0.3} h={40} d={W * 0.5} color="#2b2b2b" metalness={0.3} roughness={0.6} />
      </group>
      {/* tape head + tape strip (visible only while taping) */}
      <Part w={120} h={160} d={100} x={L * 0.22} y={conveyorH + 280} z={W * 0.42 + 20} color="#1d1d1d" metalness={0.3} roughness={0.5} />
      <mesh ref={tapeRef} position={[0, conveyorH + boxSize + 10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[220, 60]} />
        <meshStandardMaterial color="#d9c37a" roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* control box + e-stop */}
      <Part w={60} h={H * 0.6} d={60} x={L * 0.5 + 40} y={H * 0.3} z={0} color="#555555" metalness={0.4} roughness={0.5} />
      <Part w={220} h={180} d={70} x={L * 0.5 + 40} y={H * 0.65} z={0} ry={Math.PI / 2} color="#2b2b2b" metalness={0.3} roughness={0.5} />
      <CylPart r={25} h={30} x={L * 0.5 + 75} y={H * 0.55} z={0} rz={Math.PI / 2} color="#c81e1e" metalness={0.2} roughness={0.5} />
      {/* sensor at infeed */}
      <Part w={40} h={40} d={120} x={-L * 0.4} y={conveyorH + 220} z={0} color="#2b2b2b" metalness={0.3} roughness={0.5} />
      <mesh position={[-L * 0.4, conveyorH + 195, 0]}>
        <boxGeometry args={[20, 10, 100]} />
        <meshStandardMaterial ref={sensorRef} color="#3a3a3a" emissive="#3a3a3a" emissiveIntensity={0.9} />
      </mesh>
      <Html position={[0, H + 260, 0]} center distanceFactor={6000} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(10,20,35,.85)",
            color: "#9fe8b0",
            fontFamily: "monospace",
            fontSize: 13,
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid #2f7d5c",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </Html>
    </>
  );
}

const COMPOSITE_BY_TYPE: Record<string, React.ComponentType<{ obj: ObjectDataModel }>> = {
  pallet_rack: PalletRack,
  work_table: WorkTable,
  conveyor_roller: ConveyorRoller,
  auto_weighing_machine: AutoWeighingMachine,
  auto_carton_sealer: AutoCartonSealer,
  barcode_scanner: BarcodeScanner,
  forklift: Forklift,
  hand_pallet_truck: HandPalletTruck,
  warning_sign: WarningSign,
};

export function CompositeAsset({ obj, selected, onSelect }: CompositeProps) {
  const Inner = COMPOSITE_BY_TYPE[obj.type];
  return (
    <group
      position={compositeOrigin(obj)}
      rotation={[0, ((obj.rotation.z ?? 0) * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.nativeEvent.shiftKey);
      }}
    >
      {Inner ? <Inner obj={obj} /> : <Part w={obj.dimension.length} h={obj.dimension.height} d={obj.dimension.width} y={obj.dimension.height / 2} color={obj.color ?? "#888888"} />}
      {selected && (
        <mesh position={[0, obj.dimension.height / 2, 0]}>
          <boxGeometry args={[obj.dimension.length + 20, obj.dimension.height + 20, obj.dimension.width + 20]} />
          <meshBasicMaterial color="#4da3ff" wireframe transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}
