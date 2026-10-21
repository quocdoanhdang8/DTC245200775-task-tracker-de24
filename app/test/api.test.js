const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../src/server");

// Helper to create an in-memory database mock
function createMockDb() {
  let nextId = 1;
  const tasks = [];
  let shouldFail = false;

  return {
    get tasks() {
      return tasks;
    },
    setFail(fail) {
      shouldFail = fail;
    },
    async query(sql, params = []) {
      if (shouldFail) {
        throw new Error("Simulated database connection failure");
      }

      if (sql.trim().toUpperCase() === "SELECT 1") {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }

      // SELECT tasks
      if (sql.includes("FROM tasks") && sql.trim().startsWith("SELECT")) {
        let result = [...tasks];
        if (params.length > 0) {
          if (sql.includes("status = $1")) {
            result = result.filter((t) => t.status === params[0]);
          } else if (sql.includes("status = $2")) {
            // q is $1, status is $2 or vice versa
          }
          if (sql.includes("ILIKE")) {
            const qParam = params.find((p) => typeof p === "string" && p.startsWith("%") && p.endsWith("%"));
            if (qParam) {
              const term = qParam.slice(1, -1).toLowerCase();
              result = result.filter((t) =>
                (t.title && t.title.toLowerCase().includes(term)) ||
                (t.description && t.description.toLowerCase().includes(term))
              );
            }
          }
        }
        return { rows: result, rowCount: result.length };
      }

      // INSERT INTO tasks
      if (sql.includes("INSERT INTO tasks")) {
        const [title, description, dueDate, status, priority] = params;
        const now = new Date().toISOString();
        const newTask = {
          id: nextId++,
          title,
          description,
          dueDate: dueDate || null,
          status,
          priority,
          createdAt: now,
          updatedAt: now
        };
        tasks.push(newTask);
        return { rows: [newTask], rowCount: 1 };
      }

      // UPDATE tasks
      if (sql.includes("UPDATE tasks")) {
        const id = Number(params[params.length - 1]);
        const index = tasks.findIndex((t) => t.id === id);
        if (index === -1) {
          return { rows: [], rowCount: 0 };
        }
        const existing = tasks[index];
        const updated = { ...existing, updatedAt: new Date().toISOString() };

        // Inspect set clauses
        let paramIdx = 0;
        if (sql.includes("title = $")) updated.title = params[paramIdx++];
        if (sql.includes("description = $")) updated.description = params[paramIdx++];
        if (sql.includes("due_date = $")) updated.dueDate = params[paramIdx++];
        if (sql.includes("status = $")) updated.status = params[paramIdx++];
        if (sql.includes("priority = $")) updated.priority = params[paramIdx++];

        tasks[index] = updated;
        return { rows: [updated], rowCount: 1 };
      }

      // DELETE FROM tasks
      if (sql.includes("DELETE FROM tasks")) {
        const id = Number(params[0]);
        const index = tasks.findIndex((t) => t.id === id);
        if (index === -1) {
          return { rows: [], rowCount: 0 };
        }
        tasks.splice(index, 1);
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unhandled query in mock: ${sql}`);
    }
  };
}

// Helper to run a test server and make requests
async function withServer(fn) {
  const db = createMockDb();
  const app = createApp({ database: db });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn({ baseUrl, db });
  } finally {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

// 1. Health and Metrics
test("GET /health returns 200 and ok when database is healthy", async () => {
  await withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: "ok", database: "connected" });
  });
});

test("GET /health returns 503 when database fails", async () => {
  await withServer(async ({ baseUrl, db }) => {
    db.setFail(true);
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.deepEqual(data, { status: "error", database: "unavailable" });
  });
});

test("GET /metrics returns 200 with Prometheus text metrics", async () => {
  await withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("task_tracker_"));
  });
});

// 2. Main API Flows (CRUD)
test("Full CRUD flow: create, read, filter, search, update, delete", async () => {
  await withServer(async ({ baseUrl }) => {
    // List initially empty
    const resEmpty = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(resEmpty.status, 200);
    assert.deepEqual(await resEmpty.json(), []);

    // Create a task
    const resCreate = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Task 1",
        description: "Test description",
        dueDate: "2026-10-31",
        status: "in_progress",
        priority: "high"
      })
    });
    assert.equal(resCreate.status, 201);
    const created = await resCreate.json();
    assert.equal(created.id, 1);
    assert.equal(created.title, "Test Task 1");
    assert.equal(created.status, "in_progress");
    assert.equal(created.priority, "high");

    // Create second task
    await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Another Task",
        status: "todo",
        priority: "low"
      })
    });

    // List all
    const resList = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(resList.status, 200);
    const all = await resList.json();
    assert.equal(all.length, 2);

    // Filter by status
    const resFilter = await fetch(`${baseUrl}/api/tasks?status=in_progress`);
    assert.equal(resFilter.status, 200);
    const filtered = await resFilter.json();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].title, "Test Task 1");

    // Search by q
    const resSearch = await fetch(`${baseUrl}/api/tasks?q=another`);
    assert.equal(resSearch.status, 200);
    const searched = await resSearch.json();
    assert.equal(searched.length, 1);
    assert.equal(searched[0].title, "Another Task");

    // Update task
    const resUpdate = await fetch(`${baseUrl}/api/tasks/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done", priority: "low" })
    });
    assert.equal(resUpdate.status, 200);
    const updated = await resUpdate.json();
    assert.equal(updated.id, 1);
    assert.equal(updated.status, "done");
    assert.equal(updated.priority, "low");

    // Delete task
    const resDel = await fetch(`${baseUrl}/api/tasks/1`, { method: "DELETE" });
    assert.equal(resDel.status, 204);

    // Verify deletion
    const resAfterDel = await fetch(`${baseUrl}/api/tasks`);
    const remaining = await resAfterDel.json();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 2);
  });
});

