# BÁO CÁO HỌC PHẦN

## TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM

### ĐỀ 24 HỆ THỐNG QUẢN LÝ CÔNG VIỆC TASK TRACKER

**Sinh viên:** Đặng Quốc Doanh

**Mã số sinh viên:** DTC245200775

**Lớp:** KHMT K23A

**Trường:** Trường Đại học Công nghệ Thông tin và Truyền thông Thái Nguyên

**Giảng viên hướng dẫn:** Hoàng Văn Tâm

**Năm học:** 2026

**Thái Nguyên, tháng 10 năm 2026**

<!-- PAGEBREAK -->
<!-- REPORT_COMPACT -->

# MỤC LỤC

| Nội dung | Trang |
|---|---:|
| Chương 1 Giới thiệu và triển khai bằng Docker Compose | 3–4 |
| Chương 2 Các công nghệ sử dụng | 5 |
| Chương 3 Kiến trúc và luồng hoạt động | 6–7 |
| Chương 4 Task Tracker và PostgreSQL | 8–11 |
| Chương 5 Nginx reverse proxy và security headers | 12 |
| Chương 6 Prometheus và Grafana | 13–14 |
| Chương 7 Loki Promtail và LogQL | 15–16 |
| Chương 8 Hardening và kiểm thử | 17–19 |
| Kết luận và hướng phát triển | 20 |
| Tài liệu tham khảo | 20 |
| Phụ lục A Hướng dẫn chạy trên Windows | 21 |
| Phụ lục B GitHub và trình tự demo | 21 |

Báo cáo trình bày kiến trúc, quá trình triển khai và kết quả kiểm tra hệ thống Task Tracker. Các phần thực hành đi theo trình tự chạy dịch vụ, thao tác website, kiểm tra cơ sở dữ liệu, theo dõi metrics, truy vấn log và xác minh hardening. Mỗi hình có lệnh hoặc thao tác tương ứng để người đọc thực hiện lại.

Nhật ký kiểm tra đầy đủ được lưu trong `docs/logs/`. Mã chạy lại nằm trong `scripts/`; báo cáo chỉ giữ kết quả chính, tránh chép lại toàn bộ log dài.

<!-- PAGEBREAK -->

# CHƯƠNG 1 GIỚI THIỆU VÀ TRIỂN KHAI BẰNG DOCKER COMPOSE

## Mục tiêu và phạm vi

Task Tracker hỗ trợ tạo, xem, sửa, xóa và lọc công việc; mỗi task có tiêu đề, mô tả, hạn hoàn thành, trạng thái và mức ưu tiên. Dữ liệu được lưu trong PostgreSQL và xem bằng pgAdmin. Bản triển khai phục vụ quản lý công việc cá nhân trên máy chạy Docker Desktop; chưa có đăng nhập hoặc phân quyền theo nhóm.

Website được truy cập qua Nginx. Prometheus và Grafana giám sát ứng dụng, web server, database và container. Promtail chuyển log ứng dụng và Nginx vào Loki để truy vấn bằng LogQL. Toàn bộ dịch vụ được khai báo trong `docker-compose.yml`.

## Đối chiếu yêu cầu học phần

| Tiêu chí | Thành phần thực hiện | Bằng chứng trong báo cáo |
|---|---|---|
| GitHub và README | Source, cấu hình, lịch sử commit, hướng dẫn chạy | Phụ lục B; repository |
| Ứng dụng và database | Express, PostgreSQL, pgAdmin | Hình 4.1–4.5 |
| Nginx reverse proxy | Proxy tới task-app; 5 security headers | Hình 5.1 |
| Prometheus và Grafana | 5 scrape jobs; dashboard app, Nginx, DB, CPU | Hình 6.1–6.3 |
| Loki và Promtail | Thu thập file log; 3 truy vấn LogQL | Hình 7.1–7.2 |
| Hardening | Non-root, read-only, CapDrop, mạng và role DB | Hình 8.2–8.3 |
| Triển khai và trình bày | Compose, kiểm thử, persistence, hình minh chứng | Hình 1.1–1.2; Chương 8 |

## Khởi chạy và kiểm tra dịch vụ

