import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREATE_PROJECTS_TABLE } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "eds.sqlite"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(CREATE_PROJECTS_TABLE);
