# BÁO CÁO THỰC HÀNH

## TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM

### ĐỀ TÀI 24 — HỆ THỐNG QUẢN LÝ CÔNG VIỆC TASK TRACKER

**Sinh viên:** [HỌ VÀ TÊN]

**Mã số sinh viên:** [MSSV]

**Lớp:** [LỚP]

**Trường/Khoa:** [TRƯỜNG/KHOA]

**Giảng viên hướng dẫn:** [GIẢNG VIÊN]

**Năm học:** [NĂM HỌC]

**[ĐỊA ĐIỂM], tháng 10 năm 2026**

<!-- PAGEBREAK -->

# LỜI CẢM ƠN VÀ TÓM TẮT

Em xin cảm ơn giảng viên đã hướng dẫn các nội dung về triển khai, vận hành và bảo vệ hệ thống phần mềm. Bài thực hành giúp em vận dụng kiến thức về đóng gói ứng dụng, cấu hình mạng, quản trị cơ sở dữ liệu, giám sát metrics và tập trung log vào một hệ thống có thể khởi động bằng Docker Compose.

Đề tài xây dựng Task Tracker cho phép tạo, xem, cập nhật, xóa và lọc công việc theo trạng thái. Ứng dụng Node.js/Express lưu dữ liệu trong PostgreSQL; pgAdmin hỗ trợ quan sát dữ liệu. Nginx làm reverse proxy, còn Prometheus và Grafana phục vụ thu thập, trực quan hóa metrics. Loki nhận log do Promtail đọc từ các file log dùng chung. Các thành phần được chia mạng theo mục đích và thông tin bí mật được cung cấp qua tệp `.env` trên máy chạy.

Repository đã được chuẩn bị gồm source code, cấu hình, hướng dẫn, kiểm thử đầu vào và báo cáo này. Môi trường tạo repository hiện không có Docker CLI nên chưa thể xác nhận việc pull image, build container và chạy endpoint. Vì vậy báo cáo phân biệt cấu hình đã viết với kết quả phải kiểm tra sau khi chạy; mọi chỗ cần đo trực tiếp đều được đánh dấu `[CẦN KIỂM TRA SAU KHI CHẠY]`. Không sử dụng ảnh chụp giả.

**Từ khóa:** Docker Compose, Task Tracker, PostgreSQL, Nginx, Prometheus, Grafana, Loki, Promtail, hardening.

<!-- PAGEBREAK -->

# MỤC LỤC

| Nội dung | Trang |
|---|---:|
| Chương 1 — Giới thiệu đề tài và yêu cầu | 4 |
| Chương 2 — Cơ sở lý thuyết | 5 |
| Chương 3 — Phân tích và thiết kế kiến trúc | 6–7 |
| Chương 4 — Xây dựng ứng dụng và tích hợp PostgreSQL | 8 |
| Chương 5 — Nginx reverse proxy và bảo vệ HTTP | 9 |
| Chương 6 — Giám sát bằng Prometheus và Grafana | 10 |
| Chương 7 — Thu thập log với Loki, Promtail và LogQL | 11 |
| Chương 8 — Hardening, kiểm thử và kết quả | 12 |
| Kết luận và hướng phát triển | 13 |
| Tài liệu tham khảo | 14 |
| Phụ lục — Cài đặt, chạy và checklist demo | 15 |

## DANH MỤC HÌNH

- Hình 3.1. Kiến trúc các thành phần và luồng dữ liệu — chèn sơ đồ kiến trúc đã thiết kế.
- Hình 4.1. Giao diện Task Tracker có dữ liệu demo — sinh viên tự chụp.
- Hình 4.2. pgAdmin hiển thị bảng `tasks` — sinh viên tự chụp.
- Hình 5.1. Website truy cập qua Nginx và response headers — sinh viên tự chụp.
- Hình 6.1. Prometheus Targets — sinh viên tự chụp.
- Hình 6.2. Dashboard Task Tracker Overview — sinh viên tự chụp.
- Hình 7.1. LogQL hiển thị log ứng dụng và log Nginx — sinh viên tự chụp.
- Hình 8.1. Bằng chứng user non-root và các mạng Docker — sinh viên tự chụp.

