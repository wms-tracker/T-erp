/**
 * Phase 1 persists a whole `Project` (see @eds/schema) as one JSON blob per row — same
 * proven shape as space-designer.html's localStorage save format, just backed by a real
 * database now. Relational decomposition (separate tables per object/dimension) is deferred
 * until a later phase actually needs to query inside a project server-side.
 */
export interface ProjectRow {
  id: string;
  name: string;
  data: string; // JSON.stringify(Project)
  created_at: number;
  modified_at: number;
}

export const CREATE_PROJECTS_TABLE = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    modified_at INTEGER NOT NULL
  );
`;
