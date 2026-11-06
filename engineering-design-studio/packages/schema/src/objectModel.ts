import { z } from "zod";

/** Preliminary-engineering disclaimer — must stay visible everywhere the app renders (§40 of the spec). */
export const PRELIMINARY_BANNER = "PRELIMINARY ENGINEERING DESIGN";
export const PRELIMINARY_DISCLAIMER =
  "Final design must be reviewed and approved by a qualified engineer before fabrication/construction.";

export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof Vec3Schema>;

export const zero3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

/**
 * Primitive geometry kinds the 3D engine knows how to render. "composite" is a multi-part
 * realistic asset (a rack, a forklift, a machine) built from several primitives by a dedicated
 * component in cad3d/Composite3D.tsx, keyed off the object's `type`, rather than a single mesh.
 */
export const PrimitiveKindSchema = z.enum(["box", "cylinder", "composite", "group"]);
export type PrimitiveKind = z.infer<typeof PrimitiveKindSchema>;

/**
 * The core Object Data Model (§37 of the spec): every placeable thing — furniture, conveyor
 * component, structural member — is one of these. `properties` is an open bag for
 * type-specific parametric fields that later phases (Conveyor Designer, calc-engine) attach
 * without changing this shape.
 */
export const ObjectDataModelSchema = z.object({
  id: z.string(),
  type: z.string(), // catalog key, e.g. "box", "cylinder" (Phase 1); "conveyor-frame" etc. later
  kind: PrimitiveKindSchema,
  name: z.string(),
  position: Vec3Schema,
  rotation: Vec3Schema, // degrees
  dimension: z.object({ length: z.number(), width: z.number(), height: z.number() }), // mm
  material: z.string().optional(),
  color: z.string().optional(),
  metalness: z.number().min(0).max(1).optional(), // PBR, 0=dielectric (plastic/wood) .. 1=metal
  roughness: z.number().min(0).max(1).optional(), // PBR, 0=mirror .. 1=fully matte
  weight: z.number().optional(), // kg
  cost: z.number().optional(), // currency units
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
  properties: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type ObjectDataModel = z.infer<typeof ObjectDataModelSchema>;

/**
 * A Dimension references two anchor points on (possibly different) objects instead of storing
 * literal text — the displayed value is derived from live geometry every render, so moving or
 * resizing the referenced objects updates it automatically.
 */
export const AnchorSchema = z.object({
  objectId: z.string(),
  anchor: z.enum(["center", "minX", "maxX", "minY", "maxY", "minZ", "maxZ"]),
});
export type Anchor = z.infer<typeof AnchorSchema>;

export const DimensionSchema = z.object({
  id: z.string(),
  refA: AnchorSchema,
  refB: AnchorSchema,
  label: z.string().optional(),
  offset: z.number().default(300), // mm, perpendicular offset of the dimension line from the geometry
});
export type Dimension = z.infer<typeof DimensionSchema>;

/**
 * A recorded travel route for one object (forklift/AGV/AMR) — §7/§12 of the spec:
 * START -> PICKUP -> MOVE -> DROP -> RETURN. Waypoints are plain floor-plane points (mm); the
 * object loops around them (last point connects back to the first) while the simulation plays.
 */
export const Vec2Schema = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const PathSchema = z.object({
  id: z.string(),
  name: z.string(),
  objectId: z.string(),
  waypoints: z.array(Vec2Schema),
  speedMmPerSec: z.number().default(800), // ~0.8 m/s, a brisk walking-pace forklift
});
export type Path = z.infer<typeof PathSchema>;

export const AssemblySchema = z.object({
  id: z.string(),
  name: z.string(),
  objects: z.array(ObjectDataModelSchema),
  dimensions: z.array(DimensionSchema),
  paths: z.array(PathSchema).default([]),
});
export type Assembly = z.infer<typeof AssemblySchema>;

export const RevisionSchema = z.object({
  code: z.string(), // "R00", "R01", ...
  date: z.string(),
  author: z.string(),
  changes: z.string(),
  reason: z.string(),
});
export type Revision = z.infer<typeof RevisionSchema>;

export const ProjectMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  customer: z.string().optional(),
  site: z.string().optional(),
  engineer: z.string().optional(),
  designer: z.string().optional(),
  drawingNumber: z.string().optional(),
  revision: z.string().default("R00"),
  date: z.string(),
  projectCode: z.string().optional(),
  description: z.string().optional(),
  unit: z.enum(["mm", "cm", "m"]).default("mm"),
  createdAt: z.number(),
  modifiedAt: z.number(),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

export const ProjectSchema = z.object({
  meta: ProjectMetaSchema,
  assemblies: z.array(AssemblySchema),
  activeAssemblyId: z.string(),
  revisions: z.array(RevisionSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Catalog grouping shown in the Object Library panel — §3 of the Phase 2 spec. */
export type CatalogCategory = "primitive" | "warehouse" | "automation" | "material-handling" | "safety";

/** Static library entry — catalog metadata, decoupled from any placed instance (mirrors TYPE_DEFS pattern). */
export interface CatalogEntry {
  type: string;
  kind: PrimitiveKind;
  label: string;
  category: CatalogCategory;
  defaultDimension: { length: number; width: number; height: number };
  defaultColor: string;
  defaultMaterial: string;
  defaultWeight: number;
  defaultMetalness?: number;
  defaultRoughness?: number;
  defaultProperties?: Record<string, number | string | boolean>;
}

/** Named PBR material presets — §9 Material Editor. Applied as one commit from the Properties panel. */
export interface MaterialPreset {
  label: string;
  color: string;
  metalness: number;
  roughness: number;
}
export const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  steel: { label: "Steel", color: "#8d95a0", metalness: 0.85, roughness: 0.4 },
  stainless: { label: "Stainless Steel", color: "#c9ced4", metalness: 0.9, roughness: 0.22 },
  painted: { label: "Painted Steel", color: "#2e6da4", metalness: 0.3, roughness: 0.45 },
  plastic: { label: "Plastic", color: "#d94f3d", metalness: 0.0, roughness: 0.55 },
  rubber: { label: "Rubber", color: "#222222", metalness: 0.0, roughness: 0.95 },
  wood: { label: "Wood", color: "#a9793f", metalness: 0.0, roughness: 0.7 },
  glass: { label: "Glass", color: "#bfe0ea", metalness: 0.1, roughness: 0.05 },
};

export const CATALOG: CatalogEntry[] = [
  {
    type: "box",
    kind: "box",
    label: "Box",
    category: "primitive",
    defaultDimension: { length: 600, width: 400, height: 400 },
    defaultColor: "#8aa2c8",
    defaultMaterial: "Steel",
    defaultWeight: 12,
    defaultMetalness: 0.1,
    defaultRoughness: 0.7,
  },
  {
    type: "cylinder",
    kind: "cylinder",
    label: "Cylinder",
    category: "primitive",
    defaultDimension: { length: 400, width: 400, height: 500 }, // length=width=diameter, height=length axis
    defaultColor: "#c8a06a",
    defaultMaterial: "Steel",
    defaultWeight: 8,
    defaultMetalness: 0.1,
    defaultRoughness: 0.6,
  },

  // ---------- Warehouse ----------
  {
    type: "pallet_rack",
    kind: "composite",
    label: "Pallet Rack",
    category: "warehouse",
    defaultDimension: { length: 2700, width: 1100, height: 2500 },
    defaultColor: "#f2a71b",
    defaultMaterial: "Painted Steel",
    defaultWeight: 180,
    defaultMetalness: 0.3,
    defaultRoughness: 0.45,
    defaultProperties: { levels: 4 },
  },
  {
    type: "pallet",
    kind: "box",
    label: "Pallet",
    category: "warehouse",
    defaultDimension: { length: 1200, width: 1000, height: 150 },
    defaultColor: "#a9793f",
    defaultMaterial: "Wood",
    defaultWeight: 20,
    defaultMetalness: 0,
    defaultRoughness: 0.7,
  },
  {
    type: "work_table",
    kind: "composite",
    label: "Work Table",
    category: "warehouse",
    defaultDimension: { length: 1400, width: 700, height: 750 },
    defaultColor: "#8d95a0",
    defaultMaterial: "Stainless Steel",
    defaultWeight: 35,
    defaultMetalness: 0.9,
    defaultRoughness: 0.22,
  },
  {
    type: "storage_bin",
    kind: "box",
    label: "Storage Bin",
    category: "warehouse",
    defaultDimension: { length: 600, width: 400, height: 400 },
    defaultColor: "#4a90d9",
    defaultMaterial: "Plastic",
    defaultWeight: 3,
    defaultMetalness: 0,
    defaultRoughness: 0.55,
  },

  // ---------- Automation ----------
  {
    type: "conveyor_roller",
    kind: "composite",
    label: "Roller Conveyor",
    category: "automation",
    defaultDimension: { length: 3000, width: 600, height: 700 },
    defaultColor: "#6b6b6b",
    defaultMaterial: "Steel",
    defaultWeight: 90,
    defaultMetalness: 0.6,
    defaultRoughness: 0.4,
  },
  {
    type: "auto_weighing_machine",
    kind: "composite",
    label: "Automatic Weighing Machine",
    category: "automation",
    defaultDimension: { length: 2000, width: 1200, height: 1400 }, // spec: Width 1.2m, Length 2.0m, Height 1.4m
    defaultColor: "#8d95a0",
    defaultMaterial: "Painted Steel",
    defaultWeight: 350,
    defaultMetalness: 0.3,
    defaultRoughness: 0.4,
    defaultProperties: { capacity: 50, power: "220V" },
  },
  {
    type: "auto_carton_sealer",
    kind: "composite",
    label: "Automatic Carton Sealing Machine",
    category: "automation",
    defaultDimension: { length: 2200, width: 900, height: 1300 },
    defaultColor: "#8d95a0",
    defaultMaterial: "Painted Steel",
    defaultWeight: 300,
    defaultMetalness: 0.3,
    defaultRoughness: 0.4,
    defaultProperties: { tapeWidthMm: 48, conveyorSpeedMps: 0.3 },
  },
  {
    type: "barcode_scanner",
    kind: "composite",
    label: "Barcode Scanner",
    category: "automation",
    defaultDimension: { length: 200, width: 200, height: 1100 },
    defaultColor: "#2b2b2b",
    defaultMaterial: "Plastic",
    defaultWeight: 6,
    defaultMetalness: 0,
    defaultRoughness: 0.5,
  },

  // ---------- Material Handling ----------
  {
    type: "forklift",
    kind: "composite",
    label: "Forklift",
    category: "material-handling",
    defaultDimension: { length: 1200, width: 2200, height: 2000 },
    defaultColor: "#f2c11b",
    defaultMaterial: "Painted Steel",
    defaultWeight: 2500,
    defaultMetalness: 0.4,
    defaultRoughness: 0.4,
  },
  {
    type: "hand_pallet_truck",
    kind: "composite",
    label: "Hand Pallet Truck",
    category: "material-handling",
    defaultDimension: { length: 550, width: 1550, height: 1200 },
    defaultColor: "#c81e1e",
    defaultMaterial: "Painted Steel",
    defaultWeight: 75,
    defaultMetalness: 0.4,
    defaultRoughness: 0.45,
  },

  // ---------- Safety ----------
  {
    type: "safety_barrier",
    kind: "box",
    label: "Safety Barrier",
    category: "safety",
    defaultDimension: { length: 1500, width: 300, height: 1000 },
    defaultColor: "#f5c518",
    defaultMaterial: "Plastic",
    defaultWeight: 15,
    defaultMetalness: 0,
    defaultRoughness: 0.5,
  },
  {
    type: "bollard",
    kind: "cylinder",
    label: "Bollard",
    category: "safety",
    defaultDimension: { length: 200, width: 200, height: 900 },
    defaultColor: "#d94f3d",
    defaultMaterial: "Painted Steel",
    defaultWeight: 18,
    defaultMetalness: 0.3,
    defaultRoughness: 0.45,
  },
  {
    type: "warning_sign",
    kind: "composite",
    label: "Warning Sign",
    category: "safety",
    defaultDimension: { length: 600, width: 50, height: 1600 },
    defaultColor: "#f5c518",
    defaultMaterial: "Plastic",
    defaultWeight: 5,
    defaultMetalness: 0,
    defaultRoughness: 0.5,
  },
  {
    type: "fire_extinguisher",
    kind: "cylinder",
    label: "Fire Extinguisher",
    category: "safety",
    defaultDimension: { length: 150, width: 150, height: 500 },
    defaultColor: "#c81e1e",
    defaultMaterial: "Painted Steel",
    defaultWeight: 6,
    defaultMetalness: 0.3,
    defaultRoughness: 0.4,
  },
];

export function catalogEntry(type: string): CatalogEntry {
  const e = CATALOG.find((c) => c.type === type);
  if (!e) throw new Error(`Unknown catalog type: ${type}`);
  return e;
}

let uidCounter = 0;
export function uid(prefix = "id"): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createObject(type: string, position: Vec3, overrides: Partial<ObjectDataModel> = {}): ObjectDataModel {
  const cat = catalogEntry(type);
  return {
    id: uid("obj"),
    type: cat.type,
    kind: cat.kind,
    name: cat.label,
    position,
    rotation: zero3(),
    dimension: { ...cat.defaultDimension },
    material: cat.defaultMaterial,
    color: cat.defaultColor,
    metalness: cat.defaultMetalness ?? 0.1,
    roughness: cat.defaultRoughness ?? 0.7,
    weight: cat.defaultWeight,
    properties: { ...(cat.defaultProperties ?? {}) },
    ...overrides,
  };
}

export function createEmptyAssembly(name = "Assembly 1"): Assembly {
  return { id: uid("asm"), name, objects: [], dimensions: [], paths: [] };
}

export function createEmptyProject(name = "New Project"): Project {
  const now = Date.now();
  const assembly = createEmptyAssembly();
  return {
    meta: {
      id: uid("proj"),
      name,
      revision: "R00",
      date: new Date(now).toISOString().slice(0, 10),
      unit: "mm",
      createdAt: now,
      modifiedAt: now,
    },
    assemblies: [assembly],
    activeAssemblyId: assembly.id,
    revisions: [
      { code: "R00", date: new Date(now).toISOString().slice(0, 10), author: "system", changes: "Initial creation", reason: "New project" },
    ],
  };
}

/**
 * Anchor -> world position resolver, used by both the 2D and 3D dimension renderers.
 * minX/maxX/minY/maxY/center rotate with the object's Z-axis rotation (plan-view yaw);
 * minZ/maxZ are purely vertical and unaffected by it.
 */
export function resolveAnchor(obj: ObjectDataModel, anchor: Anchor["anchor"]): Vec3 {
  const { position: p, dimension: d, rotation } = obj;
  const hl = d.length / 2;
  const hw = d.width / 2;
  const hh = d.height / 2;
  if (anchor === "minZ") return { x: p.x, y: p.y, z: p.z - hh };
  if (anchor === "maxZ") return { x: p.x, y: p.y, z: p.z + hh };

  const local: Record<string, { x: number; y: number }> = {
    center: { x: 0, y: 0 },
    minX: { x: -hl, y: 0 },
    maxX: { x: hl, y: 0 },
    minY: { x: 0, y: -hw },
    maxY: { x: 0, y: hw },
  };
  const l = local[anchor];
  const rad = ((rotation?.z ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = l.x * cos - l.y * sin;
  const ry = l.x * sin + l.y * cos;
  return { x: p.x + rx, y: p.y + ry, z: p.z };
}