## DANH MỤC BẢNG

- Bảng 3.1. Vai trò của các dịch vụ trong hệ thống.
- Bảng 4.1. Trường dữ liệu công việc.
- Bảng 6.1. Các job Prometheus.
- Bảng 8.1. Ma trận kiểm thử và trạng thái bằng chứng.

<!-- PAGEBREAK -->

# CHƯƠNG 1. GIỚI THIỆU ĐỀ TÀI VÀ YÊU CẦU

## 1.1 Bối cảnh

Trong nhóm học tập hoặc một dự án nhỏ, thông tin công việc thường nằm rải rác trong tin nhắn, bảng tính hoặc ghi chú cá nhân. Người thực hiện khó biết việc nào chưa bắt đầu, việc nào đang làm và việc nào đã hoàn tất. Đề tài Task Tracker xây dựng một ứng dụng web gọn nhẹ để quản lý những thông tin cốt lõi của công việc: tiêu đề, mô tả, hạn hoàn thành, trạng thái và mức ưu tiên.

Bài thực hành không chỉ đánh giá giao diện. Hệ thống cần được đóng gói, có cơ sở dữ liệu, được đặt sau reverse proxy, có giám sát metrics, có logging tập trung, có cấu hình bảo mật và có thể hướng dẫn người khác khởi chạy. Vì vậy cấu hình vận hành được lưu cùng source code trong repository để có thể rà soát và lặp lại.

## 1.2 Mục tiêu

Mục tiêu thứ nhất là triển khai CRUD công việc bằng Node.js/Express và lưu dữ liệu bền vững bằng PostgreSQL. Mục tiêu thứ hai là cung cấp pgAdmin để quan sát cấu trúc và dữ liệu. Mục tiêu thứ ba là đưa website qua Nginx, thêm các security headers cơ bản và không publish cổng ứng dụng trực tiếp. Mục tiêu thứ tư là cấu hình Prometheus scrape ứng dụng, cơ sở dữ liệu, Nginx và container; Grafana trình bày dashboard. Mục tiêu thứ năm là gửi log ứng dụng và Nginx đến Loki để truy vấn bằng LogQL. Cuối cùng, áp dụng nguyên tắc đặc quyền tối thiểu và ghi lại bằng chứng demo có thể kiểm tra.

## 1.3 Phạm vi và tiêu chí

Phạm vi là một môi trường demo trên máy cá nhân, chạy bằng Docker Compose, truy cập trên loopback. Hệ thống chưa hướng tới tải lớn, triển khai nhiều máy, xác thực người dùng, TLS cho tên miền công khai hay khôi phục thảm họa. Dữ liệu công việc là dữ liệu của một người dùng chung cho demo; ứng dụng không thực hiện phân quyền đa người dùng.

Tiêu chí hoàn thành gồm: website tạo/sửa/xóa/lọc được task; dữ liệu tồn tại sau khi container khởi động lại; pgAdmin kết nối được; website được truy cập qua Nginx; Prometheus có các target cần thiết; dashboard Grafana có dữ liệu; Loki truy vấn được ba mẫu LogQL; các biện pháp hardening được trình bày bằng cấu hình và bằng chứng. Trạng thái chạy thực tế sẽ được ghi sau buổi kiểm tra trên Docker Desktop.

<!-- PAGEBREAK -->

# CHƯƠNG 2. CƠ SỞ LÝ THUYẾT

## 2.1 Docker và Docker Compose

