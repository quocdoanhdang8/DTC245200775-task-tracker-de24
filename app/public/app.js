const labels = { todo: "Chưa bắt đầu", in_progress: "Đang thực hiện", done: "Đã hoàn thành", low: "Ưu tiên thấp", medium: "Ưu tiên vừa", high: "Ưu tiên cao" };
const list = document.querySelector("#task-list");
const form = document.querySelector("#task-form");
const filter = document.querySelector("#status-filter");
let tasks = [];
let editingId = null;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!response.ok) {
    let message = `Yêu cầu thất bại (${response.status}).`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function updateStats() {
  document.querySelector("#total-count").textContent = tasks.length;
  document.querySelector("#todo-count").textContent = tasks.filter((task) => task.status === "todo").length;
  document.querySelector("#progress-count").textContent = tasks.filter((task) => task.status === "in_progress").length;
  document.querySelector("#done-count").textContent = tasks.filter((task) => task.status === "done").length;
}

function render() {
  updateStats();
  if (!tasks.length) {
    list.innerHTML = '<div class="empty">Chưa có công việc phù hợp. Hãy tạo công việc đầu tiên ở biểu mẫu bên cạnh.</div>';
    return;
  }
  list.innerHTML = tasks.map((task) => `<article class="task">
    <input class="task-check" type="checkbox" data-action="complete" data-id="${task.id}" aria-label="Đánh dấu hoàn thành" ${task.status === "done" ? "checked" : ""}>
    <div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
      <div class="task-meta"><span class="pill ${task.status}">${labels[task.status]}</span><span class="pill ${task.priority}">${labels[task.priority]}</span>${task.dueDate ? `<span>Hạn: ${escapeHtml(String(task.dueDate).slice(0, 10))}</span>` : ""}</div>
    </div>
    <div class="task-actions"><button class="icon-button" data-action="edit" data-id="${task.id}" aria-label="Sửa công việc">Sửa</button><button class="icon-button" data-action="delete" data-id="${task.id}" aria-label="Xóa công việc">Xóa</button></div>
  </article>`).join("");
}

async function loadTasks() {
  list.innerHTML = '<div class="empty">Đang tải công việc…</div>';
  try {
    const query = filter.value ? `?status=${encodeURIComponent(filter.value)}` : "";
    tasks = await api(`/api/tasks${query}`);
    render();
  } catch (error) {
    list.innerHTML = `<div class="empty">Không tải được dữ liệu: ${escapeHtml(error.message)}</div>`;
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  form.elements.priority.value = "medium";
  form.elements.status.value = "todo";
  document.querySelector("#form-title").textContent = "Tạo công việc";
  document.querySelector("#submit-button").innerHTML = 'Thêm công việc <span>→</span>';
  document.querySelector("#cancel-edit").classList.add("hidden");
  document.querySelector("#form-error").textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const task = Object.fromEntries(data.entries());
  task.dueDate ||= null;
  try {
    await api(editingId ? `/api/tasks/${editingId}` : "/api/tasks", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(task) });
    resetForm();
    await loadTasks();
  } catch (error) { document.querySelector("#form-error").textContent = error.message; }
});

document.querySelector("#cancel-edit").addEventListener("click", resetForm);
filter.addEventListener("change", loadTasks);
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const task = tasks.find((item) => String(item.id) === button.dataset.id);
  if (!task) return;
  try {
    if (button.dataset.action === "delete") {
      if (!window.confirm(`Xóa công việc “${task.title}”?`)) return;
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    } else if (button.dataset.action === "edit") {
      editingId = task.id;
      for (const key of ["title", "description", "dueDate", "status", "priority"]) form.elements[key].value = key === "dueDate" ? String(task[key] || "").slice(0, 10) : task[key] || "";
      document.querySelector("#form-title").textContent = "Chỉnh sửa công việc";
      document.querySelector("#submit-button").innerHTML = 'Lưu thay đổi <span>→</span>';
      document.querySelector("#cancel-edit").classList.remove("hidden");
      document.querySelector("#title").focus();
      return;
    }
    await loadTasks();
  } catch (error) { window.alert(error.message); }
});

list.addEventListener("change", async (event) => {
  const checkbox = event.target.closest('[data-action="complete"]');
  if (!checkbox) return;
  const task = tasks.find((item) => String(item.id) === checkbox.dataset.id);
  if (!task) return;
  try {
    await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: checkbox.checked ? "done" : "todo" }) });
    await loadTasks();
  } catch (error) { window.alert(error.message); }
});

loadTasks();
