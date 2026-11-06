import { create } from "zustand";
import {
  createObject,
  uid,
  zero3,
  type Project,
  type Assembly,
  type ObjectDataModel,
  type Dimension,
  type Anchor,
  type Vec3,
  type Vec2,
  type Path,
} from "@eds/schema";
import { snapToGrid, rotatedRectAABB } from "@eds/geometry-core";
import { projectApi, type ProjectListItem } from "./api";

// `place-${catalogType}` is generic so any catalog entry (Phase 2 added ~14 beyond box/cylinder)
// can be placed without enumerating every type here — Canvas2D strips the "place-" prefix.
export type Tool = "select" | "dimension" | "path" | `place-${string}`;
export type ViewMode = "2d" | "iso" | "top" | "front" | "right" | "walk";
export type AlignMode = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";

export interface PathDraft {
  objectId: string;
  waypoints: Vec2[];
}

const GRID_MM = 50;
const HISTORY_LIMIT = 100;

interface EditorState {
  project: Project | null;
  selectedId: string | null;
  selectedIds: string[];
  tool: Tool;
  viewMode: ViewMode;
  unit: "mm" | "cm" | "m";
  gridMm: number;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  projectList: ProjectListItem[];

  pendingAnchor: Anchor | null;
  pathDraft: PathDraft | null;

  history: string[];
  historyIndex: number;

  activeAssembly: () => Assembly | null;

