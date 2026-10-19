#!/usr/bin/env node
/**
 * scripts/test_persistence.js
 * Kiểm thử tính bền vững dữ liệu (Data Persistence) qua chu kỳ khởi động lại container PostgreSQL.
 * Chạy từ thư mục gốc của repository: node scripts/test_persistence.js
 * Hoặc chạy từng bước:
 *   node scripts/test_persistence.js --step1
 *   docker compose restart db task-app
 *   node scripts/test_persistence.js --step2
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:8080";
const markerFilePath = path.resolve(".persistence_marker.tmp");

async function createMarker() {
  console.log("=== BƯỚC 1: TẠO MARKER TASK TRƯỚC KHI RESTART ===");
  const markerTitle = `PERSISTENCE-MARKER-${Date.now()}`;
  console.log(`Đang tạo marker task: "${markerTitle}"...`);

  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: markerTitle,
      description: "Marker task kiểm chứng tính toàn vẹn dữ liệu volume postgres_data qua restart",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-10-31"
    }),
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(createRes.status, 201, "Tạo marker task phải trả về HTTP 201 Created");
  const task = await createRes.json();
  const markerId = task.id;
  console.log(`   Marker task đã tạo thành công: ID=${markerId}, title="${task.title}"`);

  fs.writeFileSync(markerFilePath, JSON.stringify({ markerId, markerTitle }), "utf8");
  console.log(`   Đã lưu thông tin marker vào ${path.basename(markerFilePath)}.`);
  return { markerId, markerTitle };
}

async function verifyAndCleanup() {
  console.log("=== BƯỚC 2: XÁC MINH MARKER TASK VÀ DỌN DẸP SAU KHI RESTART ===");
  if (!fs.existsSync(markerFilePath)) {
    throw new Error(`Không tìm thấy file ${markerFilePath}. Hãy chạy bước 1 trước.`);
  }

  const { markerId, markerTitle } = JSON.parse(fs.readFileSync(markerFilePath, "utf8"));
  console.log(`Đang tìm kiếm marker task ID=${markerId}, title="${markerTitle}"...`);

  // Đợi dịch vụ trở lại trạng thái healthy sau restart
  let healthy = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 200) {
        const body = await res.json();
        if (body.status === "ok" && body.database === "connected") {
          healthy = true;
          console.log(`   Hệ thống đã phục hồi healthy sau ${attempt} giây.`);
          break;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(healthy, "Ứng dụng và Database phải trở lại trạng thái healthy sau restart");

  // Truy vấn danh sách lọc theo tiêu đề marker
  const listRes = await fetch(`${baseUrl}/api/tasks?q=${encodeURIComponent(markerTitle)}`, {
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(listRes.status, 200, "Truy vấn danh sách task phải trả về HTTP 200 OK");
  const tasks = await listRes.json();
  const found = tasks.find(t => t.id === markerId);

  assert.ok(found, `Marker task ID ${markerId} PHẢI tồn tại trong cơ sở dữ liệu sau khi restart container!`);
  console.log(`   [XÁC NHẬN BỀN VỮNG] Marker task tồn tại nguyên vẹn: ID=${found.id}, title="${found.title}", status="${found.status}"!`);

  // Dọn dẹp marker task
  console.log(`Đang dọn dẹp marker task ${markerId}...`);
  const delRes = await fetch(`${baseUrl}/api/tasks/${markerId}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(delRes.status, 204, "Xóa marker task phải trả về HTTP 204 No Content");
  console.log("   Dọn dẹp marker task thành công (HTTP 204).");

  try { fs.unlinkSync(markerFilePath); } catch {}
  console.log("=== KIỂM TRA PERSISTENCE HOÀN TẤT VÀ ĐẠT PASS 100% ===");
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--step1") {
    await createMarker();
  } else if (arg === "--step2") {
    await verifyAndCleanup();
  } else {
    // Chạy trọn gói tự động
    await createMarker();
    console.log("\n--- TỰ ĐỘNG KHỞI ĐỘNG LẠI CONTAINER db VÀ task-app ---");
    execSync("docker compose restart db task-app", { stdio: "inherit" });
    await new Promise(r => setTimeout(r, 3000));
    await verifyAndCleanup();
  }
}

main().catch(err => {
  console.error("LỖI KIỂM TRA PERSISTENCE:", err.message);
  process.exit(1);
});
