// Offline regression harness. HTTP fixtures are deliberately not Docker/Loki runtime evidence.
// Run from the repository root: node --test scripts/qa_harness.test.js
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createApp, pool } = require("../app/src/server");
const { validateTask } = require("../app/src/validation");
const root = path.resolve(__dirname, "..");

async function withHttp(handler, fn) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function withApp(fn) {
  let calls = 0;
  const logs = [];
  const app = createApp({
    database: { query: async () => { calls++; throw new Error("Unexpected database access in boundary test"); } },
    log: { info: value => logs.push(value), error() {} }
  });
  await withHttp(app, base => fn({ base, logs, calls: () => calls }));
}

function run(script, args = [], { cwd = root, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", script), ...args], {
      cwd, env: { ...process.env, NODE_ENV: "test", ...env }, stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Harness child timed out")); }, 20000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

async function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "de24-qa-"));
  try { await fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

test("DATE parsing preserves the day independently of timezone", () => {
  const parser = pool.options.types?.getTypeParser(1082, "text");
  assert.ok(parser, "Pool must preserve PostgreSQL calendar dates");
  for (const timezone of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"]) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = timezone;
      assert.equal(parser("2026-10-31"), "2026-10-31");
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  }
  assert.equal(pool.options.types.getTypeParser(23, "text")("42"), 42);
});

test("Calendar validation rejects year zero and invalid leap days", () => {
  for (const dueDate of ["0000-01-01", "2026-02-29", "2026-04-31"]) {
    assert.ok(validateTask({ title: "Calendar check", dueDate }).errors.length, dueDate);
  }
  assert.deepEqual(validateTask({ title: "Leap day", dueDate: "2028-02-29" }).errors, []);
});

test("Out-of-range task IDs are rejected before database queries", async () => {
  await withApp(async ({ base, calls }) => {
    for (const id of ["0", "-1", "9223372036854775808", "9".repeat(100)]) {
      for (const method of ["PATCH", "DELETE"]) {
        const res = await fetch(`${base}/api/tasks/${id}`, {
          method, headers: { "Content-Type": "application/json" },
          ...(method === "PATCH" ? { body: '{"status":"done"}' } : {})
        });
        assert.equal(res.status, 400, `${method} ${id}`);
        await res.text();
      }
    }
    assert.equal(calls(), 0);
  });
});

test("Malformed JSON remains observable in request logs and metrics", async () => {
  await withApp(async ({ base, logs }) => {
    const response = await fetch(`${base}/api/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken"
    });
    assert.equal(response.status, 400);
    assert.ok(response.headers.get("x-request-id"));
    await response.text();
    assert.ok(logs.some(item => item.statusCode === 400 && item.path === "/api/tasks"));
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /task_tracker_http_requests_total\{[^\n]*status_code="400"/);
  });
});

test("Oversized JSON returns 413 without stack traces or database access", async () => {
  await withApp(async ({ base, calls }) => {
    const response = await fetch(`${base}/api/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(40000) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Request body is too large." });
    assert.equal(calls(), 0);
  });
});

test("Unsupported JSON charset returns 415", async () => {
  await withApp(async ({ base }) => {
    const response = await fetch(`${base}/api/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json; charset=invalid" }, body: "{}"
    });
    assert.equal(response.status, 415);
    await response.text();
  });
});

test("Unknown paths share one metric label rather than unbounded URL labels", async () => {
  await withApp(async ({ base }) => {
    for (let i = 0; i < 20; i++) {
      const response = await fetch(`${base}/qa-nonexistent-${i}`);
      assert.equal(response.status, 404);
      await response.text();
    }
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.doesNotMatch(metrics, /route="\/qa-nonexistent-/);
    assert.match(metrics, /route="unmatched"/);
  });
});

test("Unknown API routes return a safe JSON 404", async () => {
  await withApp(async ({ base }) => {
    const response = await fetch(`${base}/api/not-found`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Route not found." });
  });
});

test("Environment generation is private and refuses to overwrite existing credentials", async () => {
  await temporary(async cwd => {
    fs.copyFileSync(path.join(root, ".env.example"), path.join(cwd, ".env.example"));
    const first = await run("generate_env.js", [], { cwd });
    assert.equal(first.code, 0, first.output);
    const text = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.doesNotMatch(text, /REPLACE_WITH/);
    const passwords = [...text.matchAll(/^\w*PASSWORD=([0-9a-f]{64})$/gm)].map(match => match[1]);
    assert.equal(passwords.length, 5);
    assert.equal(new Set(passwords).size, 5);
    for (const password of passwords) assert.ok(!first.output.includes(password));
    const second = await run("generate_env.js", [], { cwd });
    assert.equal(second.code, 1);
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), text);
  });
});

async function lokiFixture({ empty = false, emptyLast = false, auth = null } = {}, fn) {
  let queries = 0;
  let safeTraffic = 0;
  await withHttp((req, res) => {
    const url = new URL(req.url, "http://fixture");
    if (url.pathname === "/health" || url.pathname === "/api/tasks") { safeTraffic++; return json(res, {}); }
    if (auth && req.headers.authorization !== auth) return json(res, { error: "Unauthorized" }, 401);
    if (url.pathname === "/api/datasources") return json(res, [{ type: "loki", uid: "loki", url: "http://loki:3100" }]);
    const query = url.searchParams.get("query") || "";
    const missing = empty || (emptyLast && query.includes('service="nginx"'));
    queries++;
    // Include an empty first stream: counting just the first stream is incorrect.
    return json(res, { status: "success", data: { result: missing ? [] : [
      { stream: {}, values: [] }, { stream: {}, values: [["1", '{"statusCode":200}'], ["2", "GET /api/tasks"]] }
    ] } });
  }, base => fn(base, () => ({ queries, safeTraffic })));
}

test("Loki harness counts all streams and completes three populated queries", async () => {
  await lokiFixture({}, async base => {
    const result = await run("check_loki.js", [], { env: { GRAFANA_BASE_URL: base, APP_BASE_URL: base, GRAFANA_ADMIN_PASSWORD: "qa-fixture-password" } });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /3\/3 TRUY VẤN/);
    assert.match(result.output, /2 log entries/);
  });
});

test("Loki harness fails on empty data rather than reporting success", async () => {
  await lokiFixture({ empty: true }, async base => {
    const result = await run("check_loki.js", ["--test-empty"], { env: { GRAFANA_BASE_URL: base, GRAFANA_ADMIN_PASSWORD: "qa-fixture-password" } });
    assert.equal(result.code, 1, result.output);
    assert.doesNotMatch(result.output, /=== XÁC NHẬN: 3\/3/);
  });
});

test("Loki harness retries an empty third query and still exits nonzero", async () => {
  await lokiFixture({ emptyLast: true }, async (base, counts) => {
    const result = await run("check_loki.js", [], { env: { GRAFANA_BASE_URL: base, APP_BASE_URL: base, GRAFANA_ADMIN_PASSWORD: "qa-fixture-password" } });
    assert.equal(result.code, 1, result.output);
    assert.equal(counts().queries, 7); // first two + five attempts for the last query
    assert.ok(counts().safeTraffic > 0);
    assert.doesNotMatch(result.output, /=== XÁC NHẬN: 3\/3/);
  });
});

test("Loki credentials accept quoted .env values and comments", async () => {
  await temporary(async cwd => {
    fs.writeFileSync(path.join(cwd, ".env"), 'GRAFANA_ADMIN_USER = "admin"\nGRAFANA_ADMIN_PASSWORD = "quoted-fixture" # comment\n');
    await lokiFixture({ auth: "Basic " + Buffer.from("admin:quoted-fixture").toString("base64") }, async base => {
      const result = await run("check_loki.js", [], { cwd, env: { GRAFANA_BASE_URL: base, GRAFANA_ADMIN_USER: "", GRAFANA_ADMIN_PASSWORD: "" } });
      assert.equal(result.code, 0, result.output);
      assert.ok(!result.output.includes("quoted-fixture"));
    });
  });
});

test("Persistence refuses to overwrite an unfinished marker", async () => {
  await temporary(async cwd => {
    const file = path.join(cwd, ".persistence_marker.tmp");
    const marker = '{"markerId":7,"markerTitle":"PERSISTENCE-MARKER-old"}';
    fs.writeFileSync(file, marker);
    let requests = 0;
    await withHttp((_req, res) => { requests++; json(res, { id: 8 }, 201); }, async base => {
      const result = await run("test_persistence.js", ["--step1"], { cwd, env: { APP_BASE_URL: base } });
      assert.equal(result.code, 1, result.output);
      assert.equal(requests, 0);
      assert.equal(fs.readFileSync(file, "utf8"), marker);
    });
  });
});

test("Persistence catches mutated marker fields and retains recovery information", async () => {
  await temporary(async cwd => {
    const file = path.join(cwd, ".persistence_marker.tmp");
    const expected = { title: "PERSISTENCE-MARKER-original", status: "in_progress", priority: "high", dueDate: null, description: "original" };
    fs.writeFileSync(file, JSON.stringify({ markerId: 7, markerTitle: expected.title, expectedTask: expected }));
    let deletes = 0;
    await withHttp((req, res) => {
      if (req.url === "/health") return json(res, { status: "ok", database: "connected" });
      if (req.method === "DELETE") { deletes++; res.writeHead(204); return res.end(); }
      json(res, [{ ...expected, id: 7, priority: "low" }]);
    }, async base => {
      const result = await run("test_persistence.js", ["--step2"], { cwd, env: { APP_BASE_URL: base } });
      assert.equal(result.code, 1, result.output);
      assert.equal(deletes, 0);
      assert.ok(fs.existsSync(file));
    });
  });
});

test("Persistence rejects unknown flags before attempting Docker restart", async () => {
  await temporary(async cwd => {
    const result = await run("test_persistence.js", ["--invalid"], { cwd, env: { APP_BASE_URL: "http://127.0.0.1:1" } });
    assert.equal(result.code, 1);
    assert.match(result.output, /tham số không hợp lệ/);
    assert.ok(!fs.existsSync(path.join(cwd, ".persistence_marker.tmp")));
  });
});

test("E2E harness rejects an unhealthy upstream", async () => {
  await withHttp((_req, res) => json(res, { status: "error", database: "unavailable" }, 503), async base => {
    const result = await run("verify_e2e.js", [], { env: { APP_BASE_URL: base } });
    assert.equal(result.code, 1, result.output);
    assert.doesNotMatch(result.output, /ĐÃ ĐẠT PASS 100%/);
  });
});

async function e2eFixture(failSearch, fn) {
  let task = null;
  let deletes = 0;
  await withHttp(async (req, res) => {
    const url = new URL(req.url, "http://fixture");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    if (raw) { try { body = JSON.parse(raw); } catch { return json(res, { error: "Malformed JSON request." }, 400); } }
    if (url.pathname === "/health") return json(res, { status: "ok", database: "connected" });
    if (req.method === "POST") {
      if (!body?.title?.trim() || body.status === "invalid_status") return json(res, { error: "Invalid task" }, 400);
      task = { ...body, id: "41" }; return json(res, task, 201);
    }
    if (req.method === "GET") return json(res, failSearch ? [] : task ? [task] : []);
    if (req.method === "PATCH") {
      if (!task) return json(res, { error: "Not found" }, 404);
      task = { ...task, ...body }; return json(res, task);
    }
    if (req.method === "DELETE") { deletes++; task = null; res.writeHead(204); return res.end(); }
    json(res, { error: "Not found" }, 404);
  }, base => fn(base, () => ({ task, deletes })));
}

test("E2E runner completes its eight steps with exactly one deletion", async () => {
  await e2eFixture(false, async (base, state) => {
    const result = await run("verify_e2e.js", [], { env: { APP_BASE_URL: base } });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /ĐÃ ĐẠT PASS 100%/);
    assert.equal(state().deletes, 1);
    assert.equal(state().task, null);
  });
});

test("E2E runner cleans its own task after a failed intermediate assertion", async () => {
  await e2eFixture(true, async (base, state) => {
    const result = await run("verify_e2e.js", [], { env: { APP_BASE_URL: base } });
    assert.equal(result.code, 1, result.output);
    assert.doesNotMatch(result.output, /ĐÃ ĐẠT PASS 100%/);
    assert.equal(state().deletes, 1);
    assert.equal(state().task, null);
  });
});

test("Persistence step wrappers verify and clean an unchanged marker", async () => {
  await temporary(async cwd => {
    let task = null;
    await withHttp(async (req, res) => {
      if (req.url === "/health") return json(res, { status: "ok", database: "connected" });
      if (req.method === "POST") {
        let raw = ""; for await (const chunk of req) raw += chunk;
        task = { ...JSON.parse(raw), id: "52" }; return json(res, task, 201);
      }
      if (req.method === "DELETE") { task = null; res.writeHead(204); return res.end(); }
      return json(res, task ? [task] : []);
    }, async base => {
      const options = { cwd, env: { APP_BASE_URL: base } };
      const first = await run("persistence_step1.js", [], options);
      assert.equal(first.code, 0, first.output);
      const second = await run("persistence_step2.js", [], options);
      assert.equal(second.code, 0, second.output);
      assert.equal(task, null);
      assert.ok(!fs.existsSync(path.join(cwd, ".persistence_marker.tmp")));
    });
  });
});
