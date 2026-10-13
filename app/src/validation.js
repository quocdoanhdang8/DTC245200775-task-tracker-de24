const STATUSES = new Set(["todo", "in_progress", "done"]);
const PRIORITIES = new Set(["low", "medium", "high"]);

function validateTask(input, { partial = false } = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: ["Request body must be a JSON object."], value: null };
  }

  const value = {};
  if (!partial || Object.hasOwn(input, "title")) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      errors.push("Title is required.");
    } else if (input.title.trim().length > 160) {
      errors.push("Title must contain at most 160 characters.");
    } else value.title = input.title.trim();
  }

  if (!partial || Object.hasOwn(input, "description")) {
    if (input.description !== undefined && typeof input.description !== "string") {
      errors.push("Description must be text.");
    } else if ((input.description || "").length > 4000) {
      errors.push("Description must contain at most 4000 characters.");
    } else value.description = input.description || "";
  }

  if (!partial || Object.hasOwn(input, "dueDate")) {
    if (input.dueDate === null || input.dueDate === "") value.dueDate = null;
    else if (typeof input.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`)) || new Date(`${input.dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.dueDate) {
      errors.push("Due date must use YYYY-MM-DD or be empty.");
    } else value.dueDate = input.dueDate;
  }

  if (!partial || Object.hasOwn(input, "status")) {
    const status = input.status ?? "todo";
    if (typeof status !== "string" || !STATUSES.has(status)) errors.push("Status must be todo, in_progress, or done.");
    else value.status = status;
  }

  if (!partial || Object.hasOwn(input, "priority")) {
    const priority = input.priority ?? "medium";
    if (typeof priority !== "string" || !PRIORITIES.has(priority)) errors.push("Priority must be low, medium, or high.");
    else value.priority = priority;
  }

  return { errors, value };
}

module.exports = { validateTask, STATUSES, PRIORITIES };