Mở Docker Desktop, đợi Docker Engine sẵn sàng rồi chạy các lệnh sau tại thư mục gốc dự án. `config --quiet` chỉ kiểm tra cấu hình, tránh in mật khẩu đã nội suy từ `.env`.

```powershell
docker compose config --quiet
docker compose up -d --build
```

![Hình 1.1 Kiểm tra cấu hình và khởi chạy](screenshots/compose-startup.png)
*Hình 1.1. Kiểm tra Compose và khởi chạy các dịch vụ*

Dùng `docker compose ps -a` để xem cả container đang chạy và container đã kết thúc. Hệ thống có 12 service: 11 service vận hành và `log-init` chạy một lần để cấp quyền volume. `log-init` ở trạng thái `Exited (0)` là hoàn thành thành công; chỉ những service có healthcheck mới hiển thị `healthy`.

![Hình 1.2 Trạng thái dịch vụ](screenshots/services-status.png)
*Hình 1.2. Trạng thái các service và cổng được publish*

# CHƯƠNG 2 CÁC CÔNG NGHỆ SỬ DỤNG

Docker image đóng gói ứng dụng cùng môi trường chạy. Docker Compose mô tả các service, network, volume và healthcheck trong một tệp YAML, giúp triển khai lại bằng cùng bộ lệnh. Named volume lưu dữ liệu riêng với lớp filesystem của container; việc giữ volume không thay thế yêu cầu sao lưu database.

Node.js và Express cung cấp giao diện web, API CRUD, endpoint health và metrics. PostgreSQL giữ bảng `tasks`; pgAdmin là công cụ quan sát cấu trúc và dữ liệu. Truy vấn tham số hóa giúp ngăn dữ liệu người dùng bị ghép thành cú pháp SQL.

Nginx nhận request từ trình duyệt rồi chuyển tới ứng dụng trong Docker. Bản demo sử dụng HTTP kèm security headers theo lựa chọn đề cho phép. Headers hỗ trợ bảo vệ trình duyệt nhưng không mã hóa đường truyền như HTTPS.

Prometheus định kỳ lấy metrics; Grafana truy vấn và vẽ biểu đồ bằng PromQL. Exporter chuyển số liệu PostgreSQL, Nginx và container sang định dạng Prometheus. Loki lưu từng sự kiện log do Promtail chuyển đến; Grafana Explore dùng LogQL để tìm các request hoặc lỗi cụ thể.

Hardening giảm quyền và bề mặt truy cập của hệ thống. Trong bài, các biện pháp được kiểm tra gồm non-root trên app/Nginx, filesystem gốc chỉ đọc, bỏ capabilities, `no-new-privileges`, phân tách mạng và hạn chế cổng host.

# CHƯƠNG 3 KIẾN TRÚC VÀ LUỒNG HOẠT ĐỘNG

## Vai trò và cổng dịch vụ

| Service | Vai trò | Truy cập từ Windows |
|---|---|---|
| nginx | Reverse proxy và headers | `127.0.0.1:8080` |
| task-app | Web, API, health, metrics | Qua Nginx; không publish 3000 |
| db | PostgreSQL, volume dữ liệu | Nội bộ; không publish 5432 |
| pgadmin | Công cụ quản trị PostgreSQL | `127.0.0.1:5050` |
| prometheus | Thu thập và lưu metrics | `127.0.0.1:9090` |
| grafana | Dashboard và Explore | `127.0.0.1:3001` |
| loki và promtail | Lưu và chuyển log | Nội bộ |
| postgres-exporter | Metrics PostgreSQL | Nội bộ, 9187 |
| nginx-exporter | Metrics Nginx | Nội bộ, 9113 |
| cadvisor | Metrics container | Nội bộ, 8080 |
| log-init | Chuẩn bị quyền thư mục log | Chạy một lần, exit 0 |

## Sơ đồ và luồng dữ liệu

![Hình 3.1 Sơ đồ kiến trúc](architecture.png)
*Hình 3.1. Các thành phần và luồng HTTP, metrics, log*

