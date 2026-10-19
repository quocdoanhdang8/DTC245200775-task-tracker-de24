#!/usr/bin/env node
/**
 * scripts/check_loki.js
 * Xác minh 3 truy vấn LogQL trên Loki thông qua datasource proxy của Grafana.
 * Chạy từ thư mục gốc của repository: node scripts/check_loki.js
 *
 * Tính năng an toàn:
 * - Đếm tổng số log entries từ stream.values qua toàn bộ các streams.
 * - Tự động phát sinh request an toàn (GET /health, GET /api/tasks) và retry có giới hạn (tối đa 5 lần)
 *   khi Promtail chưa kịp đẩy log lên Loki.
 * - Khi bất kỳ truy vấn nào không có log entries (totalEntries === 0), từ chối in PASS và thoát với exit code khác 0.
 * - Chỉ in kết luận 3/3 thành công khi cả 3 truy vấn đều thực sự có entries > 0.
 * - Hỗ trợ cờ --test-empty để kiểm thử tình huống result: [] và xác nhận exit code != 0.
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSafeTraffic() {
  const appBase = process.env.APP_BASE_URL || "http://127.0.0.1:8080";
  try {
    await fetch(`${appBase}/health`, { signal: AbortSignal.timeout(5000) });
    await fetch(`${appBase}/api/tasks`, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    console.warn(`    [Cảnh báo phát sinh request]: ${err.message}`);
  }
}

async function queryLoki(grafanaUrl, lokiDsUid, authHeader, logql, start, end, limit = 10) {
  const queryUrl = `${grafanaUrl}/api/datasources/proxy/uid/${lokiDsUid}/loki/api/v1/query_range?query=${encodeURIComponent(logql)}&start=${start}&end=${end}&limit=${limit}`;
  const res = await fetch(queryUrl, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(res.status, 200, `Truy vấn "${logql}" phải trả về HTTP 200`);
  const data = await res.json();
  assert.equal(data.status, "success", "Trạng thái phản hồi của Loki phải là 'success'");

  const results = (data.data && Array.isArray(data.data.result)) ? data.data.result : [];
  const totalEntries = results.reduce((sum, s) => sum + (Array.isArray(s.values) ? s.values.length : 0), 0);
  return { results, totalEntries };
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

  // Kiểm thử tình huống result: [] khi được truyền cờ --test-empty
  if (process.argv.includes("--test-empty")) {
    console.log("\n=== CHẾ ĐỘ KIỂM THỬ ĐẶC TẢ: TÌNH HUỐNG result: [] (KHÔNG CÓ LOG) ===");
    console.log("Mục tiêu: Xác nhận script từ chối in PASS và thoát với exit code khác 0 khi query trả về result: [].");
    const emptyQuery = {
      name: "Truy vấn kiểm thử không tồn tại",
      logql: '{service="nonexistent_empty_test_service_99999"}',
      description: "Mô phỏng truy vấn không có log để kiểm tra cơ chế từ chối PASS"
    };
    const now = Date.now();
    const start = (now - 3600 * 1000) * 1000000;
    const end = now * 1000000;
    console.log(`Đang truy vấn LogQL giả định không có log: ${emptyQuery.logql}`);
    const { results, totalEntries } = await queryLoki(grafanaUrl, lokiDs.uid, authHeader, emptyQuery.logql, start, end, 5);
    console.log(`Kết quả nhận được từ Loki: streams = ${results.length}, totalEntries = ${totalEntries}`);
    if (totalEntries === 0) {
      console.error("❌ XÁC MINH KIỂM THỬ result: []: Không có log entries. Script KHÔNG in PASS và thoát với exit code 1.");
      process.exit(1);
    } else {
      console.error("Lỗi bất thường: Không mong đợi có log cho service giả lập.");
      process.exit(2);
    }
  }

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

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2000;
  let allQueriesSuccessful = true;
  const verifiedResults = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`\n--- [${i + 1}/${queries.length}] ${q.name} ---`);
    console.log(`    LogQL: ${q.logql}`);
    console.log(`    Mục đích: ${q.description}`);

    let querySuccess = false;
    let lastTotalEntries = 0;
    let lastResults = [];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const now = Date.now();
      const start = (now - 3600 * 1000) * 1000000; // 1 giờ trước tính bằng nanoseconds
      const end = now * 1000000;

      const { results, totalEntries } = await queryLoki(grafanaUrl, lokiDs.uid, authHeader, q.logql, start, end, 10);
      lastResults = results;
      lastTotalEntries = totalEntries;

      if (totalEntries > 0) {
        querySuccess = true;
        console.log(`    Trạng thái: success | Streams: ${results.length} | Tổng log entries: ${totalEntries}`);
        const firstWithValues = results.find(s => Array.isArray(s.values) && s.values.length > 0);
        if (firstWithValues) {
          const sample = firstWithValues.values[0][1];
          console.log(`    Số bản ghi trong stream đầu tiên: ${firstWithValues.values.length}`);
          console.log(`    Bản ghi mẫu: ${sample.slice(0, 150)}${sample.length > 150 ? "..." : ""}`);
        }
        break;
      }

      console.warn(`    [Lần thử ${attempt}/${MAX_RETRIES}] Chưa có log entries (totalEntries = 0). Đang phát sinh request an toàn tới Nginx...`);
      await generateSafeTraffic();
      await sleep(RETRY_DELAY_MS);
    }

    if (!querySuccess || lastTotalEntries === 0) {
      console.error(`    [THẤT BẠI] Truy vấn "${q.name}" không có log entry nào sau ${MAX_RETRIES} lần thử.`);
      allQueriesSuccessful = false;
      break;
    }

    verifiedResults.push({ name: q.name, streams: lastResults.length, entries: lastTotalEntries });
  }

  if (!allQueriesSuccessful || verifiedResults.length !== queries.length) {
    console.error("\n❌ KIỂM CHỨNG THẤT BẠI: Một hoặc nhiều truy vấn LogQL không có dữ liệu log. KHÔNG IN PASS.");
    process.exit(1);
  }

  console.log(`\n=== XÁC NHẬN: ${verifiedResults.length}/${queries.length} TRUY VẤN LOGQL HOẠT ĐỘNG CHÍNH XÁC VÀ TRẢ VỀ DỮ LIỆU THẬT ===`);
  for (const r of verifiedResults) {
    console.log(`  ✓ ${r.name}: ${r.streams} stream(s), ${r.entries} log entries.`);
  }
}

main().catch(err => {
  console.error("LỖI KIỂM CHỨNG LOGQL:", err.message);
  process.exit(1);
});