Docker image đóng gói ứng dụng cùng môi trường chạy. Container là tiến trình được khởi chạy từ image với filesystem và cấu hình riêng. Docker Compose mô tả nhiều service, mạng, volume, health check và phụ thuộc trong một tệp YAML. Nhờ đó có thể dùng cùng một bộ lệnh để dựng và dừng cả ứng dụng lẫn hệ thống giám sát.

Compose không tự tạo một nền tảng triển khai production. Máy chủ vẫn cần Docker Engine, image cần được cập nhật, secret cần được quản lý an toàn, và người vận hành cần theo dõi dung lượng volume. Trong bài này, `docker-compose.yml` là bản mô tả có thể đọc và rà soát được, còn `.env` lưu các giá trị riêng theo từng máy.

## 2.2 PostgreSQL và pgAdmin

PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ. Bảng `tasks` có khóa chính tăng tự động, ràng buộc độ dài tiêu đề, tập giá trị trạng thái và mức ưu tiên, cùng các mốc thời gian. Ứng dụng truy vấn tham số hóa để dữ liệu nhập vào không bị ghép trực tiếp thành cú pháp SQL. Volume riêng giữ dữ liệu ngoài vòng đời container.

pgAdmin là giao diện quản trị PostgreSQL. Nó kết nối đến hostname dịch vụ `db` trong mạng Docker chứ không dùng `localhost`, bởi mỗi container có network namespace riêng. Người dùng của pgAdmin và role của ứng dụng là hai tài khoản khác nhau; role `task_app` chỉ có quyền kết nối và tạo/quản lý đối tượng trong schema của ứng dụng.

## 2.3 Nginx reverse proxy

Reverse proxy nhận request từ trình duyệt rồi chuyển request đến máy chủ ứng dụng nội bộ. Cách này tạo một điểm vào thống nhất, cho phép ẩn cổng Node.js và thiết lập headers ở biên. Hệ thống nghe HTTP trên cổng 8080 để demo và dùng headers bảo vệ nội dung trình duyệt theo yêu cầu môn; chưa tạo chứng chỉ TLS. Khi đưa lên Internet cần domain, TLS hợp lệ và cấu hình tin cậy cho proxy.

## 2.4 Metrics và giám sát

Prometheus định kỳ gửi HTTP scrape tới endpoint metrics. Ứng dụng dùng `prom-client` tạo bộ đếm request, histogram thời gian xử lý và metrics mặc định của Node.js. Exporter chuyển thống kê PostgreSQL, trạng thái Nginx và thống kê container thành chuỗi metrics Prometheus. Grafana truy vấn datasource Prometheus để hiển thị chuỗi thời gian, truy vấn và dashboard.

## 2.5 Logging tập trung

Ứng dụng phát log JSON có trường service, mức log, sự kiện, request ID và thời gian xử lý. Nginx ghi access/error log vào volume dùng chung. Promtail đọc file theo đường dẫn cấu hình, thêm nhãn và gửi bản ghi đến Loki. Grafana Explore gửi LogQL đến Loki. Khác với metrics tổng hợp, log giữ từng sự kiện để tìm ngữ cảnh của một request hoặc lỗi.

<!-- PAGEBREAK -->

# CHƯƠNG 3. PHÂN TÍCH VÀ THIẾT KẾ KIẾN TRÚC

## 3.1 Các thành phần

| Thành phần | Trách nhiệm | Cổng nội bộ / host |
|---|---|---|
| Nginx | Điểm vào HTTP, proxy tới ứng dụng, security headers | 8080 / 127.0.0.1:8080 |
| Task Tracker | Giao diện, API, health và metrics | 3000 / không publish |
| PostgreSQL | Lưu task và role database | 5432 / không publish |
| pgAdmin | Truy cập quản trị DB trong demo | 80 / 127.0.0.1:5050 |
| Prometheus | Scrape và lưu metrics | 9090 / 127.0.0.1:9090 |
| Grafana | Dashboard và Explore | 3000 / 127.0.0.1:3001 |
| Loki/Promtail | Lưu và chuyển log | 3100, 9080 / không publish |
| Exporters | Chuyển metrics DB, Nginx, container | 9187, 9113, 8080 / không publish |