Request đi từ trình duyệt đến Nginx, sau đó tới Express và PostgreSQL. App trả JSON/HTML; endpoint `/health` kiểm tra kết nối database. Prometheus chủ động scrape app và các exporter; Grafana đọc dữ liệu từ Prometheus. Với log, app và Nginx ghi file vào volume dùng chung, Promtail đọc file rồi gửi Loki; Grafana Explore truy vấn Loki.

## Phân tách mạng

| Mạng | Internal | Thành phần chính |
|---|---|---|
| front | Không | Nginx, task-app, nginx-exporter |
| data | Có | App, PostgreSQL, pgAdmin, postgres-exporter |
| observability | Có | App, Nginx, exporters, cAdvisor, Prometheus, Grafana, Loki, Promtail |
| management | Không | pgAdmin, Prometheus, Grafana |

Đây là bốn mạng chức năng. Compose có thể tạo thêm mạng default cho service khởi tạo; mạng đó không phục vụ luồng nghiệp vụ sau khi `log-init` kết thúc. Container nối nhiều mạng vẫn có thể đi ra ngoài qua mạng non-internal. Các giao diện quản trị chỉ bind loopback, phù hợp với demo tại cùng máy Windows.

# CHƯƠNG 4 TASK TRACKER VÀ POSTGRESQL

## Dữ liệu và kiểm tra đầu vào

| Trường | Nội dung và ràng buộc |
|---|---|
| id | Khóa chính tự tăng |
| title và description | Tiêu đề bắt buộc, tối đa 160 ký tự; mô tả tối đa 4.000 ký tự |
| due_date | Hạn hoàn thành kiểu DATE; có thể rỗng |
| status | todo, in_progress, done |
| priority | low, medium, high |
| created_at và updated_at | Thời điểm tạo, cập nhật |

Ứng dụng kiểm tra dữ liệu trước khi gửi SQL; PostgreSQL bổ sung CHECK constraints. Role `task_app` không phải superuser nhưng được cấp `USAGE, CREATE` trên schema `public` để chạy migration khi app khởi động. Vì vậy, quyền hiện tại rộng hơn một role chỉ được CRUD. Role `metrics_exporter` nhận `pg_monitor` để đọc thống kê phục vụ giám sát.

## Xem danh sách công việc

Mở `http://127.0.0.1:8080`. Kiểm tra danh sách và số lượng công việc theo trạng thái. Ảnh dưới minh họa các task mẫu có trạng thái và mức ưu tiên khác nhau.

![Hình 4.1 Giao diện Task Tracker](screenshots/task-tracker-ui.png)
*Hình 4.1. Website Task Tracker qua Nginx*

## Tạo và lọc công việc

Nhập tiêu đề, mô tả, hạn hoàn thành, mức ưu tiên và trạng thái; bấm tạo để lưu. Để trống hạn hoàn thành được chuẩn hóa thành `null`. Sau khi tạo, task xuất hiện trong danh sách; kiểm tra lại bằng pgAdmin hoặc API để xác nhận đã lưu vào DB.

![Hình 4.2 Biểu mẫu tạo task](screenshots/task-create.png)
*Hình 4.2. Nhập dữ liệu để tạo một công việc*

Chọn “Đang thực hiện” ở bộ lọc trạng thái. Danh sách chỉ giữ task có `status=in_progress`. API còn hỗ trợ tìm theo từ khóa bằng tham số `q`; khi demo có thể sửa một task sang `done`, lọc lại rồi xóa task thử.

![Hình 4.3 Lọc trạng thái](screenshots/task-filter.png)
*Hình 4.3. Danh sách sau khi lọc theo trạng thái*

## Kiểm tra API qua Nginx

Chạy `node scripts/verify_e2e.js`. Script tạo task có mã riêng, tìm lại, cập nhật, xóa, kiểm tra 404 và dữ liệu sai; cuối cùng dọn task kiểm thử. Kết quả được ghi trong `docs/logs/verify_e2e.log`.

| Thao tác | HTTP mong đợi và đã kiểm tra |
|---|---|
| GET /health | 200; status ok, database connected |
| POST /api/tasks | 201; task được tạo |
| GET với q | 200; tìm được task vừa tạo |
| PATCH task hợp lệ | 200; trạng thái được cập nhật |
| DELETE task hợp lệ | 204 |
| PATCH task đã xóa | 404 |
| Dữ liệu sai và JSON hỏng | 400 |

