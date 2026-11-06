import { Router } from "express";
import { db } from "../db/client.js";
import type { ProjectRow } from "../db/schema.js";
import { createEmptyProject, type Project } from "@eds/schema";

export const projectsRouter = Router();

// List projects (id, name, revision, modifiedAt) for the "Open Project" dialog.
projectsRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM projects ORDER BY modified_at DESC").all() as unknown as ProjectRow[];
  res.json(
    rows.map((r) => {
      const p = JSON.parse(r.data) as Project;
      return { id: r.id, name: r.name, revision: p.meta.revision, modifiedAt: r.modified_at };
    })
  );
});

// Create a new project (optionally named).
projectsRouter.post("/", (req, res) => {
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "New Project";
  const project = createEmptyProject(name);
  const now = Date.now();
  db.prepare("INSERT INTO projects (id, name, data, created_at, modified_at) VALUES (?, ?, ?, ?, ?)").run(
    project.meta.id,
    project.meta.name,
    JSON.stringify(project),
    now,
    now
  );
  res.status(201).json(project);
});

// Fetch a full project.
projectsRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as unknown as ProjectRow | undefined;
  if (!row) return res.status(404).json({ error: "Project not found" });
  res.json(JSON.parse(row.data) as Project);
});

// Save (replace) a project — used by both explicit Save and autosave.
projectsRouter.put("/:id", (req, res) => {
  const project = req.body as Project;
  if (!project?.meta?.id || project.meta.id !== req.params.id) {
    return res.status(400).json({ error: "Project id mismatch" });
  }
  const now = Date.now();
  project.meta.modifiedAt = now;
  const result = db
    .prepare("UPDATE projects SET name = ?, data = ?, modified_at = ? WHERE id = ?")
    .run(project.meta.name, JSON.stringify(project), now, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

projectsRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Project not found" });
  res.status(204).end();
});
