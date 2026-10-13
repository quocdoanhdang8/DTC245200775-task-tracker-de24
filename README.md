# DTC245200775 — Task Tracker (Đề 24)

Ứng dụng Node.js/Express và PostgreSQL qua Nginx, đóng gói bằng Docker Compose. Phiên bản này bổ sung giám sát metrics bằng Prometheus và Grafana.

## Khởi động

Sao chép .env.example thành .env, thay các mật khẩu mẫu, rồi chạy docker compose config và docker compose up -d --build.

- Website: http://localhost:8080
- pgAdmin: http://localhost:5050
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

Prometheus thu thập metrics của ứng dụng, PostgreSQL, Nginx và container. Dashboard Task Tracker Overview được provision trong Grafana. Xác minh trạng thái scrape sau khi khởi động.
