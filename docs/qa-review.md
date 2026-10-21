# Rà soát repository Task Tracker Đề 24

Bản gốc được đối chiếu trực tiếp trên GitHub là `ae188b6c70f7e0ef5debe860e239d73a86e05325`. Lịch sử có đủ ba commit triển khai `8d265c0`, `4c5451a`, `fc35b1e` và các commit hoàn thiện sau đó. Bộ báo cáo mới dùng bìa khung đen có logo ICTU; 18 hình nội dung giữ nguyên và logo được lưu riêng trong repository.

## Vấn đề đã sửa

- PostgreSQL DATE được giữ dưới dạng `YYYY-MM-DD` theo từng pool, tránh chuyển local midnight sang UTC rồi lệch ngày. Validation từ chối năm 0000 vì PostgreSQL không có năm 0.
- ID task phải nằm trong miền BIGINT dương trước khi truy vấn database. Body JSON quá lớn trả 413; charset/encoding không hỗ trợ trả 415; lỗi JSON vẫn có request ID, log và metrics. Route không tồn tại trả JSON 404. Metrics dùng nhãn route hữu hạn thay vì mỗi URL tùy ý tạo thêm series.
- Click vào checkbox không còn tải lại danh sách trước sự kiện change. Nếu PATCH lỗi, checkbox khôi phục trạng thái trước đó. Lỗi này được tái hiện trong Chromium trước khi sửa.
- Dockerfile dùng `npm ci` và lockfile; build context loại `.env`, Git, node_modules và tài liệu. `.gitattributes` giữ shell script ở LF khi checkout trên Windows.
- Công cụ tạo `.env` dùng `crypto.randomBytes`, không in mật khẩu và không ghi đè môi trường hiện hữu. Loki checker đọc đúng `.env` có dấu nháy/khoảng trắng/comment bằng parser của Node.
- Persistence không ghi đè marker còn dở, so sánh nội dung marker thay vì chỉ ID và giữ thông tin phục hồi nếu dữ liệu không khớp. Tham số sai không kích hoạt restart. Hai wrapper trả mã lỗi khi tiến trình con bị dừng bởi signal. Cleanup E2E có timeout.
- Công cụ capture bỏ nhãn LIVE, giữ nội dung báo cáo rút gọn khi cập nhật log, không cố tìm block raw output đã được lược bỏ. Đã kiểm tra cú pháp PowerShell và chạy phần Python cập nhật nguồn trên fixture báo cáo rút gọn; chưa chạy lại phần desktop capture Windows trong phiên này.
- README được đồng bộ với lệnh PowerShell, tên hình hiện tại, trạng thái log-init, quyền CREATE của role ứng dụng, các giới hạn môi trường và cách chạy lại kiểm thử.

## Kết quả xác minh

Báo cáo đang rà soát: [Word](bao-cao-de24.docx), [PDF](bao-cao-de24.pdf), [nguồn Markdown](bao-cao-de24.md), [builder](build_report.py), [logo ICTU](ictu-logo.jpg). PDF nền người dùng gửi có đúng 10 trang; tôi đã cập nhật hai đoạn kết quả trên trang 10 bằng Times New Roman để tách rõ ảnh 12 ca cũ, kết quả code 13/13 và runtime Windows do người dùng cung cấp. Việc đó giữ PDF ở 10 trang nhưng không phải xuất lại bằng Word. DOCX builder chưa được phân trang thực tế bằng Word vì Word COM treo khi khởi tạo; vì vậy chưa thể xác nhận bộ Word/PDF đồng bộ hoặc sẵn sàng commit/push.

| Kiểm tra | Kết quả và phạm vi |
|---|---|
| Bộ Unit/API gốc | 12/12 pass trên Node 24; database giả lập |
| Harness hồi quy bổ sung | 20/20 pass trên Node 24; HTTP fixtures cách ly |
| Tương thích Node 22 | 32/32 pass khi chạy cả hai bộ |
| Chromium | CRUD, deadline, lọc, checkbox, rollback lỗi, escape HTML, 1440/768/390 px; không có page error |
| npm audit | 0 vulnerability được registry báo với dependency production tại thời điểm kiểm tra; không phải bảo đảm không còn mọi rủi ro |
| Docker Compose | `config --quiet` hợp lệ bằng Compose v2.39.4 và `.env.example`; chưa khởi chạy container ở môi trường audit |
| Cấu hình | YAML/JSON hợp lệ; 12 services, 6 volumes, 4 mạng chức năng; targets tham chiếu đúng service; app/DB không publish cổng host |
| Cú pháp | JavaScript, shell init, PowerShell capture và Python helper hợp lệ |
| Secrets | `.env` được ignore và chưa từng xuất hiện trong lịch sử file được kiểm tra; không thấy mẫu GitHub token, AWS access key hoặc private key trong các file text được quét |
| Báo cáo nhận mới | DOCX hợp lệ có 18 ảnh nội dung và logo bìa; PDF hợp lệ đúng 10 trang, đã xem đủ 10 trang. Tài sản 18 ảnh khớp byte với ảnh đã theo dõi; font PDF nhúng Times New Roman. |
| PDF cập nhật trang 10 | Dùng PDF người dùng gửi làm nền, cập nhật nội dung kiểm thử/provenance bằng PyMuPDF và font Times New Roman. Vẫn 10 trang và 19 ảnh hiển thị; không xuất lại bằng Word. |
| DOCX do builder dựng | Cú pháp builder đạt; DOCX dựng có 18 ảnh nội dung, logo, bốn bảng, toàn bộ run văn bản Times New Roman và 9 ngắt trang. Word COM treo khi khởi tạo nên chưa đo phân trang thực tế hoặc xuất PDF từ bản dựng; chưa xác nhận bộ Word/PDF cuối đồng bộ. |

