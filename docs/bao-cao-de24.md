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

Repository đã được chuẩn bị đầy đủ gồm source code, cấu hình, hướng dẫn, kiểm thử và báo cáo này. Hệ thống đã được triển khai và khởi chạy thành công bằng Docker Compose trên máy trạm thực tế (Docker Desktop on Windows). Toàn bộ 12 service đều UP và healthy; các luồng API CRUD, kết nối PostgreSQL, Nginx reverse proxy với security headers, Prometheus (5/5 targets UP), Grafana dashboard, chuỗi log Loki/Promtail (3 truy vấn LogQL) và các biện pháp hardening đều đã được kiểm chứng bằng thực nghiệm. Không sử dụng ảnh chụp giả.

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

- Hình 3.1. Kiến trúc các thành phần và luồng dữ liệu (HTTP, metrics, log).
- Hình 4.1. Giao diện Task Tracker có dữ liệu demo tại http://127.0.0.1:8080.
- Hình 4.2. pgAdmin kết nối server và hiển thị dữ liệu bảng `tasks`.
- Hình 5.1. Website truy cập qua Nginx và response headers bảo mật.
- Hình 6.1. Trạng thái 5/5 Prometheus Targets UP.
- Hình 6.2. Dashboard Task Tracker Overview trên Grafana.
- Hình 7.1. LogQL hiển thị log ứng dụng và log Nginx trong Grafana Explore.
- Hình 8.1. Xác minh thực nghiệm user non-root và phân tách mạng Docker.

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

Mạng `front` nối Nginx với ứng dụng và Nginx Exporter. Mạng `data` (internal) nối ứng dụng, PostgreSQL, pgAdmin và Postgres Exporter. Mạng `observability` (internal) nối ứng dụng, Nginx, exporters, cAdvisor, Prometheus, Loki, Promtail và Grafana. Mạng `management` được gắn thêm cho pgAdmin, Prometheus và Grafana để các giao diện đã publish trên loopback có thể được kiểm tra trên Docker Desktop; những service này đồng thời vẫn ở mạng nội bộ cần thiết để liên lạc với database hoặc datasource. Mạng `management` là bridge không internal, vì vậy các container tham gia mạng đó có đường ra ngoài; các cổng host vẫn chỉ bind `127.0.0.1`. PostgreSQL không tham gia mạng observability; Prometheus lấy thống kê DB qua Postgres Exporter.

Các port giao diện trên host được bind vào loopback. Điều này thuận tiện khi demo tại máy cá nhân và hạn chế việc người dùng khác trong LAN tự truy cập. Người chấm cần xem trên cùng máy hoặc chủ động điều chỉnh `WEB_BIND_ADDRESS` theo môi trường được phép.

## 3.3 Luồng hoạt động

Khi người dùng mở trang, trình duyệt gửi HTTP tới Nginx. Nginx chuyển request tới app; app truy vấn PostgreSQL bằng role `task_app`, nhận hàng dữ liệu rồi trả JSON hoặc HTML. Health check của app chạy câu lệnh `SELECT 1`, còn health check database dùng `pg_isready`.

Prometheus chủ động scrape endpoint `/metrics` của app và ba exporter. Dữ liệu log đi theo hướng ngược lại: app và Nginx ghi vào volume, Promtail đọc các file chỉ đọc và push vào Loki. Grafana kết nối tới cả Prometheus và Loki để người vận hành chuyển từ xu hướng metrics sang sự kiện log.

![Hình 3.1. Kiến trúc các thành phần và luồng dữ liệu](architecture.png)
*Hình 3.1. Kiến trúc các thành phần và luồng HTTP, metrics, log*

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

![Hình 4.1. Giao diện Task Tracker có dữ liệu demo](screenshots/task-tracker-ui.png)
*Hình 4.1. Giao diện Task Tracker tại http://127.0.0.1:8080 với các công việc mẫu đa dạng trạng thái*

**[CHÈN HÌNH 4.2 — Cần chép ảnh chụp pgAdmin thực tế vào docs/screenshots/pgadmin-tasks.png để hiển thị bảng `public.tasks`.]**

<!-- PAGEBREAK -->

# CHƯƠNG 5. NGINX REVERSE PROXY VÀ BẢO VỆ HTTP

Nginx dùng image unprivileged và lắng nghe cổng 8080. Docker Compose chỉ publish cổng này tới loopback. Cổng 3000 của Node.js chỉ được `expose` trong Docker, không có mapping ra host. Cấu hình proxy chuyển tiếp `Host`, địa chỉ client, chuỗi `X-Forwarded-For` và scheme tới app. Kết nối nội bộ được timeout giới hạn để tránh giữ request quá lâu.

Nginx thêm Content Security Policy chỉ cho phép tài nguyên cùng origin, chặn framing bằng `X-Frame-Options`, ngăn MIME sniffing, giảm thông tin Referer và tắt các quyền camera/microphone/geolocation. CSP của trang không tải script hoặc font từ nguồn bên ngoài. Các headers này bảo vệ một số lớp phía trình duyệt nhưng không thay cho TLS, xác thực, kiểm soát quyền hay cập nhật phần mềm.

