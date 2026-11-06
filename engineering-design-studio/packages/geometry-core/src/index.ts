export interface Vec2 {
  x: number;
  y: number;
}

export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Snap a value to the nearest multiple of `grid` (mm). */
export function snapToGrid(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export function snapPointToGrid(p: Vec2, grid: number): Vec2 {
  return { x: snapToGrid(p.x, grid), y: snapToGrid(p.y, grid) };
}

/** Find the nearest candidate point within `tolerance` (mm); returns null if none qualify. */
export function snapToNearest(p: Vec2, candidates: Vec2[], tolerance: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tolerance;
  for (const c of candidates) {
    const d = dist2(p, c);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Unit conversion — the canonical stored unit is always millimetres. */
export const UNIT_TO_MM: Record<"mm" | "cm" | "m", number> = { mm: 1, cm: 10, m: 1000 };

export function mmTo(value: number, unit: "mm" | "cm" | "m"): number {
  return value / UNIT_TO_MM[unit];
}

export function toMm(value: number, unit: "mm" | "cm" | "m"): number {
  return value * UNIT_TO_MM[unit];
}

export function formatLength(mm: number, unit: "mm" | "cm" | "m"): string {
  const v = mmTo(mm, unit);
  const decimals = unit === "mm" ? 0 : 2;
  return `${v.toFixed(decimals)} ${unit}`;
}

/** Axis-aligned bounding rectangle in the XY (top-view) plane, in mm. */
export interface Rect2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectFromCenter(cx: number, cy: number, length: number, width: number): Rect2 {
  return {
    minX: cx - length / 2,
    maxX: cx + length / 2,
    minY: cy - width / 2,
    maxY: cy + width / 2,
  };
}

export function rectCorners(r: Rect2): Vec2[] {
  return [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
}

/** A top-view footprint for collision testing: centre + full length/width (mm) + yaw in degrees. */
export interface RotatedRect {
  x: number;
  y: number;
  length: number;
  width: number;
  rotationDeg: number;
}

function rotatePoint(x: number, y: number, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function rotatedRectCorners(r: RotatedRect): Vec2[] {
  return rotatedCorners(r);
}

/** Axis-aligned bounding box of a (possibly rotated) footprint — used for align tools so
 *  "align left/right/top/bottom" works correctly even on objects rotated off-axis. */
export function rotatedRectAABB(r: RotatedRect): Rect2 {
  const corners = rotatedCorners(r);
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

function rotatedCorners(r: RotatedRect): Vec2[] {
  const hl = r.length / 2;
  const hw = r.width / 2;
  return [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ].map(([lx, ly]) => {
    const p = rotatePoint(lx, ly, r.rotationDeg || 0);
    return { x: p.x + r.x, y: p.y + r.y };
  });
}

function edgeNormals(corners: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const ex = p2.y - p1.y;
    const ey = -(p2.x - p1.x);
    const len = Math.hypot(ex, ey) || 1;
    out.push({ x: ex / len, y: ey / len });
  }
  return out;
}

/**
 * Separating-axis test for two (possibly rotated) rectangular footprints — ported from
 * space-designer.html's proven `rectOverlap`. Used for collision warnings (§11): rack-vs-wall,
 * machine-vs-conveyor, forklift turning clearance, etc.
 */
export function rotatedRectOverlap(a: RotatedRect, b: RotatedRect): boolean {
  const ca = rotatedCorners(a);
  const cb = rotatedCorners(b);
  const axes = [...edgeNormals(ca), ...edgeNormals(cb)];
  for (const ax of axes) {
    const pa = ca.map((p) => p.x * ax.x + p.y * ax.y);
    const pb = cb.map((p) => p.x * ax.x + p.y * ax.y);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

export interface PathPose {
  x: number;
  y: number;
  headingDeg: number;
}

/**
 * Where a looping path-follower is after `elapsedSeconds` of travel at `speedMmPerSec`.
 * Walks the closed polyline (last waypoint connects back to the first) by arc length and
 * linearly interpolates position within the current segment; heading points along travel.
 */
export function pathPositionAndHeading(waypoints: Vec2[], speedMmPerSec: number, elapsedSeconds: number): PathPose {
  if (waypoints.length === 0) return { x: 0, y: 0, headingDeg: 0 };
  if (waypoints.length === 1) return { x: waypoints[0].x, y: waypoints[0].y, headingDeg: 0 };

  const segments = waypoints.map((p, i) => {
    const next = waypoints[(i + 1) % waypoints.length];
    const length = dist2(p, next);
    return { from: p, to: next, length };
  });
  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
  if (totalLength <= 0) return { x: waypoints[0].x, y: waypoints[0].y, headingDeg: 0 };

  const travelled = ((elapsedSeconds * speedMmPerSec) % totalLength + totalLength) % totalLength;
  let remaining = travelled;
  for (const seg of segments) {
    if (remaining <= seg.length || seg === segments[segments.length - 1]) {
      const t = seg.length > 0 ? Math.min(1, remaining / seg.length) : 0;
      const x = seg.from.x + (seg.to.x - seg.from.x) * t;
      const y = seg.from.y + (seg.to.y - seg.from.y) * t;
      const headingDeg = (Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * 180) / Math.PI;
      return { x, y, headingDeg };
    }
    remaining -= seg.length;
  }
  const last = waypoints[0];
  return { x: last.x, y: last.y, headingDeg: 0 };
}
