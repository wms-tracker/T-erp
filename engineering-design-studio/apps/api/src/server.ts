import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, phase: 1 }));
app.use("/api/projects", projectsRouter);

const PORT = Number(process.env.PORT) || 4001;
app.listen(PORT, () => {
  console.log(`[eds-api] Engineering Design Studio API listening on http://localhost:${PORT}`);
});