![Hình 4.4 Kiểm tra API](screenshots/api-e2e-terminal.png)
*Hình 4.4. Kết quả chạy kịch bản E2E qua Nginx*

## Kiểm tra dữ liệu bằng pgAdmin

Mở `http://127.0.0.1:5050` và kết nối server Task Tracker PostgreSQL. Host là `db`, port `5432`, database `task_tracker`, user `task_app`; sử dụng mật khẩu cục bộ tương ứng, không đưa mật khẩu vào ảnh. Trong Query Tool chạy:

```sql
SELECT id, title, due_date, status, priority FROM public.tasks ORDER BY id;
```

![Hình 4.5 PostgreSQL trên pgAdmin](screenshots/pgadmin-tasks.png)
*Hình 4.5. pgAdmin truy vấn dữ liệu trong public.tasks*

Kết quả có bản ghi chứng minh dữ liệu được lưu trong PostgreSQL. Số dòng thay đổi theo các task đang tồn tại; task E2E đã được xóa sau kiểm tra nên không cần xuất hiện trong bảng.

# CHƯƠNG 5 NGINX REVERSE PROXY VÀ SECURITY HEADERS

Nginx nhận request tại `127.0.0.1:8080`, proxy đến `task-app:3000` và chuyển tiếp thông tin client qua headers. App và PostgreSQL không publish cổng riêng ra Windows. Phương án sử dụng HTTP kèm headers đáp ứng lựa chọn của đề; báo cáo không coi đây là minh chứng HTTPS.

| Header | Ý nghĩa trong cấu hình |
|---|---|
| Content-Security-Policy | Giới hạn nguồn tải tài nguyên của trang |
| X-Frame-Options DENY | Không cho nhúng trang vào frame |
| X-Content-Type-Options nosniff | Hạn chế trình duyệt tự đoán MIME type |
| Referrer-Policy | Giảm thông tin referrer gửi đi |
| Permissions-Policy | Hạn chế camera, microphone và geolocation |

Chạy lệnh sau để chỉ lấy response headers; `--noproxy` bỏ qua proxy môi trường và `--max-time` giới hạn thời gian chờ:

```powershell
curl.exe --noproxy '*' --max-time 15 -sS -I http://127.0.0.1:8080/
```

![Hình 5.1 Response headers](screenshots/security-headers.png)
*Hình 5.1. Response qua Nginx có các security headers*

Kiểm tra dòng HTTP 200 và đủ năm header. Headers giảm một số rủi ro phía trình duyệt; khi đưa hệ thống lên Internet vẫn cần TLS, xác thực và rà soát cấu hình vận hành.

# CHƯƠNG 6 PROMETHEUS VÀ GRAFANA

## Kiểm tra các mục tiêu giám sát

Prometheus scrape định kỳ 15 giây. Mở `http://127.0.0.1:9090/targets`; trong lần kiểm tra, cả năm jobs đều UP.

| Job | Nguồn metrics | Nội dung theo dõi |
|---|---|---|
| task_tracker_app | task-app:3000/metrics | Request, latency, Node.js runtime |
| postgres | postgres-exporter:9187 | Kết nối và thống kê PostgreSQL |
| nginx | nginx-exporter:9113 | Kết nối Nginx qua stub_status |
| containers | cadvisor:8080 | Tài nguyên container |
| prometheus | localhost:9090 | Prometheus tự giám sát |

![Hình 6.1 Prometheus Targets](screenshots/prometheus-targets.png)
*Hình 6.1. Năm Prometheus targets ở trạng thái UP*

UP xác nhận scrape thành công. Kiểm tra thêm `pg_up=1` hoặc `nginx_up=1` để biết exporter đọc được dịch vụ tương ứng; một target UP chưa tự chứng minh mọi chức năng nghiệp vụ đều đúng.

## Truy vấn metrics ứng dụng

