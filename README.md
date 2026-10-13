# DTC245200775 — Task Tracker (Đề 24)

Ứng dụng quản lý công việc dùng Node.js, Express và PostgreSQL. Nginx làm reverse proxy; pgAdmin hỗ trợ quan sát dữ liệu.

## Khởi động

Sao chép .env.example thành .env, thay các mật khẩu mẫu, rồi chạy docker compose config và docker compose up -d --build.

- Website: http://localhost:8080
- pgAdmin: http://localhost:5050
- Health check: http://localhost:8080/health

Ứng dụng hỗ trợ tạo, xem, sửa, xóa và lọc công việc. Dữ liệu được lưu trong volume PostgreSQL. Chạy kiểm thử input bằng cd app && npm test.
