const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const { Pool } = require("pg");
const pino = require("pino");
const client = require("prom-client");
const { randomUUID } = require("node:crypto");
const { validateTask, STATUSES } = require("./validation");

const logFile = process.env.APP_LOG_FILE || "/var/log/task-tracker/app.jsonl";
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "task-tracker", environment: process.env.NODE_ENV || "development" },
  redact: ["req.headers.authorization", "password", "*.password"]
}, pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination({ dest: logFile, sync: false }) }
]));

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "task_tracker",
  user: process.env.PGUSER || "task_app",
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "task_tracker_" });
const httpRequests = new client.Counter({
  name: "task_tracker_http_requests_total",
  help: "HTTP requests completed by the Task Tracker API",
  labelNames: ["method", "route", "status_code"],
  registers: [registry]
});
const httpDuration = new client.Histogram({
  name: "task_tracker_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry]
});

function routeLabel(req) {
  if (req.path.startsWith("/api/tasks/") && req.path !== "/api/tasks/") return "/api/tasks/:id";
  return req.path;
}

function createApp({ database = pool, log = logger, metrics = registry } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const started = process.hrtime.bigint();
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeLabel(req);
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      httpRequests.inc(labels);
      httpDuration.observe(labels, elapsed);
      log.info({ requestId, method: req.method, path: req.path, statusCode: res.statusCode, durationMs: Math.round(elapsed * 1000) }, "http_request_completed");
    });
    next();
  });

  app.get("/health", async (_req, res) => {
    try {
      await database.query("SELECT 1");
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      log.error({ err: error }, "health_check_failed");
      res.status(503).json({ status: "error", database: "unavailable" });
    }
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metrics.contentType);
    res.end(await metrics.metrics());
  });

  app.get("/api/tasks", async (req, res, next) => {
    try {
      const { status, q } = req.query;
      if (status && !STATUSES.has(status)) return res.status(400).json({ error: "Invalid status filter." });
      const conditions = [];
      const params = [];
      if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
      if (q) { params.push(`%${String(q).slice(0, 100)}%`); conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await database.query(`SELECT id, title, description, due_date AS "dueDate", status, priority, created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks ${where} ORDER BY created_at DESC, id DESC`, params);
      res.json(result.rows);
    } catch (error) { next(error); }
  });

  app.post("/api/tasks", async (req, res, next) => {
    const { errors, value } = validateTask(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    try {
      const result = await database.query(
        `INSERT INTO tasks (title, description, due_date, status, priority)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, description, due_date AS "dueDate", status, priority, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [value.title, value.description, value.dueDate, value.status, value.priority]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) { next(error); }
  });

  app.patch("/api/tasks/:id", async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "Task ID must be an integer." });
    const { errors, value } = validateTask(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    const fields = { title: "title", description: "description", dueDate: "due_date", status: "status", priority: "priority" };
    const updates = Object.entries(value).filter(([key]) => Object.hasOwn(req.body, key));
    if (!updates.length) return res.status(400).json({ error: "Provide at least one field to update." });
    try {
      const params = updates.map(([, val]) => val);
      const sets = updates.map(([key], i) => `${fields[key]} = $${i + 1}`);
      params.push(req.params.id);
      const result = await database.query(
        `UPDATE tasks SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}
         RETURNING id, title, description, due_date AS "dueDate", status, priority, created_at AS "createdAt", updated_at AS "updatedAt"`,
        params
      );
      if (!result.rowCount) return res.status(404).json({ error: "Task not found." });
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });

  app.delete("/api/tasks/:id", async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "Task ID must be an integer." });
    try {
      const result = await database.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: "Task not found." });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h", etag: true }));
  app.use((error, _req, res, _next) => {
    log.error({ err: error }, "request_failed");
    if (res.headersSent) return;
    const status = error.type === "entity.parse.failed" ? 400 : 500;
    res.status(status).json({ error: status === 400 ? "Malformed JSON request." : "Internal server error." });
  });
  return app;
}

async function start() {
  const migration = fs.readFileSync(path.join(__dirname, "../db/migrations/001_tasks.sql"), "utf8");
  await pool.query(migration);
  const app = createApp();
  const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => logger.info({ port: Number(process.env.PORT || 3000) }, "server_started"));
  const shutdown = async (signal) => {
    logger.info({ signal }, "server_shutdown_started");
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => { logger.fatal({ err: error }, "startup_failed"); process.exit(1); });
}

module.exports = { createApp, pool, logger };
