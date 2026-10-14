const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTask } = require("../src/validation");

test("accepts a valid task and normalizes optional values", () => {
  const result = validateTask({ title: "  Finish report  ", dueDate: "2026-10-31", priority: "high" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.title, "Finish report");
  assert.equal(result.value.status, "todo");
  assert.equal(result.value.description, "");
});

test("rejects a title that is blank or too long", () => {
  assert.ok(validateTask({ title: "   " }).errors.length > 0);
  assert.ok(validateTask({ title: "x".repeat(161) }).errors.length > 0);
});

test("rejects unsupported status, priority, and malformed date", () => {
  const result = validateTask({ title: "Task", status: "blocked", priority: "urgent", dueDate: "31/10/2026" });
  assert.equal(result.errors.length, 3);
});

test("partial updates validate only submitted fields", () => {
  const result = validateTask({ status: "done" }, { partial: true });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value, { status: "done" });
});

test("accepts a task without dueDate and defaults dueDate to null", () => {
  const result = validateTask({ title: "Task without date" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.title, "Task without date");
  assert.equal(result.value.dueDate, null);
});