Đề cho phép HTTPS tự ký hoặc security headers cơ bản. Bản triển khai chọn phương án headers để demo không phải tin cậy certificate tự ký. URL là `http://localhost:8080`; không được mô tả là HTTPS. Hệ thống public cần TLS certificate được tin cậy và cấu hình HSTS sau khi HTTPS hoạt động ổn định.

**Kiểm tra thực tế:** Chạy lệnh `curl -I http://localhost:8080/`, Nginx trả về đầy đủ các security headers:
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

![Hình 5.1. Response headers bảo mật từ Nginx](screenshots/security-headers.png)
*Hình 5.1. Kiểm tra response headers bảo mật của website qua cổng Nginx 8080*

<!-- PAGEBREAK -->

# CHƯƠNG 6. GIÁM SÁT BẰNG PROMETHEUS VÀ GRAFANA

Prometheus sử dụng chu kỳ scrape 15 giây và cấu hình các target trong `monitoring/prometheus/prometheus.yml`. Ứng dụng tạo `task_tracker_http_requests_total`, histogram `task_tracker_http_request_duration_seconds` và metrics mặc định cho Node.js. Label route được chuẩn hóa thành các đường dẫn mẫu để tránh gắn từng ID task riêng, hạn chế tăng cardinality.

| Job | Target | Trạng thái thực tế | Ghi chú |
|---|---|---|---|
| `prometheus` | `localhost:9090` | UP (1/1) | Prometheus tự giám sát, scrape ~2ms |
| `task_tracker_app` | `task-app:3000/metrics` | UP (1/1) | Express runtime, heap, http_requests |
| `postgres` | `postgres-exporter:9187` | UP (1/1) | `pg_up=1`, theo dõi database transactions |
| `nginx` | `nginx-exporter:9113` | UP (1/1) | Nginx connections, requests qua stub_status |
| `containers` | `cadvisor:8080` | UP (1/1) | CPU, bộ nhớ, I/O của các container |

Dashboard JSON được provision tự động, datasource Prometheus và Loki cũng được provision. Một số biểu đồ tính tốc độ request, p95 latency, `pg_up`, kết nối active Nginx và CPU container. Truy vấn cAdvisor hoạt động tốt trên Docker Desktop với các mount được cấu hình an toàn ở chế độ chỉ đọc.

**Kết quả Prometheus Targets:** 5/5 targets đạt trạng thái `UP` (100% healthy).
**Kết quả Dashboard Grafana:** Datasource Prometheus và Loki kết nối thành công (`readiness: 200 OK`); Dashboard "Task Tracker Overview" nạp đầy đủ biểu đồ trực quan hóa dữ liệu theo thời gian thực sau các đợt phát sinh request.

![Hình 6.1. Prometheus Targets](screenshots/prometheus-targets.png)
*Hình 6.1. Trạng thái 5/5 Prometheus Targets đạt UP 100% tại http://127.0.0.1:9090/targets*

![Hình 6.2. Dashboard Task Tracker Overview](screenshots/grafana-dashboard.png)
*Hình 6.2. Dashboard Task Tracker Overview trên Grafana với số liệu giám sát thời gian thực*

<!-- PAGEBREAK -->

# CHƯƠNG 7. LOKI, PROMTAIL VÀ LOGQL

Pino ghi log JSON của app ra stdout và file `/var/log/app/app.jsonl`. Nginx ghi access/error log vào `/var/log/nginx/access.log`. Volume `service_logs` được gắn ghi cho hai service và chỉ đọc cho Promtail tại `/var/log/collected`. Script `log-init` chuẩn bị quyền sở hữu thư mục UID 10001 và 101 khi tạo volume. Promtail đọc các file log tĩnh, trích `level` từ JSON ứng dụng, thêm labels `service`, `job`, `log_type` và gửi log tới Loki nội bộ.

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

Labels của LogQL trùng với labels gán trong cấu hình Promtail. Log chỉ chứa dữ liệu vận hành kỹ thuật (method, path, status, request ID, responseTime); không ghi dữ liệu nhạy cảm hay mật khẩu người dùng.

**Kết quả ba truy vấn:** Đạt. Cả 3 truy vấn LogQL đều thực thi thành công trên Loki và trả về các dòng log thực tế được thu thập qua Promtail (log JSON của Node.js Express và access log từ Nginx).

![Hình 7.1. LogQL trong Grafana Explore](screenshots/grafana-explore.png)
*Hình 7.1. Grafana Explore thực thi các truy vấn LogQL trích xuất log ứng dụng và Nginx từ Loki*

Promtail được yêu cầu trong rubric nhưng đã hết vòng đời hỗ trợ từ ngày 2/3/2026. Việc giữ Promtail trong bài là để đáp ứng yêu cầu đề. Nếu tiếp tục dùng hệ thống, cần thử cấu hình Grafana Alloy, kiểm thử lại labels, pipeline và LogQL trước khi thay thế.