Truy cập website hoặc chạy E2E để phát sinh request. Trong Prometheus Query, nhập `task_tracker_http_requests_total` rồi Execute. Counter này đếm tổng request theo method, route và status_code; nó không trực tiếp biểu diễn số request mỗi giây.

![Hình 6.2 Truy vấn metric ứng dụng](screenshots/prometheus-metric-query.png)
*Hình 6.2. Các series của task_tracker_http_requests_total*

## Đọc dashboard Grafana

Mở `http://127.0.0.1:3001`, đăng nhập bằng tài khoản cục bộ và mở Task Tracker Overview. Chọn khoảng thời gian có request vừa tạo, bấm Refresh. Datasource Prometheus và Loki cùng dashboard được provision từ cấu hình trong repo.

![Hình 6.3 Dashboard Grafana](screenshots/grafana-dashboard.png)
*Hình 6.3. Dashboard giám sát ứng dụng, Nginx, DB và container*

Dashboard có request rate, latency p95, PostgreSQL exporter health, Nginx active connections và Container CPU. Rate dùng `rate(...[5m])`; p95 là độ trễ phân vị 95 ước tính từ histogram; `pg_up=1` là exporter kết nối được DB. Khi có No data, kiểm tra targets, datasource và time range trước khi thay cấu hình.

# CHƯƠNG 7 LOKI PROMTAIL VÀ LOGQL

App ghi log JSON vào `/var/log/app/app.jsonl`; Nginx ghi access/error log trong `/var/log/nginx`. Volume `service_logs` được gắn chỉ đọc vào Promtail tại `/var/log/collected`. Promtail thêm labels rồi gửi Loki; Grafana Explore dùng datasource Loki để truy vấn.

## Truy vấn trên Grafana Explore

Trong Explore, chọn Loki và khoảng thời gian có request. Chạy lần lượt ba query dưới đây; nên bật riêng từng query để dễ đọc kết quả.

```logql
{service="task-tracker"} | json
```

Query thứ nhất chọn log app và phân tích JSON để đọc method, path, statusCode, requestId và durationMs.

```logql
{service="task-tracker"} | json | statusCode >= 200 and statusCode < 300
```

Query thứ hai giữ các request thành công thuộc dải 2xx. Nếu chỉ viết `statusCode >= 200`, kết quả còn bao gồm lỗi 4xx và 5xx.

```logql
{service="nginx", log_type="access"} |= "/api/tasks"
```

Query thứ ba tìm access log Nginx có đường dẫn API task. Mỗi dòng là một request; các mã 204 và 404 có thể thuộc các request khác nhau, cần đối chiếu method, path và thời gian thay vì suy luận từ riêng mã lỗi.

![Hình 7.1 Explore và log](screenshots/grafana-explore.png)
*Hình 7.1. Grafana Explore truy vấn log qua datasource Loki*

## Kiểm tra tự động bằng API

Chạy `node scripts/check_loki.js`. Script yêu cầu cả ba query có log entries, phát sinh GET an toàn và retry có giới hạn khi chưa có dữ liệu. Nếu vẫn rỗng, script trả exit 1; chỉ thông báo thành công khi cả ba có entries. Output đầy đủ nằm tại `docs/logs/check_loki.log`.

![Hình 7.2 Kiểm tra LogQL bằng API](screenshots/loki-logql-verification.png)
*Hình 7.2. Kết quả ba truy vấn và số log entries*

Có thể chạy `node scripts/check_loki.js --test-empty` để kiểm tra nhánh không có dữ liệu; exit 1 là kết quả mong đợi của ca âm này. Lỗi database giả lập trong unit test chạy ở tiến trình test riêng, không phải mặc nhiên là log runtime gửi về Loki.

# CHƯƠNG 8 HARDENING VÀ KIỂM THỬ

## Bộ kiểm thử ứng dụng

Chạy `npm test` trong `app` hoặc dùng lệnh dưới từ gốc repo. Chế độ silent chỉ tắt log nội bộ của app trong tiến trình test, giữ nguyên assertions và kết quả của test runner:

```powershell
$env:LOG_LEVEL = 'silent'
npm --prefix app test -- --test-reporter=spec
Remove-Item Env:LOG_LEVEL
```

