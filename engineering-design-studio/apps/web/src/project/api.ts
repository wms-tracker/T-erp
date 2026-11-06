import type { Project } from "@eds/schema";

const BASE = "/api/projects";

export interface ProjectListItem {
  id: string;
  name: string;
  revision: string;
  modifiedAt: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const projectApi = {
  list: (): Promise<ProjectListItem[]> => fetch(BASE).then((r) => json(r)),
  create: (name: string): Promise<Project> =>
    fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => json(r)),
  get: (id: string): Promise<Project> => fetch(`${BASE}/${id}`).then((r) => json(r)),
  save: (project: Project): Promise<Project> =>
    fetch(`${BASE}/${project.meta.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    }).then((r) => json(r)),
  remove: (id: string): Promise<void> => fetch(`${BASE}/${id}`, { method: "DELETE" }).then(() => undefined),
};