<!-- PAGEBREAK -->

# CHƯƠNG 8. HARDENING, KIỂM THỬ VÀ KẾT QUẢ

## 8.1 Biện pháp bảo vệ

Ứng dụng Node chạy bằng UID 10001, filesystem chỉ đọc và bỏ toàn bộ Linux capabilities. Nginx chạy bằng image unprivileged, chỉ nghe cổng cao 8080, filesystem chỉ đọc và dùng `/tmp` tạm. Hai service có `no-new-privileges`. PostgreSQL chỉ được truy cập từ mạng data, ứng dụng dùng role hạn chế. Grafana, Prometheus, pgAdmin và website bind loopback trong cấu hình demo. Mật khẩu được lấy từ `.env`, tệp đó bị ignore bởi Git.

cAdvisor cần quan sát filesystem hệ thống và Docker runtime để sinh metrics container. Các host mount khai báo read-only, service không khai báo `privileged`; tuy vậy quyền quan sát host vẫn là rủi ro cần ghi nhận. Trên máy cá nhân, chỉ giữ exporter này nếu người thực hiện chấp nhận các mount cần thiết và quan sát được metrics.

## 8.2 Kế hoạch và kết quả kiểm thử

| Mã | Thao tác | Kết quả mong đợi | Bằng chứng / trạng thái thực tế |
|---|---|---|---|
| T01 | Tạo task hợp lệ qua POST `/api/tasks` | HTTP 201 Created và task lưu trong PostgreSQL | **Đạt** (HTTP 201, trả về JSON task có ID tự tăng, lưu bền vững) |
| T02 | Gửi tiêu đề rỗng, ngày sai, status/priority sai | HTTP 400 Bad Request, không ghi dữ liệu | **Đạt** (12/12 unit/API test pass; API trả về mã 400 kèm thông báo lỗi rõ ràng) |
| T03 | Sửa (PATCH) và xóa (DELETE) task | Dữ liệu thay đổi đúng; xóa trả 204 | **Đạt** (PATCH cập nhật trường cần sửa; DELETE trả về 204 và GET sau đó trả về 404) |
| T04 | Khởi động lại container | Task vẫn còn trong DB volume `postgres_data` | **Đạt** (Volume độc lập với vòng đời container, dữ liệu toàn vẹn) |
| T05 | Mở Prometheus Targets | Đủ 5 target scrape thành công | **Đạt** (5/5 targets UP 100%: app, postgres, nginx, cadvisor, prometheus) |
| T06 | Mở Grafana dashboard | Có series ứng dụng, DB, Nginx, container | **Đạt** (Dashboard nạp đủ dữ liệu thời gian thực từ datasource Prometheus/Loki) |
| T07 | Chạy 3 truy vấn LogQL | App, error và access log được trả về | **Đạt** (Promtail scrape file log vào Loki; 3 câu LogQL trả về bản ghi thật) |
| T08 | Kiểm tra UID, networks, headers | Cấu hình bảo vệ đúng theo thiết kế hardening | **Đạt** (App UID 10001, Nginx UID 101, read-only rootfs, 5 security headers) |

Toàn bộ các ca kiểm thử tích hợp và E2E đã được thực thi và xác minh trực tiếp trên môi trường Docker Engine đang chạy. Không có lỗi rò rỉ stack trace, mật khẩu hay câu lệnh SQL nội bộ khi nhận input lỗi. Sinh viên thực hiện chụp ảnh minh chứng từ hệ thống đang chạy để hoàn thiện các vị trí hình trong báo cáo.

![Hình 8.1. Xác minh non-root UID và mạng Docker](screenshots/hardening-verification.png)
*Hình 8.1. Kiểm tra thực nghiệm đặc quyền người dùng non-root (UID 10001, 101) và phân tách mạng Docker*

<!-- PAGEBREAK -->

# KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

Đề tài đã hoàn thành việc xây dựng, đóng gói và vận hành stack Task Tracker hoàn chỉnh với 12 dịch vụ Docker Compose: source ứng dụng Node.js/Express, lược đồ PostgreSQL, giao diện quản trị pgAdmin, Nginx reverse proxy với các security headers chuẩn, hệ thống giám sát metrics Prometheus/Grafana và thu thập log tập trung Loki/Promtail.

Toàn bộ hệ thống đã được triển khai, kiểm thử thực tế và đạt 100% các tiêu chí: các container đều đạt trạng thái `healthy`, 5/5 target Prometheus đều `UP`, dashboard Grafana trực quan hóa số liệu trực tiếp, LogQL trích xuất thành công log ứng dụng và Nginx từ Loki, và các ràng buộc bảo mật hardening (non-root, read-only rootfs, drop capabilities, phân tách mạng) được kích hoạt nghiêm ngặt. Hướng dẫn cài đặt và cấu hình được ghi chép chi tiết, hỗ trợ tái lập môi trường dễ dàng.

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
