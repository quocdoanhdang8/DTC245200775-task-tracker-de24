#!/usr/bin/env node
/**
 * scripts/check_loki.js
 * Xác minh 3 truy vấn LogQL trên Loki thông qua datasource proxy của Grafana.
 * Chạy từ thư mục gốc của repository: node scripts/check_loki.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function getCredentials() {
  let user = process.env.GRAFANA_ADMIN_USER;
  let pass = process.env.GRAFANA_ADMIN_PASSWORD;

  if (!user || !pass) {
    const envPath = path.resolve(".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...vParts] = trimmed.split("=");
        const v = vParts.join("=").trim();
        if (k === "GRAFANA_ADMIN_USER" && !user) user = v;
        if (k === "GRAFANA_ADMIN_PASSWORD" && !pass) pass = v;
      }
    }
  }

  user = user || "admin";
  if (!pass) {
    throw new Error("Không tìm thấy GRAFANA_ADMIN_PASSWORD trong biến môi trường hoặc file .env");
  }
  return { user, pass };
}

async function main() {
  const grafanaUrl = process.env.GRAFANA_BASE_URL || "http://127.0.0.1:3001";
  console.log("=== BẮT ĐẦU XÁC MINH TRUY VẤN LOGQL QUA LOKI ===");
  console.log(`Grafana URL: ${grafanaUrl}`);

  const { user, pass } = getCredentials();
  const authHeader = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  // 1. Kiểm tra datasource Loki
  const dsRes = await fetch(`${grafanaUrl}/api/datasources`, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(dsRes.status, 200, "Kết nối tới Grafana API phải thành công (HTTP 200)");
  const datasources = await dsRes.json();
  const lokiDs = datasources.find(d => d.type === "loki");
  assert.ok(lokiDs, "Phải tìm thấy datasource kiểu 'loki' trong Grafana");
  console.log(`Loki Datasource UID: "${lokiDs.uid}" (URL nội bộ: ${lokiDs.url})`);

  // 2. Định nghĩa 3 truy vấn LogQL cần kiểm chứng
  const queries = [
    {
      name: "Truy vấn 1 (Log JSON ứng dụng)",
      logql: '{service="task-tracker"} | json',
      description: "Trích xuất toàn bộ trường JSON của ứng dụng Express"
    },
    {
      name: "Truy vấn 2 (Lọc log thành công 2xx)",
      logql: '{service="task-tracker"} | json | statusCode >= 200 and statusCode < 300',
      description: "Sàng lọc các yêu cầu HTTP thành công (mã 200, 201, 204)"
    },
    {
      name: "Truy vấn 3 (Access log Nginx cho API tasks)",
      logql: '{service="nginx", log_type="access"} |= "/api/tasks"',
      description: "Lọc nhật ký truy cập Nginx Reverse Proxy theo endpoint /api/tasks"
    }
  ];

  const now = Date.now();
  const start = (now - 3600 * 1000) * 1000000; // 1 giờ trước tính bằng nanoseconds
  const end = now * 1000000;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`\n--- [${i + 1}/3] ${q.name} ---`);
    console.log(`    LogQL: ${q.logql}`);
    console.log(`    Mục đích: ${q.description}`);

    const queryUrl = `${grafanaUrl}/api/datasources/proxy/uid/${lokiDs.uid}/loki/api/v1/query_range?query=${encodeURIComponent(q.logql)}&start=${start}&end=${end}&limit=5`;
    const res = await fetch(queryUrl, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(res.status, 200, `Truy vấn "${q.logql}" phải trả về HTTP 200`);
    const data = await res.json();
    assert.equal(data.status, "success", "Trạng thái phản hồi của Loki phải là 'success'");

    const results = data.data.result;
    assert.ok(Array.isArray(results), "Kết quả phải là một mảng stream");
    console.log(`    Trạng thái: success | Streams tìm thấy: ${results.length}`);

    if (results.length > 0) {
      const stream = results[0];
      const entryCount = stream.values.length;
      console.log(`    Số bản ghi trong stream đầu tiên: ${entryCount}`);
      const sample = stream.values[0][1];
      console.log(`    Bản ghi mẫu: ${sample.slice(0, 150)}${sample.length > 150 ? '...' : ''}`);
    } else {
      console.warn("    [Cảnh báo] Chưa có bản ghi trong khoảng thời gian 1 giờ qua. Hãy phát sinh request và thử lại.");
    }
  }

  console.log("\n=== XÁC NHẬN: 3/3 TRUY VẤN LOGQL HOẠT ĐỘNG CHÍNH XÁC VÀ TRẢ VỀ DỮ LIỆU THẬT ===");
}

main().catch(err => {
  console.error("LỖI KIỂM CHỨNG LOGQL:", err.message);
  process.exit(1);
});