## 3.2 Phân tách mạng

Mạng `front` nối Nginx với ứng dụng. Mạng `data` nối ứng dụng, PostgreSQL, pgAdmin và Postgres Exporter; mạng này được khai báo `internal`. Mạng `observability` nối ứng dụng, Nginx, exporter, cAdvisor, Prometheus, Loki, Promtail và Grafana, cũng được khai báo `internal`. Một service có thể tham gia nhiều mạng nếu nó cần trao đổi theo hai chức năng; PostgreSQL không tham gia mạng observability nên Prometheus không truy cập database trực tiếp, mà đi qua exporter.

Các port giao diện trên host được bind vào loopback. Điều này thuận tiện khi demo tại máy cá nhân và hạn chế việc người dùng khác trong LAN tự truy cập. Người chấm cần xem trên cùng máy hoặc chủ động điều chỉnh `WEB_BIND_ADDRESS` theo môi trường được phép.

## 3.3 Luồng hoạt động

Khi người dùng mở trang, trình duyệt gửi HTTP tới Nginx. Nginx chuyển request tới app; app truy vấn PostgreSQL bằng role `task_app`, nhận hàng dữ liệu rồi trả JSON hoặc HTML. Health check của app chạy câu lệnh `SELECT 1`, còn health check database dùng `pg_isready`.

Prometheus chủ động scrape endpoint `/metrics` của app và ba exporter. Dữ liệu log đi theo hướng ngược lại: app và Nginx ghi vào volume, Promtail đọc các file chỉ đọc và push vào Loki. Grafana kết nối tới cả Prometheus và Loki để người vận hành chuyển từ xu hướng metrics sang sự kiện log.

**[CHÈN HÌNH 3.1 TẠI ĐÂY — sơ đồ kiến trúc và ba luồng HTTP, metrics, log. Dùng `docs/architecture.mmd` để dựng sơ đồ.]**

<!-- PAGEBREAK -->

# CHƯƠNG 4. XÂY DỰNG ỨNG DỤNG VÀ TÍCH HỢP POSTGRESQL

## 4.1 Chức năng người dùng

Giao diện web được viết bằng HTML, CSS và JavaScript thuần để dễ chạy, dễ giải thích và không cần frontend build riêng. Trang hiển thị số lượng công việc theo trạng thái, danh sách task, bộ lọc trạng thái và biểu mẫu tạo/cập nhật. Nút hoàn thành cập nhật trạng thái thành `done`; hành động xóa có bước xác nhận trên trình duyệt.

API cung cấp `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id` và `DELETE /api/tasks/:id`. Tham số lọc trạng thái và từ khóa được kiểm tra. ID chỉ chấp nhận chữ số. Máy chủ giới hạn độ dài tiêu đề/mô tả, định dạng ngày, trạng thái và mức ưu tiên. Giao diện escape ký tự HTML trước khi đặt nội dung trả về lên trang để giảm nguy cơ chèn markup.

## 4.2 Lược đồ và quyền

`db/migrations/001_tasks.sql` tạo bảng `tasks`, khóa chính `id`, trường tiêu đề bắt buộc, mô tả, ngày hạn, trạng thái, mức ưu tiên và thời gian tạo/cập nhật. Check constraints giữ tập trạng thái và mức ưu tiên ở phía database, ngoài kiểm tra ở ứng dụng. Hai index hỗ trợ lọc theo trạng thái/thời gian và truy vấn task có hạn.

