# Rà soát repository Task Tracker Đề 24

Bản gốc được đối chiếu trực tiếp trên GitHub là `ae188b6c70f7e0ef5debe860e239d73a86e05325`. Lịch sử có đủ ba commit triển khai `8d265c0`, `4c5451a`, `fc35b1e` và các commit hoàn thiện sau đó. Báo cáo Word 21 trang cùng 18 hình đã nộp vào repository được giữ nguyên trong lần rà soát này.

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
| Báo cáo | 18 ảnh nhúng, đủ tham chiếu ảnh; Word, Markdown báo cáo và screenshots không bị thay đổi bởi lần sửa source này |

Output runner nguyên bản được lưu tại [qa_unit_tests.log](logs/qa_unit_tests.log), [qa_harness.log](logs/qa_harness.log), [qa_node22.log](logs/qa_node22.log), [qa_browser.log](logs/qa_browser.log). Các fixture Loki/E2E/persistence không phải log của Docker thật. Những ảnh và log runtime Windows đã có được giữ làm minh chứng của đúng các phiên trước, không đổi ngày/ID hoặc nhận là minh chứng của bản source vừa sửa.

## Xác minh runtime sau khi lấy bản mới trên Windows

Môi trường audit không có Docker daemon nên không xác nhận lại image build, PostgreSQL, Nginx, Prometheus/Grafana/Loki đang chạy thật với bản source mới. Sau khi Windows working tree sạch, dùng:

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
