#!/usr/bin/env node
/**
 * scripts/verify_e2e.js
 * Kiểm thử tự động End-to-End (E2E) các API CRUD của Task Tracker qua Nginx Reverse Proxy.
 * Chạy từ thư mục gốc của repository: node scripts/verify_e2e.js
 */

const assert = require("node:assert/strict");

async function main() {
  const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:8080";
  console.log("=== BẮT ĐẦU E2E VERIFICATION QUA NGINX ===");
  console.log(`Endpoint kiểm thử: ${baseUrl}`);

  // 1. GET /health
  console.log("1. Kiểm tra GET /health...");
  const healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10000) });
  assert.equal(healthRes.status, 200, "Health check phải trả về HTTP 200");
  const healthData = await healthRes.json();
  console.log("   Health status:", JSON.stringify(healthData));
  assert.equal(healthData.status, "ok", "Trạng thái health phải là 'ok'");
  assert.equal(healthData.database, "connected", "Database phải là 'connected'");

  // 2. Tạo task có mã nhận diện riêng VERIFY-<random>
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const verifyTitle = `VERIFY-${randomSuffix}`;
  console.log(`2. Tạo task kiểm thử: "${verifyTitle}"...`);

  let createdId = null;
  let isDeleted = false;

  try {
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: verifyTitle,
        description: "Task kiểm thử tự động E2E qua Nginx Reverse Proxy",
        dueDate: "2026-10-31",
        status: "todo",
        priority: "high"
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(createRes.status, 201, "Tạo task mới phải trả về HTTP 201 Created");
    const createdTask = await createRes.json();
    createdId = createdTask.id;
    console.log(`   Task tạo thành công: ID=${createdId}, title="${createdTask.title}", priority="${createdTask.priority}"`);
    assert.equal(createdTask.title, verifyTitle);

    // 3. GET danh sách và lọc task theo từ khóa
    console.log(`3. GET danh sách và lọc task với từ khóa "${verifyTitle}"...`);
    const filterRes = await fetch(`${baseUrl}/api/tasks?q=${encodeURIComponent(verifyTitle)}`, {
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(filterRes.status, 200, "Truy vấn lọc task phải trả về HTTP 200 OK");
    const filteredTasks = await filterRes.json();
    console.log(`   Tìm thấy ${filteredTasks.length} task khớp từ khóa "${verifyTitle}"`);
    assert.ok(filteredTasks.some(t => t.id === createdId), "Task vừa tạo phải nằm trong kết quả lọc");

    // 4. Cập nhật PATCH trạng thái task
    console.log(`4. Cập nhật PATCH trạng thái task ${createdId} thành "in_progress"...`);
    const patchRes = await fetch(`${baseUrl}/api/tasks/${createdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(patchRes.status, 200, "Cập nhật task phải trả về HTTP 200 OK");
    const patchedTask = await patchRes.json();
    console.log(`   Task sau cập nhật: status="${patchedTask.status}"`);
    assert.equal(patchedTask.status, "in_progress");

    // 5. Xóa DELETE task kiểm thử
    console.log(`5. Xóa DELETE task ${createdId}...`);
    const deleteRes = await fetch(`${baseUrl}/api/tasks/${createdId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deleteRes.status, 204, "Xóa task hợp lệ phải trả về HTTP 204 No Content");
    isDeleted = true;
    console.log("   Xóa thành công (HTTP 204 No Content)");

    // 6. Xác minh PATCH task đã xóa trả về 404
    console.log(`6. Xác minh PATCH task đã xóa (ID=${createdId}) trả về HTTP 404...`);
    const patchDeletedRes = await fetch(`${baseUrl}/api/tasks/${createdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   Kết quả PATCH task đã xóa: status=${patchDeletedRes.status}`);
    assert.equal(patchDeletedRes.status, 404, "PATCH task đã xóa phải trả về HTTP 404 Not Found");

    // 7. Xác minh dữ liệu sai bị từ chối với mã 400
    console.log("7. Xác minh dữ liệu sai (tiêu đề rỗng, status sai) trả về HTTP 400...");
    const invalidDataRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   ", status: "invalid_status" }),
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   Kết quả dữ liệu sai: status=${invalidDataRes.status}`);
    assert.equal(invalidDataRes.status, 400, "Dữ liệu không hợp lệ phải trả về HTTP 400 Bad Request");

    // 8. Xác minh JSON cú pháp hỏng bị từ chối với mã 400
    console.log("8. Xác minh JSON cú pháp hỏng trả về HTTP 400...");
    const brokenJsonRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"title": "Unterminated JSON',
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   Kết quả JSON hỏng: status=${brokenJsonRes.status}`);
    assert.equal(brokenJsonRes.status, 400, "JSON hỏng phải trả về HTTP 400 Bad Request");

  } finally {
    // Dọn dẹp task nếu chưa được xóa (phòng ngừa trường hợp một bước giữa bị lỗi)
    if (createdId && !isDeleted) {
      try {
        console.log(`   [Cleanup] Đang dọn dẹp task ${createdId}...`);
        const cleanupRes = await fetch(`${baseUrl}/api/tasks/${createdId}`, {
          method: "DELETE", signal: AbortSignal.timeout(10000)
        });
        if (cleanupRes.status === 204) {
          console.log(`   [Cleanup] Đã dọn dẹp task ${createdId} thành công.`);
        } else {
          console.warn(`   [Cleanup Warning] HTTP ${cleanupRes.status}; kiểm tra lại task ${createdId}.`);
        }
      } catch (cleanupErr) {
        console.warn("   [Cleanup Warning] Không thể dọn dẹp task:", cleanupErr.message);
      }
    }
  }

  console.log("=== TẤT CẢ CÁC BƯỚC E2E QUA NGINX ĐÃ ĐẠT PASS 100% ===");
}

main().catch(err => {
  console.error("E2E VERIFICATION THẤT BẠI:", err.message);
  process.exit(1);
});