Script init PostgreSQL tạo role `task_app` và `metrics_exporter`. `task_app` không phải superuser; app gửi lệnh SQL theo placeholders `$1` đến `$5`. Exporter nhận quyền quan sát thống kê qua role `pg_monitor`. PostgreSQL khởi tạo role chỉ khi volume database trống; thay mật khẩu sau đó cần cập nhật role hiện hữu hoặc tạo lại dữ liệu demo.

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `BIGSERIAL` | Khóa chính |
| `title` | `VARCHAR(160)` | Tiêu đề bắt buộc |
| `description` | `TEXT` | Mô tả, tối đa 4.000 ký tự |
| `due_date` | `DATE` | Ngày hoàn thành dự kiến, có thể rỗng |
| `status` | `VARCHAR(20)` | `todo`, `in_progress`, `done` |
| `priority` | `VARCHAR(10)` | `low`, `medium`, `high` |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | Theo dõi thời điểm tạo/cập nhật |

**[CHÈN HÌNH 4.1 — giao diện có task sau khi tạo trên máy demo.]**

**[CHÈN HÌNH 4.2 — pgAdmin kết nối server và hiển thị dữ liệu bảng `tasks`.]**

<!-- PAGEBREAK -->

# CHƯƠNG 5. NGINX REVERSE PROXY VÀ BẢO VỆ HTTP

Nginx dùng image unprivileged và lắng nghe cổng 8080. Docker Compose chỉ publish cổng này tới loopback. Cổng 3000 của Node.js chỉ được `expose` trong Docker, không có mapping ra host. Cấu hình proxy chuyển tiếp `Host`, địa chỉ client, chuỗi `X-Forwarded-For` và scheme tới app. Kết nối nội bộ được timeout giới hạn để tránh giữ request quá lâu.

Nginx thêm Content Security Policy chỉ cho phép tài nguyên cùng origin, chặn framing bằng `X-Frame-Options`, ngăn MIME sniffing, giảm thông tin Referer và tắt các quyền camera/microphone/geolocation. CSP của trang không tải script hoặc font từ nguồn bên ngoài. Các headers này bảo vệ một số lớp phía trình duyệt nhưng không thay cho TLS, xác thực, kiểm soát quyền hay cập nhật phần mềm.

Đề cho phép HTTPS tự ký hoặc security headers cơ bản. Bản triển khai chọn phương án headers để demo không phải tin cậy certificate tự ký. URL là `http://localhost:8080`; không được mô tả là HTTPS. Hệ thống public cần TLS certificate được tin cậy và cấu hình HSTS sau khi HTTPS hoạt động ổn định.

**Kiểm tra dự kiến:** mở DevTools hoặc chạy `curl -I http://localhost:8080/`, đối chiếu CSP, X-Frame-Options và X-Content-Type-Options. Kết quả thực tế: **[CẦN KIỂM TRA SAU KHI CHẠY]**.

**[CHÈN HÌNH 5.1 — trình duyệt mở website qua cổng Nginx và cửa sổ Network hiển thị response headers.]**

<!-- PAGEBREAK -->

# CHƯƠNG 6. GIÁM SÁT BẰNG PROMETHEUS VÀ GRAFANA

Prometheus sử dụng chu kỳ scrape 15 giây và cấu hình các target trong `monitoring/prometheus/prometheus.yml`. Ứng dụng tạo `task_tracker_http_requests_total`, histogram `task_tracker_http_request_duration_seconds` và metrics mặc định cho Node.js. Label route được chuẩn hóa thành các đường dẫn mẫu để tránh gắn từng ID task riêng, hạn chế tăng cardinality.

| Job | Target | Nội dung cần xác minh |
|---|---|---|
| `prometheus` | `localhost:9090` | Prometheus tự giám sát |
| `task_tracker_app` | `task-app:3000/metrics` | Request, latency và runtime Node |
| `postgres` | `postgres-exporter:9187` | Tình trạng và thống kê PostgreSQL |
| `nginx` | `nginx-exporter:9113` | Connection Nginx qua `stub_status` |
| `containers` | `cadvisor:8080` | CPU và resource container |