![Hình 8.1 Kết quả unit và API tests](screenshots/unit-api-tests.png)
*Hình 8.1. Kết quả 12 ca kiểm thử của ứng dụng*

Bộ test có 5 ca validation và 7 ca API với database giả lập: health, metrics, CRUD, dữ liệu sai, 404 và lỗi database không làm lộ SQL/stack trong response. Kết quả 12/12 pass được lưu tại `docs/logs/unit_tests.log`. E2E ở Chương 4 bổ sung kiểm tra với stack PostgreSQL thật qua Nginx.

## Xác minh hardening container

```powershell
docker compose exec -T task-app id
docker compose exec -T nginx id
```

App chạy UID 10001, Nginx UID 101. Docker inspect xác nhận hai service có `ReadOnlyRootfs=true`, `CapDrop=[ALL]` và `no-new-privileges`. Rootfs chỉ đọc vẫn cho phép ghi vào volume hoặc tmpfs đã cấp; không nên coi đó là biện pháp ngăn mọi kiểu ghi dữ liệu.

![Hình 8.2 Kiểm tra cấu hình hardening](screenshots/hardening-verification.png)
*Hình 8.2. UID và cấu hình bảo vệ của app và Nginx*

`log-init` chạy root một lần để chown thư mục log rồi exit 0. Không khẳng định toàn bộ container đều non-root hoặc đều có cùng cấu hình hardening. Các mount quan sát host của cAdvisor được khai báo read-only nhưng vẫn cần được đánh giá khi triển khai ngoài môi trường demo.

## Kiểm tra mạng và quyền database

```powershell
docker network inspect task-tracker-de24_data task-tracker-de24_observability
```

Chỉ đọc các trường cần kiểm tra: hai mạng có Internal=true; app và DB không có cổng publish; các giao diện được bind `127.0.0.1`. Truy vấn `pg_roles` xác nhận `task_app` và `metrics_exporter` không phải superuser. Không in toàn bộ Compose sau nội suy hoặc `.env` khi chụp minh chứng.

![Hình 8.3 Network và database roles](screenshots/networks-db-roles.png)
*Hình 8.3. Network isolation, role PostgreSQL và port bindings*

Các biện pháp đã áp dụng gồm non-root app/Nginx, rootfs chỉ đọc, CapDrop, no-new-privileges, phân tách mạng, loopback ports, role DB không phải superuser và secrets cục bộ được Git ignore. Quyền CREATE của `task_app` phục vụ migration được nêu tại Chương 4; có thể tách role migration để thu hẹp quyền ở môi trường vận hành lâu dài.

## Kiểm tra dữ liệu sau restart

Chạy `node scripts/test_persistence.js`. Script tạo marker task riêng, restart `db` và `task-app`, chờ health phục hồi, tìm lại marker rồi xóa. Không dùng `down -v`, vì tùy chọn đó xóa named volumes.

![Hình 8.4 Kiểm tra persistence](screenshots/persistence-restart.png)
*Hình 8.4. Marker còn sau restart và được dọn thành công*

Kết quả xác nhận marker còn sau restart và được xóa với HTTP 204. Phép kiểm tra này chứng minh dữ liệu tồn tại qua chu kỳ restart đã thực hiện, không phải kiểm thử backup/restore hoặc mọi tình huống mất dữ liệu. Log nằm tại `docs/logs/test_persistence.log`.

## Tổng hợp kết quả

| Hạng mục | Kết quả ghi nhận |
|---|---|
| Compose và dịch vụ | Cấu hình hợp lệ; 11 service vận hành, log-init exit 0 |
| Unit và API tests | 12/12 pass |
| E2E qua Nginx | 8 bước đạt; task thử đã dọn |
| Prometheus | 5/5 targets UP; app metric có dữ liệu |
| Grafana và Loki | Dashboard có dữ liệu; 3 query LogQL có entries |
| Hardening | Các thuộc tính app/Nginx, mạng, role và port đã kiểm tra |
| Persistence | Marker còn sau restart; dọn thành công |

# KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