  refreshProjectList: () => Promise<void>;
  newProject: (name?: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;

  addObjectAt: (type: string, position: Vec3) => void;
  updateObject: (id: string, patch: Partial<ObjectDataModel>) => void;
  deleteObject: (id: string) => void;
  deleteSelected: () => void;
  toggleLock: (id: string) => void;
  alignSelected: (mode: AlignMode) => void;
  groupSelected: () => void;
  ungroup: (groupId: string) => void;
  addDimension: (refA: Anchor, refB: Anchor) => void;
  deleteDimension: (id: string) => void;

  startPathRecording: (objectId: string) => void;
  addPathWaypoint: (point: Vec2) => void;
  finishPathRecording: () => void;
  cancelPathRecording: () => void;
  deletePath: (pathId: string) => void;
  updatePathSpeed: (pathId: string, speedMmPerSec: number) => void;

  select: (id: string | null, additive?: boolean) => void;
  setTool: (tool: Tool) => void;
  setViewMode: (mode: ViewMode) => void;
  setUnit: (unit: "mm" | "cm" | "m") => void;
  setPendingAnchor: (a: Anchor | null) => void;
  snap: (v: number) => number;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

/** Deep-clone the current project and let `mutate` edit it in place; bumps modifiedAt. */
function mutateProject(project: Project, mutate: (p: Project) => void): Project {
  const next: Project = structuredClone(project);
  mutate(next);
  next.meta.modifiedAt = Date.now();
  return next;
}

function keepSelectionIfPresent(p: Project, selectedId: string | null): string | null {
  if (!selectedId) return null;
  const asm = p.assemblies.find((a) => a.id === p.activeAssemblyId);
  return asm?.objects.some((o) => o.id === selectedId) ? selectedId : null;
}

function keepSelectionIdsPresent(p: Project, selectedIds: string[]): string[] {
  const asm = p.assemblies.find((a) => a.id === p.activeAssemblyId);
  if (!asm) return [];
  return selectedIds.filter((id) => asm.objects.some((o) => o.id === id));
}

/** A group has no geometry of its own — deleting one deletes its children too. Expands any
 *  group ids in the given set into {group, ...children}. */
function expandGroupIds(asm: Assembly, ids: string[]): string[] {
  const result = new Set<string>();
  for (const id of ids) {
    result.add(id);
    const obj = asm.objects.find((o) => o.id === id);
    if (obj?.kind === "group") {
      for (const childId of obj.children ?? []) result.add(childId);
    }
  }
  return [...result];
}

function activeAsm(p: Project): Assembly {
  const asm = p.assemblies.find((a) => a.id === p.activeAssemblyId);
  if (!asm) throw new Error("Active assembly not found");
  return asm;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  selectedId: null,
  selectedIds: [],
  tool: "select",
  viewMode: "2d",
  unit: "mm",
  gridMm: GRID_MM,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  projectList: [],
  pendingAnchor: null,
  pathDraft: null,
  history: [],
  historyIndex: -1,

  activeAssembly: () => {
    const p = get().project;
    if (!p) return null;
    return p.assemblies.find((a) => a.id === p.activeAssemblyId) ?? null;
  },

  refreshProjectList: async () => {
    const list = await projectApi.list();
    set({ projectList: list });
  },

  newProject: async (name) => {
    const created = await projectApi.create(name ?? "New Project");
    set({
      project: created,
      selectedId: null,
      selectedIds: [],
      tool: "select",
      history: [JSON.stringify(created)],
      historyIndex: 0,
      dirty: false,
      lastSavedAt: Date.now(),
    });
  },

  openProject: async (id) => {
    const p = await projectApi.get(id);
    // Projects saved before path-simulation support lack `paths` on each assembly.
    p.assemblies.forEach((a) => { if (!a.paths) a.paths = []; });
    set({ project: p, selectedId: null, selectedIds: [], tool: "select", history: [JSON.stringify(p)], historyIndex: 0, dirty: false, lastSavedAt: Date.now() });
  },

  saveProject: async () => {
    const p = get().project;
    if (!p || get().saving) return;
    set({ saving: true });
    try {
      const saved = await projectApi.save(p);
      set({ project: saved, dirty: false, saving: false, lastSavedAt: Date.now() });
    } catch (e) {
      console.error("Save failed", e);
      set({ saving: false });
    }
  },

  addObjectAt: (type, position) => {
    const state = get();
    if (!state.project) return;
    const obj = createObject(type, position);
    const next = mutateProject(state.project, (p) => {
      activeAsm(p).objects.push(obj);
    });
    set({ project: next, dirty: true, selectedId: obj.id, selectedIds: [obj.id], tool: "select" });
    get().pushHistory();
  },

  updateObject: (id, objPatch) => {
    const state = get();
    if (!state.project) return;
    const next = mutateProject(state.project, (p) => {
      const asm = activeAsm(p);
      const obj = asm.objects.find((o) => o.id === id);
      if (!obj) return;
      // Groups have no geometry of their own — moving one is really moving all its children by
      // the same delta, since each child still stores an absolute (not group-relative) position.
      if (obj.kind === "group" && objPatch.position) {
        const dx = objPatch.position.x - obj.position.x;
        const dy = objPatch.position.y - obj.position.y;
        for (const childId of obj.children ?? []) {
          const child = asm.objects.find((o) => o.id === childId);
          if (child) {
            child.position.x += dx;
            child.position.y += dy;
          }
        }
      }
      Object.assign(obj, objPatch);
    });
    set({ project: next, dirty: true });
  },

  deleteObject: (id) => {
    const state = get();
    if (!state.project) return;
    const asmNow = state.activeAssembly();
    const obj = asmNow?.objects.find((o) => o.id === id);
    if (!obj || obj.locked || !asmNow) return;
    const ids = expandGroupIds(asmNow, [id]);
    const next = mutateProject(state.project, (p) => {
      const asm = activeAsm(p);
      asm.objects = asm.objects.filter((o) => !ids.includes(o.id));
      asm.dimensions = asm.dimensions.filter((d) => !ids.includes(d.refA.objectId) && !ids.includes(d.refB.objectId));
      asm.paths = asm.paths.filter((path) => !ids.includes(path.objectId));
    });
    set({ project: next, dirty: true, selectedId: null, selectedIds: [] });
    get().pushHistory();
  },

  deleteSelected: () => {
    const state = get();
    if (!state.project) return;
    const asm = state.activeAssembly();
    if (!asm) return;
    const unlocked = state.selectedIds.filter((id) => !asm.objects.find((o) => o.id === id)?.locked);
    if (unlocked.length === 0) return;
    const ids = expandGroupIds(asm, unlocked);
    const next = mutateProject(state.project, (p) => {
      const a = activeAsm(p);
      a.objects = a.objects.filter((o) => !ids.includes(o.id));
      a.dimensions = a.dimensions.filter((d) => !ids.includes(d.refA.objectId) && !ids.includes(d.refB.objectId));
      a.paths = a.paths.filter((path) => !ids.includes(path.objectId));
    });
    set({ project: next, dirty: true, selectedId: null, selectedIds: [] });
    get().pushHistory();
  },

  toggleLock: (id) => {
    const state = get();
    if (!state.project) return;
    const next = mutateProject(state.project, (p) => {
      const obj = activeAsm(p).objects.find((o) => o.id === id);
      if (obj) obj.locked = !obj.locked;
    });
    set({ project: next, dirty: true });
    get().pushHistory();
  },

  alignSelected: (mode) => {
    const state = get();
    if (!state.project) return;
    const asm = state.activeAssembly();
    if (!asm) return;
    const targets = asm.objects.filter((o) => state.selectedIds.includes(o.id) && !o.locked);
    if (targets.length < 2) return;

    const boxed = targets.map((obj) => ({
      id: obj.id,
      x: obj.position.x,
      y: obj.position.y,
      aabb: rotatedRectAABB({ x: obj.position.x, y: obj.position.y, length: obj.dimension.length, width: obj.dimension.width, rotationDeg: obj.rotation.z ?? 0 }),
    }));

    let target: number;
    if (mode === "left") target = Math.min(...boxed.map((b) => b.aabb.minX));
    else if (mode === "right") target = Math.max(...boxed.map((b) => b.aabb.maxX));
    else if (mode === "top") target = Math.min(...boxed.map((b) => b.aabb.minY));
    else if (mode === "bottom") target = Math.max(...boxed.map((b) => b.aabb.maxY));
    else if (mode === "centerX") target = boxed.reduce((sum, b) => sum + b.x, 0) / boxed.length;
    else target = boxed.reduce((sum, b) => sum + b.y, 0) / boxed.length;

    const next = mutateProject(state.project, (p) => {
      const a = activeAsm(p);
      for (const b of boxed) {
        const obj = a.objects.find((o) => o.id === b.id);
        if (!obj) continue;
        if (mode === "left") obj.position.x += target - b.aabb.minX;
        else if (mode === "right") obj.position.x += target - b.aabb.maxX;
        else if (mode === "top") obj.position.y += target - b.aabb.minY;
        else if (mode === "bottom") obj.position.y += target - b.aabb.maxY;
        else if (mode === "centerX") obj.position.x = target;
        else obj.position.y = target;
      }
    });
    set({ project: next, dirty: true });
    get().pushHistory();
  },

  groupSelected: () => {
    const state = get();
    if (!state.project) return;
    const asm = state.activeAssembly();
    if (!asm) return;
    const targets = asm.objects.filter((o) => state.selectedIds.includes(o.id) && !o.locked && !o.parentId);
    if (targets.length < 2) return;

    const centroidX = targets.reduce((s, o) => s + o.position.x, 0) / targets.length;
    const centroidY = targets.reduce((s, o) => s + o.position.y, 0) / targets.length;
    const aabbs = targets.map((o) => rotatedRectAABB({ x: o.position.x, y: o.position.y, length: o.dimension.length, width: o.dimension.width, rotationDeg: o.rotation.z ?? 0 }));
    const minX = Math.min(...aabbs.map((b) => b.minX));
    const maxX = Math.max(...aabbs.map((b) => b.maxX));
    const minY = Math.min(...aabbs.map((b) => b.minY));
    const maxY = Math.max(...aabbs.map((b) => b.maxY));
    const maxHeight = Math.max(...targets.map((o) => o.dimension.height));

    const group: ObjectDataModel = {
      id: uid("grp"),
      type: "group",
      kind: "group",
      name: "Group",
      position: { x: centroidX, y: centroidY, z: 0 },
      rotation: zero3(),
      dimension: { length: Math.max(1, maxX - minX), width: Math.max(1, maxY - minY), height: maxHeight },
      children: targets.map((o) => o.id),
      properties: {},
    };

    const next = mutateProject(state.project, (p) => {
      const a = activeAsm(p);
      for (const t of targets) {
        const child = a.objects.find((o) => o.id === t.id);
        if (child) child.parentId = group.id;
      }
      a.objects.push(group);
    });
    set({ project: next, dirty: true, selectedId: group.id, selectedIds: [group.id] });
    get().pushHistory();
  },

  ungroup: (groupId) => {
    const state = get();
    if (!state.project) return;
    const asm = state.activeAssembly();
    const group = asm?.objects.find((o) => o.id === groupId);
    if (!group || group.kind !== "group") return;
    const childIds = group.children ?? [];

    const next = mutateProject(state.project, (p) => {
      const a = activeAsm(p);
      for (const childId of childIds) {
        const child = a.objects.find((o) => o.id === childId);
        if (child) child.parentId = null;
      }
      a.objects = a.objects.filter((o) => o.id !== groupId);
    });
    set({ project: next, dirty: true, selectedId: childIds[0] ?? null, selectedIds: childIds });
    get().pushHistory();
  },

  addDimension: (refA, refB) => {
    const state = get();
    if (!state.project) return;
    const dim: Dimension = {
      id: `dim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      refA,
      refB,
      offset: 300,
    };
    const next = mutateProject(state.project, (p) => {
      activeAsm(p).dimensions.push(dim);
    });
    set({ project: next, dirty: true, pendingAnchor: null });
    get().pushHistory();
  },

  deleteDimension: (id) => {
    const state = get();
    if (!state.project) return;
    const next = mutateProject(state.project, (p) => {
      const asm = activeAsm(p);
      asm.dimensions = asm.dimensions.filter((d) => d.id !== id);
    });
    set({ project: next, dirty: true });
    get().pushHistory();
  },

  startPathRecording: (objectId) => set({ tool: "path", pathDraft: { objectId, waypoints: [] } }),

  addPathWaypoint: (point) => {
    const draft = get().pathDraft;
    if (!draft) return;
    set({ pathDraft: { ...draft, waypoints: [...draft.waypoints, point] } });
  },

  finishPathRecording: () => {
    const state = get();
    const draft = state.pathDraft;
    if (!state.project || !draft || draft.waypoints.length < 2) {
      set({ pathDraft: null, tool: "select" });
      return;
    }
    const path: Path = {
      id: `path_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: "Path",
      objectId: draft.objectId,
      waypoints: draft.waypoints,
      speedMmPerSec: 800,
    };
    const next = mutateProject(state.project, (p) => {
      const asm = activeAsm(p);
      asm.paths = asm.paths.filter((existing) => existing.objectId !== draft.objectId);
      asm.paths.push(path);
    });
    set({ project: next, dirty: true, pathDraft: null, tool: "select" });
    get().pushHistory();
  },

  cancelPathRecording: () => set({ pathDraft: null, tool: "select" }),

  deletePath: (pathId) => {
    const state = get();
    if (!state.project) return;
    const next = mutateProject(state.project, (p) => {
      const asm = activeAsm(p);
      asm.paths = asm.paths.filter((path) => path.id !== pathId);
    });
    set({ project: next, dirty: true });
    get().pushHistory();
  },

  updatePathSpeed: (pathId, speedMmPerSec) => {
    const state = get();
    if (!state.project) return;
    const next = mutateProject(state.project, (p) => {
      const path = activeAsm(p).paths.find((x) => x.id === pathId);
      if (path) path.speedMmPerSec = speedMmPerSec;
    });
    set({ project: next, dirty: true });
  },

  select: (id, additive) => {
    if (!additive) {
      set({ selectedId: id, selectedIds: id ? [id] : [] });
      return;
    }
    if (!id) return;
    const { selectedIds } = get();
    const exists = selectedIds.includes(id);
    const nextIds = exists ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    set({ selectedIds: nextIds, selectedId: nextIds.length ? nextIds[nextIds.length - 1] : null });
  },
  setTool: (tool) => set({ tool, pendingAnchor: null, pathDraft: tool === "path" ? get().pathDraft : null }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setUnit: (unit) => set({ unit }),
  setPendingAnchor: (a) => set({ pendingAnchor: a }),
  snap: (v) => snapToGrid(v, get().gridMm),

  pushHistory: () => {
    const { project, history, historyIndex } = get();
    if (!project) return;
    const snapshot = JSON.stringify(project);
    const truncated = history.slice(0, historyIndex + 1);
    truncated.push(snapshot);
    const capped = truncated.length > HISTORY_LIMIT ? truncated.slice(truncated.length - HISTORY_LIMIT) : truncated;
    set({ history: capped, historyIndex: capped.length - 1 });
  },

  undo: () => {
    const { history, historyIndex, selectedId, selectedIds } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    const project: Project = JSON.parse(history[idx]);
    set({ project, historyIndex: idx, selectedId: keepSelectionIfPresent(project, selectedId), selectedIds: keepSelectionIdsPresent(project, selectedIds), dirty: true });
  },

  redo: () => {
    const { history, historyIndex, selectedId, selectedIds } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    const project: Project = JSON.parse(history[idx]);
    set({ project, historyIndex: idx, selectedId: keepSelectionIfPresent(project, selectedId), selectedIds: keepSelectionIdsPresent(project, selectedIds), dirty: true });
  },
}));