// 3. Input Validation
test("Input validation rejects invalid requests with 400", async () => {
  await withServer(async ({ baseUrl }) => {
    // Blank title
    const resBlank = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   " })
    });
    assert.equal(resBlank.status, 400);
    const errBlank = await resBlank.json();
    assert.ok(errBlank.error.includes("Title is required"));

    // Long title
    const resLong = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(161) })
    });
    assert.equal(resLong.status, 400);

    // Invalid status
    const resStatus = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid", status: "invalid_status" })
    });
    assert.equal(resStatus.status, 400);

    // Invalid priority
    const resPriority = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid", priority: "urgent" })
    });
    assert.equal(resPriority.status, 400);

    // Invalid date format
    const resDateFormat = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid", dueDate: "31-10-2026" })
    });
    assert.equal(resDateFormat.status, 400);

    // Non-existent date
    const resNonExistentDate = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid", dueDate: "2026-02-31" })
    });
    assert.equal(resNonExistentDate.status, 400);

    // Invalid query status filter
    const resBadFilter = await fetch(`${baseUrl}/api/tasks?status=not_a_status`);
    assert.equal(resBadFilter.status, 400);
    const errBadFilter = await resBadFilter.json();
    assert.equal(errBadFilter.error, "Invalid status filter.");

    // Non-numeric ID in PATCH
    const resBadPatchId = await fetch(`${baseUrl}/api/tasks/not-an-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" })
    });
    assert.equal(resBadPatchId.status, 400);
    const errBadPatchId = await resBadPatchId.json();
    assert.equal(errBadPatchId.error, "Task ID must be an integer.");

    // Empty PATCH body
    const resEmptyPatch = await fetch(`${baseUrl}/api/tasks/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(resEmptyPatch.status, 400);

    // Non-numeric ID in DELETE
    const resBadDelId = await fetch(`${baseUrl}/api/tasks/abc`, { method: "DELETE" });
    assert.equal(resBadDelId.status, 400);
    const errBadDelId = await resBadDelId.json();
    assert.equal(errBadDelId.error, "Task ID must be an integer.");

    // Malformed JSON body
    const resMalformed = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ broken json"
    });
    assert.equal(resMalformed.status, 400);
    const errMalformed = await resMalformed.json();
    assert.equal(errMalformed.error, "Malformed JSON request.");
  });
});

test("write requests with a body and unsupported media type return 415", async () => {
  await withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "title=Unsupported"
    });
    assert.equal(res.status, 415);
    assert.deepEqual(await res.json(), { error: "Content-Type must be application/json." });
  });
});

// 4. Task Not Found (404)
test("Returns 404 when updating or deleting a nonexistent task", async () => {
  await withServer(async ({ baseUrl }) => {
    // PATCH nonexistent task
    const resPatch = await fetch(`${baseUrl}/api/tasks/999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" })
    });
    assert.equal(resPatch.status, 404);
    const errPatch = await resPatch.json();
    assert.equal(errPatch.error, "Task not found.");

    // DELETE nonexistent task
    const resDelete = await fetch(`${baseUrl}/api/tasks/999`, { method: "DELETE" });
    assert.equal(resDelete.status, 404);
    const errDelete = await resDelete.json();
    assert.equal(errDelete.error, "Task not found.");
  });
});

// 5. Database Errors (500) and No Information Leakage
test("Returns 500 without leaking database details or stack trace on DB error", async () => {
  await withServer(async ({ baseUrl, db }) => {
    db.setFail(true);

    // GET /api/tasks failure
    const resGet = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(resGet.status, 500);
    const errGet = await resGet.json();
    assert.equal(errGet.error, "Internal server error.");
    assert.equal(errGet.stack, undefined);
    assert.equal(errGet.sql, undefined);

    // POST /api/tasks failure
    const resPost = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid Title" })
    });
    assert.equal(resPost.status, 500);
    const errPost = await resPost.json();
    assert.equal(errPost.error, "Internal server error.");

    // PATCH /api/tasks/:id failure
    const resPatch = await fetch(`${baseUrl}/api/tasks/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid Title" })
    });
    assert.equal(resPatch.status, 500);
    const errPatch = await resPatch.json();
    assert.equal(errPatch.error, "Internal server error.");

    // DELETE /api/tasks/:id failure
    const resDelete = await fetch(`${baseUrl}/api/tasks/1`, { method: "DELETE" });
    assert.equal(resDelete.status, 500);
    const errDelete = await resDelete.json();
    assert.equal(errDelete.error, "Internal server error.");
  });
});
