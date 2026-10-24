require("./lib/fonts");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { analyzeImageColors, rasterizeImage } = require("./lib/rasterize");
const { buildExportZip, normalizeExportProject } = require("./lib/exportZip");
const { IMAGE_PROMPT } = require("./lib/prompt");

const app = express();
const port = Number(process.env.PORT || 3001);
const distDir = path.join(__dirname, "..", "dist");
const exportTasks = new Map();
const EXPORT_TASK_TTL_MS = 10 * 60 * 1000;

app.use(express.json({ limit: "50mb" }));

function createTaskId() {
  return `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupExportTasks() {
  const now = Date.now();
  for (const [id, task] of exportTasks) {
    if (now - task.createdAt > EXPORT_TASK_TTL_MS) exportTasks.delete(id);
  }
}

function taskPayload(task) {
  return {
    status: task.status,
    progress: task.progress,
    label: task.label,
    error: task.error,
    fileName: task.fileName,
  };
}

setInterval(cleanupExportTasks, 60_000).unref?.();

app.post("/api/rasterize", async (req, res) => {
  try {
    const result = await rasterizeImage(req.body);
    res.json({
      grid: { width: result.width, height: result.height, cells: result.cells },
      kernelColorGrid: result.kernelColorGrid,
    });
  } catch (error) {
    console.error("[api/rasterize]", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Rasterize failed" });
  }
});

app.post("/api/analyze-colors", async (req, res) => {
  try {
    const result = await analyzeImageColors(req.body);
    res.json(result);
  } catch (error) {
    console.error("[api/analyze-colors]", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Analyze colors failed" });
  }
});

app.get("/api/prompt", (_req, res) => {
  res.json({ prompt: IMAGE_PROMPT });
});

app.post("/api/export/start", (req, res) => {
  try {
    const project = normalizeExportProject(req.body?.project);
    const taskId = createTaskId();
    const task = {
      id: taskId,
      status: "running",
      progress: 1,
      label: "准备项目",
      error: null,
      buffer: null,
      cancelRequested: false,
      createdAt: Date.now(),
      fileName: typeof req.body?.fileName === "string" && req.body.fileName.trim() ? req.body.fileName.trim() : "pixel-stl-export.zip",
    };
    exportTasks.set(taskId, task);
    res.json({ taskId });

    const exportOptions = {
      ...(req.body.exportOptions && typeof req.body.exportOptions === "object" ? req.body.exportOptions : {}),
      zipFileName: task.fileName,
    };
    void buildExportZip(project, req.body.appSettings ?? null, ({ progress, label }) => {
      if (task.cancelRequested) {
        const error = new Error("Export cancelled");
        error.code = "EXPORT_CANCELLED";
        throw error;
      }
      task.progress = progress;
      task.label = label;
    }, exportOptions)
      .then((zip) => {
        if (task.cancelRequested) {
          task.status = "cancelled";
          task.progress = 0;
          task.label = "已取消";
          task.buffer = null;
          return;
        }
        task.buffer = zip;
        task.status = "done";
        task.progress = 100;
        task.label = "完成";
      })
      .catch((error) => {
        if (task.cancelRequested || error?.code === "EXPORT_CANCELLED") {
          task.status = "cancelled";
          task.error = null;
          task.label = "已取消";
          task.progress = 0;
          task.buffer = null;
          return;
        }
        console.error("[api/export/start]", error);
        task.status = "error";
        task.error = error instanceof Error ? error.message : "Export failed";
        task.label = "导出失败";
      });
  } catch (error) {
    console.error("[api/export/start]", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Export failed" });
  }
});

app.get("/api/export/status/:taskId", (req, res) => {
  const task = exportTasks.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Export task not found" });
    return;
  }
  res.json(taskPayload(task));
});

app.post("/api/export/cancel/:taskId", (req, res) => {
  const task = exportTasks.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Export task not found" });
    return;
  }
  if (task.status === "done" || task.status === "error" || task.status === "cancelled") {
    res.json(taskPayload(task));
    return;
  }
  task.cancelRequested = true;
  task.status = "cancelled";
  task.progress = 0;
  task.label = "已取消";
  task.error = null;
  task.buffer = null;
  res.json(taskPayload(task));
});

app.get("/api/export/download/:taskId", (req, res) => {
  const task = exportTasks.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Export task not found" });
    return;
  }
  if (task.status === "error") {
    res.status(400).json({ error: task.error || "Export failed" });
    return;
  }
  if (task.status === "cancelled") {
    res.status(400).json({ error: "Export cancelled" });
    return;
  }
  if (task.status !== "done" || !task.buffer) {
    res.status(409).json({ error: "Export task is not complete" });
    return;
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(task.fileName)}"`);
  res.send(task.buffer);
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Pixel STL server running at http://127.0.0.1:${port}`);
});