Dashboard JSON được provision tự động, datasource Prometheus và Loki cũng được provision. Một số biểu đồ tính tốc độ request, p95 latency, `pg_up`, kết nối active Nginx và CPU container. Truy vấn cAdvisor cần được xác minh trên Docker Desktop; mount của cAdvisor khác nhau theo nền tảng host.

Trình tự demo là mở Prometheus Targets, chụp trạng thái từng job, mở dashboard Grafana và tạo vài request để đường biểu diễn có dữ liệu. Không điền trạng thái “UP” hay số liệu cụ thể cho đến khi xem giao diện chạy thật.

**Kết quả Prometheus Targets:** [CẦN KIỂM TRA SAU KHI CHẠY].  
**Kết quả Dashboard Grafana:** [CẦN KIỂM TRA SAU KHI CHẠY].

**[CHÈN HÌNH 6.1 — Prometheus Status → Targets.]**

**[CHÈN HÌNH 6.2 — Dashboard Task Tracker Overview có số liệu sau khi tạo request.]**

<!-- PAGEBREAK -->

# CHƯƠNG 7. LOKI, PROMTAIL VÀ LOGQL

Pino ghi log JSON của app ra stdout và `/var/log/task-tracker/app.jsonl`. Nginx ghi access/error log vào `/var/log/nginx`. Volume `service_logs` được gắn ghi cho hai service và chỉ đọc cho Promtail. Script ngắn `log-init` chuẩn bị quyền sở hữu thư mục khi tạo volume lần đầu. Promtail đọc các đường dẫn tĩnh, trích `level` từ JSON ứng dụng, thêm labels `service`, `job`, `log_type` và gửi log tới Loki nội bộ.

Trong Grafana Explore, chọn datasource Loki và đặt khoảng thời gian bao gồm request vừa phát sinh. Truy vấn thứ nhất mở log app đã parse JSON:

```logql
{service="task-tracker"} | json
```

Truy vấn thứ hai chỉ lấy dòng mức error (Pino numeric level 50) và định dạng nội dung thông điệp:

```logql
{service="task-tracker", level="50"} | json | line_format "{{.msg}}"
```

Truy vấn thứ ba lọc access log theo endpoint task:

```logql
{service="nginx", log_type="access"} |= "/api/tasks"
```

Labels của LogQL trùng với labels gán trong cấu hình Promtail. Nếu chưa có log, cần phát sinh request trước, mở rộng time range, kiểm tra status container, quyền volume và `docker compose logs promtail loki`. Log có thể chứa dữ liệu người dùng; không ghi password hay body request. Pino chỉ log method, path, status, request ID và duration.

**Kết quả ba truy vấn:** [CẦN KIỂM TRA SAU KHI CHẠY].

**[CHÈN HÌNH 7.1 — Grafana Explore hiển thị từng truy vấn, label và dòng log thực tế.]**

Promtail được yêu cầu trong rubric nhưng đã hết vòng đời hỗ trợ từ ngày 2/3/2026. Việc giữ Promtail trong bài là để đáp ứng yêu cầu đề. Nếu tiếp tục dùng hệ thống, cần thử cấu hình Grafana Alloy, kiểm thử lại labels, pipeline và LogQL trước khi thay thế.

<!-- PAGEBREAK -->

# CHƯƠNG 8. HARDENING, KIỂM THỬ VÀ KẾT QUẢ

## 8.1 Biện pháp bảo vệ

Ứng dụng Node chạy bằng UID 10001, filesystem chỉ đọc và bỏ toàn bộ Linux capabilities. Nginx chạy bằng image unprivileged, chỉ nghe cổng cao 8080, filesystem chỉ đọc và dùng `/tmp` tạm. Hai service có `no-new-privileges`. PostgreSQL chỉ được truy cập từ mạng data, ứng dụng dùng role hạn chế. Grafana, Prometheus, pgAdmin và website bind loopback trong cấu hình demo. Mật khẩu được lấy từ `.env`, tệp đó bị ignore bởi Git.