Output runner nguyên bản được lưu tại [qa_unit_tests.log](logs/qa_unit_tests.log), [qa_harness.log](logs/qa_harness.log), [qa_node22.log](logs/qa_node22.log), [qa_browser.log](logs/qa_browser.log). Các fixture Loki/E2E/persistence không phải log của Docker thật. Những ảnh và log runtime Windows đã có được giữ làm minh chứng của đúng các phiên trước, không đổi ngày/ID hoặc nhận là minh chứng của bản source vừa sửa.

### Kết quả runtime Windows do người dùng cung cấp sau lần audit

Người dùng báo Docker build và runtime đạt: 11 service vận hành cùng `log-init` `Exited (0)`; E2E 8/8 và task ID 28 đã dọn; Loki 3/3 query có dữ liệu; marker persistence ID 29 còn nguyên sau restart rồi được dọn; cả năm Prometheus jobs UP, `pg_up=1`, `nginx_up=1`; dashboard Grafana có dữ liệu ở năm panel. Đây là thông tin do người dùng cung cấp, không được chạy lại trong phiên cập nhật tài liệu này. Không có log/ảnh mới kèm yêu cầu, nên không tạo minh chứng runtime mới. Hình 17 ghi lại phiên cũ có 12 ca; code mới đã đạt 13 ca Unit/API trong phiên kiểm tra trước. Hai kết quả được giữ riêng, không sửa ảnh hoặc gán kết quả mới cho ảnh cũ.

## Lệnh xác minh runtime khi cần chạy lại

Lần audit Codex trước không có Docker daemon nên không tự xác nhận runtime. Kết quả Windows người dùng cung cấp ở trên được ghi riêng, không kèm log/ảnh mới trong repository. Khi cần tái lập sau thay đổi source, dùng:

```powershell
git pull --ff-only origin main
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
node scripts/verify_e2e.js
node scripts/check_loki.js
node scripts/test_persistence.js
```

Kiểm tra lại `/health`, năm Prometheus targets và dashboard theo README. Không tạo lại `.env`, không dùng `down -v` và không chạy capture nếu muốn giữ chín ảnh chụp tay hiện tại.

Tên repository có MSSV `DTC245200775`; username GitHub hiện là `quocdoanhdang8`. Nếu yêu cầu “đặt tên theo mã số SV” áp dụng cho chính username tài khoản, cần đối chiếu với giảng viên. Lần rà soát này không đổi tên tài khoản hoặc URL repository.

## Hướng dẫn kiểm thử bổ sung (tùy chọn)

Các công cụ dưới đây phục vụ bảo trì và hồi quy; không phải yêu cầu chức năng bổ sung của Đề 24. Hướng dẫn khởi chạy và demo theo đề nằm trong [README](../README.md#7-kiểm-tra-và-demo-theo-yêu-cầu-đề-24).

### Unit/API và harness

Cài Node.js 22+ trên host để chạy script; cài dependencies bằng lockfile:

```powershell
npm --prefix app ci --ignore-scripts
npm --prefix app test
node --test scripts/qa_harness.test.js
npm --prefix app audit --omit=dev
```

Bộ ứng dụng hiện có **13 ca Unit/API** với database giả lập, gồm một ca bổ sung xác nhận body `text/plain` nhận HTTP 415. Harness bổ sung **20 ca hồi quy**: DATE theo múi giờ, ngày không hợp lệ, ID tràn BIGINT, HTTP 400/413/415, log/metrics của request bị từ chối, giới hạn nhãn metrics, sinh `.env`, Loki có/rỗng dữ liệu và retry, parser `.env`, marker thay đổi, cleanup E2E và exit codes.

**Harness dùng HTTP fixtures có chủ đích; kết quả của nó không thay cho xác minh Docker/PostgreSQL/Grafana/Loki thật.** Các lệnh runtime dưới đây cần stack đang chạy trên máy:

```powershell
node scripts/verify_e2e.js
node scripts/check_loki.js
node scripts/test_persistence.js
```

E2E kiểm tra tám bước qua Nginx, tạo task riêng và dọn task. Loki yêu cầu cả ba query có log entries; tự phát sinh GET an toàn và retry có giới hạn. Kiểm tra nhánh rỗng bằng `node scripts/check_loki.js --test-empty`: **exit 1 là kết quả mong đợi**, không phải runtime đang hỏng.

Persistence tự restart `db` và `task-app`; marker còn dở không bị ghi đè. Nếu phiên trước bị ngắt, dùng `node scripts/persistence_step2.js` để xác minh/dọn marker trước khi tạo mới. Có thể chạy thủ công: `node scripts/persistence_step1.js`, `docker compose restart db task-app`, `node scripts/persistence_step2.js`. Script chỉ xác minh restart đã thực hiện, không thay thế kiểm thử backup/restore.

### Kiểm tra giao diện bằng Chromium (tùy chọn)

`scripts/browser_smoke.js` chạy frontend thật trong Chromium với Express và database fixture cách ly: tạo/sửa/xóa, deadline, lọc, checkbox, rollback khi PATCH lỗi, escape HTML và ba chiều rộng 1440/768/390 px. Không chạm task thật. Playwright chỉ là công cụ kiểm thử tùy chọn, không phải dependency của image app:

```powershell
$browserTools = Join-Path $env:TEMP 'de24-browser-tools'
npm install --prefix $browserTools --no-save playwright
$env:PLAYWRIGHT_MODULE = Join-Path $browserTools 'node_modules\playwright'
node "$env:PLAYWRIGHT_MODULE\cli.js" install chromium
node scripts/browser_smoke.js
Remove-Item Env:PLAYWRIGHT_MODULE
```