Đề tài đã triển khai Task Tracker với PostgreSQL và pgAdmin bằng Docker Compose; website đi qua Nginx có security headers. Prometheus/Grafana cung cấp giám sát container, web và DB; Loki/Promtail hỗ trợ ba truy vấn LogQL. Các kịch bản kiểm tra, hình và log được lưu cùng repository để thực hiện lại khi demo.

Hệ thống hiện phục vụ quản lý công việc cá nhân trên máy demo. Các giới hạn gồm chưa có xác thực/phân quyền nhóm, chưa cấu hình HTTPS và chưa triển khai quy trình sao lưu/khôi phục. Hướng mở rộng phù hợp là tách role migration khỏi role ứng dụng, bổ sung đăng nhập nếu cần dùng chung, TLS, backup và cảnh báo giám sát. Promtail được giữ để đáp ứng stack của đề; khi nâng cấp cần đánh giá phương án thu thập log thay thế và kiểm tra tương đương.

# TÀI LIỆU THAM KHẢO

1. Docker Compose documentation: https://docs.docker.com/compose/
2. PostgreSQL 17 documentation: https://www.postgresql.org/docs/17/
3. Express documentation: https://expressjs.com/
4. Nginx documentation: https://nginx.org/en/docs/
5. Prometheus documentation: https://prometheus.io/docs/
6. Grafana documentation: https://grafana.com/docs/grafana/latest/
7. Loki và LogQL documentation: https://grafana.com/docs/loki/latest/
8. Repository Task Tracker Đề 24: https://github.com/quocdoanhdang8/DTC245200775-task-tracker-de24

# PHỤ LỤC A HƯỚNG DẪN CHẠY TRÊN WINDOWS

Môi trường cần Docker Desktop đang chạy, Git và PowerShell. Node.js dùng để chạy script kiểm tra ngoài container; Python cùng python-docx/Pillow dùng để dựng báo cáo. Tại thư mục dự án:

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
Invoke-RestMethod 'http://127.0.0.1:8080/health'
```

Với clone mới, tạo `.env` từ `.env.example` và đặt mật khẩu riêng trước khi chạy. Không ghi đè `.env` của môi trường đã có. Đổi mật khẩu trong file không tự đổi tài khoản đã khởi tạo trong volume PostgreSQL, Grafana hoặc pgAdmin; cần cập nhật dịch vụ tương ứng.

| Giao diện | URL |
|---|---|
| Website Task Tracker | http://127.0.0.1:8080 |
| pgAdmin | http://127.0.0.1:5050 |
| Prometheus Targets | http://127.0.0.1:9090/targets |
| Grafana | http://127.0.0.1:3001 |

Chạy lại E2E, Loki và persistence bằng các script ở Chương 4, 7, 8. Dừng stack bằng `docker compose down` và giữ nguyên volumes. Khi có lỗi, xem đúng service bằng `docker compose logs --tail=50 TEN_SERVICE`; kiểm tra health, targets, time range và datasource trước khi chỉnh cấu hình.

# PHỤ LỤC B GITHUB VÀ TRÌNH TỰ DEMO

Mã nguồn, cấu hình Nginx/monitoring, Compose, README và báo cáo được quản lý trên repository của đề tài. Ba mốc triển khai ban đầu có nội dung tương ứng yêu cầu học phần:

| Commit | Nội dung |
|---|---|
| 8d265c0 | Task Tracker, PostgreSQL, pgAdmin và Nginx |
| 4c5451a | Prometheus, Grafana và exporters |
| fc35b1e | Loki, Promtail, hardening và báo cáo |

Các commit sau bổ sung kiểm thử, ảnh chụp và hoàn thiện tài liệu. Có thể đối chiếu bằng `git log --oneline --reverse`; dùng `git status -sb` để kiểm tra trạng thái local/remote. `.env` được Git ignore; không đưa mật khẩu hoặc token vào README hay minh chứng.

Trình tự demo: xem Compose services; tạo/sửa/lọc một task trên website; kiểm tra pgAdmin; xem headers; mở Prometheus Targets và Grafana dashboard; chạy ba LogQL; chỉ ra UID/mạng/role; trình bày test và persistence. Khi giải thích, phân biệt metrics với log, HTTP headers với HTTPS và restart persistence với backup/restore.