cAdvisor cần quan sát filesystem hệ thống và Docker runtime để sinh metrics container. Các host mount khai báo read-only, service không khai báo `privileged`; tuy vậy quyền quan sát host vẫn là rủi ro cần ghi nhận. Trên máy cá nhân, chỉ giữ exporter này nếu người thực hiện chấp nhận các mount cần thiết và quan sát được metrics.

## 8.2 Kế hoạch kiểm thử

| Mã | Thao tác | Kết quả mong đợi | Bằng chứng / trạng thái |
|---|---|---|---|
| T01 | Tạo task hợp lệ | HTTP 201 và task lưu trong PostgreSQL | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T02 | Gửi tiêu đề rỗng hoặc ngày sai | HTTP 400, không ghi dữ liệu | Unit test validator; API [CẦN KIỂM TRA] |
| T03 | Sửa và xóa task | Dữ liệu thay đổi/xóa đúng | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T04 | Khởi động lại app | Task vẫn còn trong DB volume | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T05 | Mở Prometheus Targets | Các job cần thiết scrape được | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T06 | Mở Grafana dashboard | Có series ứng dụng, DB, Nginx, container | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T07 | Chạy 3 truy vấn LogQL | App, error và access log được trả về | [CẦN KIỂM TRA SAU KHI CHẠY] |
| T08 | Kiểm tra UID, networks, headers | Cấu hình phù hợp với hardening đã mô tả | [CẦN KIỂM TRA SAU KHI CHẠY] |

Repository cung cấp test Node.js cho hàm kiểm tra dữ liệu. Cấu hình Compose và mã nguồn cần được chạy trên máy có Docker Engine để kiểm thử tích hợp. **Trạng thái hiện tại của container, URL, metrics, dashboard, header và LogQL chưa được khẳng định là thành công vì chưa chạy Docker Compose trong môi trường tạo dự án.** Khi demo thực tế, cập nhật bảng bằng kết quả thật và chụp ảnh.

**[CHÈN HÌNH 8.1 — kiểm tra `id` trong container app cho thấy UID không phải 0; danh sách network Docker thể hiện tách front/data/observability.]**

<!-- PAGEBREAK -->

# KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

Đề tài đã chuẩn bị một stack Task Tracker có đủ source ứng dụng, lược đồ PostgreSQL, giao diện pgAdmin, Nginx reverse proxy, cấu hình metrics Prometheus/Grafana và log Loki/Promtail. Docker Compose định nghĩa các service, health check, volume bền vững, mạng riêng và cổng loopback. Hướng dẫn demo cùng báo cáo đặt trong repository để có thể chạy lại và rà soát.

Phần còn thiếu để kết luận bài hoàn thành thực nghiệm là khởi chạy trên máy có Docker Desktop, xử lý sai khác nền tảng nếu có, xác nhận từng target và truy vấn LogQL, đồng thời chụp ảnh minh chứng do sinh viên tự thực hiện. Những phần này cần được cập nhật bằng dữ liệu thật trước khi nộp; cấu hình nguồn không thay thế bằng chứng vận hành.

Hướng mở rộng gồm: bổ sung đăng nhập và phân quyền theo nhóm, lịch sử thay đổi, thông báo deadline, TLS với chứng chỉ hợp lệ, backup/restore database, cảnh báo Prometheus, thời hạn lưu log, kiểm tra image bằng phần mềm quét lỗ hổng và chuyển pipeline log từ Promtail sang Grafana Alloy sau khi kiểm thử tương đương.

<!-- PAGEBREAK -->

# TÀI LIỆU THAM KHẢO

1. Docker, “Docker Compose documentation”, https://docs.docker.com/compose/ (truy cập ngày 13/10/2026).
2. PostgreSQL Global Development Group, “PostgreSQL Documentation”, https://www.postgresql.org/docs/ (truy cập ngày 13/10/2026).
3. Express.js, “Express web framework”, https://expressjs.com/ (truy cập ngày 13/10/2026).
4. NGINX, “NGINX documentation”, https://nginx.org/en/docs/ (truy cập ngày 13/10/2026).
5. Prometheus, “Prometheus documentation”, https://prometheus.io/docs/introduction/overview/ (truy cập ngày 13/10/2026).
6. Grafana Labs, “Grafana documentation”, https://grafana.com/docs/grafana/latest/ (truy cập ngày 13/10/2026).
7. Grafana Labs, “Loki documentation”, https://grafana.com/docs/loki/latest/ (truy cập ngày 13/10/2026).
8. Grafana Labs, “Grafana Alloy documentation”, https://grafana.com/docs/alloy/latest/ (truy cập ngày 13/10/2026).
9. grafana/loki, thông báo trạng thái Promtail và định hướng Alloy, https://github.com/grafana/loki (truy cập ngày 13/10/2026).
10. Tài liệu cấu hình được xây dựng trong repository `DTC245200775-task-tracker-de24`, đặc biệt `docker-compose.yml`, `monitoring/` và `nginx/default.conf`.

<!-- PAGEBREAK -->

# PHỤ LỤC A. CÀI ĐẶT VÀ CHẠY HỆ THỐNG

1) Mở Docker Desktop, đợi báo engine đang chạy; kiểm tra `docker version` và `docker compose version`.
2) Clone repository và vào thư mục dự án.
3) Copy `.env.example` thành `.env`; đặt mật khẩu PostgreSQL admin, role ứng dụng, exporter, pgAdmin và Grafana. Dùng các giá trị riêng; không commit tệp này.
4) Chạy `docker compose config` để rà cấu hình sau nội suy.
5) Chạy `docker compose up -d --build`; đợi các health check.
6) Kiểm tra `docker compose ps` và log của `db`, `task-app`, `nginx`, `prometheus`, `promtail`, `loki`, `grafana`.
7) Mở `http://localhost:8080`, tạo một task, sửa trạng thái, lọc danh sách và xóa task thử.
8) Mở `http://localhost:5050`, đăng nhập pgAdmin và kiểm tra bảng `tasks`.
9) Mở `http://localhost:9090/targets`, sau đó `http://localhost:3001` với tài khoản từ `.env`.
10) Trong Grafana Explore chọn Loki và chạy ba truy vấn ở Chương 7.
11) Kiểm tra response headers, `docker inspect` user của app, `docker network ls` và port bindings.
12) Chụp ảnh từ màn hình demo, đặt tên rõ ràng và thay các placeholder hình trong báo cáo.

Dừng stack bằng `docker compose down`. Không dùng `docker compose down -v` nếu muốn giữ dữ liệu; tuỳ chọn `-v` xóa các volume và nội dung demo.

# PHỤ LỤC B. VỊ TRÍ ẢNH MINH CHỨNG

- Hình 4.1: website có ít nhất ba công việc với trạng thái/ưu tiên khác nhau.
- Hình 4.2: pgAdmin truy vấn `SELECT id, title, status, priority FROM tasks ORDER BY id;`.
- Hình 5.1: website qua Nginx và tab Network/Headers cho thấy security headers.
- Hình 6.1: Prometheus Targets với từng job và trạng thái scrape thực tế.
- Hình 6.2: Grafana Overview sau khi phát sinh request.
- Hình 7.1a–c: ba truy vấn LogQL kèm kết quả trên cùng một khoảng thời gian.
- Hình 8.1: `docker inspect`/`docker exec id` cho app và danh sách ba network Docker.

Mỗi ảnh phải chụp từ lần chạy thật. Không chỉnh sửa nội dung để biến trạng thái chưa chạy thành thành công; có thể che thông tin cá nhân hoặc mật khẩu nếu chúng xuất hiện.
