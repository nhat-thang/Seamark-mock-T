# CLAUDE.md — Hướng dẫn cho Claude Code

Đọc file này và `README.md` trước mọi công việc trong dự án. Trả lời người dùng bằng **tiếng Việt**.

## Bối cảnh

Website thi thử TOEIC Listening + Reading cho một trung tâm tiếng Anh. Người dùng cuối:
- **Học viên:** không đăng nhập, chỉ nhập họ, tên, SĐT rồi làm bài.
- **Admin:** giáo viên, **không giỏi công nghệ**. Mọi màn hình admin phải đơn giản, chữ to, ít bước, có hướng dẫn ngay trên màn hình, thông báo lỗi bằng tiếng Việt dễ hiểu. Đây là yêu cầu quan trọng nhất của dự án.

Người phát triển là một lập trình viên đang học, nên: giải thích ngắn gọn những gì bạn làm, viết comment tiếng Việt ở các chỗ logic quan trọng, không dùng kỹ thuật phức tạp khi có cách đơn giản hơn.

## Công nghệ (đã chốt, không tự ý đổi)

- **Frontend:** React + Vite, JavaScript (không TypeScript trừ khi người dùng yêu cầu), React Router. CSS thuần hoặc một thư viện nhẹ; hỏi trước khi thêm UI framework lớn.
- **Backend:** Node.js (LTS) + Express.
- **Database:** SQLite qua `better-sqlite3`. Dùng file migration SQL đánh số (`001_init.sql`, ...), chạy tự động khi backend khởi động.
- **Upload:** `multer`. **Excel:** `exceljs` (đọc file mẫu và xuất kết quả).
- **Mật khẩu:** `bcrypt`. **Phiên đăng nhập:** cookie httpOnly (`express-session` lưu trong SQLite hoặc JWT trong cookie httpOnly), `SameSite=Lax`.

## Ràng buộc deploy (ảnh hưởng tới code)

Sẽ chạy trên **Windows Server**, dưới một tài khoản Windows không có quyền admin, bằng NSSM, ra Internet qua Cloudflare Tunnel. Vì vậy:
- Mọi cấu hình đọc từ `.env` (xem `.env.example`). **Không hard-code** `localhost`, cổng, đường dẫn.
- Toàn bộ dữ liệu (file `.sqlite`, audio, ảnh) nằm trong `DATA_DIR`. Code không ghi file ở chỗ khác.
- Dùng `path.join`, không nối đường dẫn bằng `/` hoặc `\`. Code phải chạy được trên cả Windows và Linux.
- Backend nghe ở `HOST` (mặc định `127.0.0.1`).
- Bản production: backend phục vụ luôn thư mục `frontend/dist` (một tiến trình, một cổng). API dưới tiền tố `/api`. File upload phục vụ qua `/api/files/...` có kiểm tra quyền khi cần.
- Không phụ thuộc dịch vụ cloud bên ngoài (không Supabase, Firebase, S3...).
- Bật `trust proxy` khi `NODE_ENV=production` (đứng sau Cloudflare).

## Mô hình dữ liệu (gợi ý, có thể tinh chỉnh nhưng giữ ý tưởng)

- `admins`: id, username, password_hash, display_name, role (`owner` | `admin`), is_active, created_at.
- `exams`: id, code (unique), title, exam_type (`TOEIC_LR`; để sẵn cho `IELTS` sau), duration_minutes, internal_note, allow_seek_audio, show_answers_after, status (`draft` | `published`), draft_json, published_version_id, lock_admin_id, lock_expires_at, version (số nguyên tăng mỗi lần lưu), updated_by, updated_at.
- `exam_versions`: id, exam_id, version_no, content_json, published_at, published_by. **Một bản xuất bản là bất biến.** Lượt làm bài trỏ tới version cụ thể.
- `media`: id, exam_id, original_name, stored_name (ngẫu nhiên), mime, size, created_at.
- `students`: id, last_name, first_name, phone, created_at. **Đã chốt: gộp theo SĐT** — mỗi SĐT là một học viên; nhập lại SĐT cũ thì dùng lại học viên đó và cập nhật họ tên mới nhất. (Mốc 5: thêm migration đặt `phone` UNIQUE.)
- `attempts`: id, student_id, exam_version_id, started_at, submitted_at, deadline_at, answers_json, flagged_json, listening_correct, reading_correct, listening_score, reading_score, total_score, status (`in_progress` | `submitted`).
- `audit_log`: id, admin_id, action, exam_id, detail, created_at.

Cấu trúc nội dung đề (`content_json` / `draft_json`) gồm: thông tin audio (một file cho cả Listening hoặc mỗi Part một file), danh sách nhóm câu (mã nhóm, part, loại, từ câu, đến câu, đoạn văn chữ, danh sách ảnh đoạn văn, ảnh kèm), danh sách 200 câu (số câu, part, mã nhóm, câu hỏi, lựa chọn A–D, đáp án, ảnh, giải thích). Lưu JSON trong SQLite là đủ cho quy mô này và giúp việc nháp/xuất bản đơn giản.

Quy ước trong đoạn văn (`passage`), hiển thị bởi `frontend/src/components/PassageText.jsx` (không dùng HTML): dòng `---` ngăn các văn bản của đoạn đôi/đoạn ba; dòng bắt đầu bằng `|` là một hàng bảng (hàng đầu là tiêu đề); `__(131)__` là chỗ trống câu 131 (Part 6); `[1]`…`[4]` là vị trí chèn câu (Part 7). Nhóm câu có `kind`: `text` (Part 6), `single`, `double`, `triple`. Đề mẫu thật đầu tiên: `backend/src/seed-data/reading-01.js` (Reading 101–200, 180 phút, có giải thích tiếng Việt), test đối chiếu đáp án ở `backend/tests/reading-01.test.js`.

**Hai loại đề (`exams.exam_type`, cũng ghi trong `content.examType`):**
- `TOEIC_LR`: 200 câu, 7 Part cố định. `content.parts` = tên + lời dặn 7 Part (mặc định trong `backend/src/exam/parts.js` và `frontend/src/utils/parts.js` — sửa thì sửa cả hai), hiện trước câu đầu mỗi Part.
- `CUSTOM` (đề tự thiết kế, đã chốt với người dùng): `content.parts` do admin tạo (tên, lời dặn, audio); câu có `id` cố định, `part` = số thứ tự phần, 2–6 lựa chọn A–F, có `image`, `audio`; nhóm đọc hiểu (`kind: 'reading'`, có `audio`); số câu luôn đánh lại 1..N theo thứ tự mảng. `shuffleQuestions`: **xáo cho từng học viên** (trong từng phần, nhóm giữ liền nhau) — thứ tự lưu ở `attempts.question_order`, học viên thấy `displayNo`, đáp án vẫn ghi theo `no` gốc. Chấm: **số câu đúng + thang 10** (`attempts.correct_count/question_total/score10`, có cho cả đề TOEIC), không quy đổi điểm TOEIC. Không dùng Excel mẫu. Soạn đề ở `frontend/src/admin/exam/CustomBuilderTab.jsx` (thao tác trong `utils/customExam.js`): thêm nhiều question một lúc (tối đa 50), tích chọn để xóa nhiều question. **Thuật ngữ đã chốt:** đề tự thiết kế dùng chữ "Part" và "Question" (cả admin lẫn học viên); nhãn số câu khi làm bài của mọi loại đề là "Question N"; nút / hướng dẫn vẫn tiếng Việt.
- **Khung mẫu** (bảng `exam_templates`, `backend/src/exam/templates.js`): lưu CẤU TRÚC đề tự thiết kế (part, số question, số lựa chọn, nhóm, thời gian, xáo trộn) — không lưu nội dung / đáp án / file. Lưu / cập nhật / bỏ ở tab "Kiểm tra & xuất bản"; hiện trong "Tạo đề mới"; `POST /api/admin/exams` nhận `templateId`. Mọi admin dùng được, có ghi `audit_log`.
- Hướng dẫn từng bước (`frontend/src/admin/Tour.jsx`, chỉ cho trang soạn đề tự thiết kế): ghi nhớ đã xem theo từng admin ở `admins.tours_done` (`POST /api/auth/tours/:name`).

Thiết kế sao cho sau này thêm được câu hỏi tự luận và ghi âm (Speaking, Writing, IELTS) mà không phải đập bỏ: ví dụ mỗi câu có trường `type` (`mcq` hiện tại).

## Tính năng và quy tắc nghiệp vụ

### Học viên
- Trang chủ: hai nút "Bắt đầu làm bài" và "Đăng nhập admin".
- Form họ, tên, SĐT (định dạng Việt Nam, 10 số, bắt đầu bằng 0).
- Danh sách đề `published`.
- Làm bài:
  - Thời gian tính **ở server** (`deadline_at`). Client chỉ hiển thị đếm ngược; hết giờ thì server không nhận thêm câu trả lời và tự chốt bài.
  - Tự lưu câu trả lời lên server (debounce vài giây) + dự phòng `localStorage`. Tải lại trang thì khôi phục đúng lượt đang làm.
  - Bảng số câu 1–200 với 3 trạng thái: đã làm, chưa làm, cần kiểm tra lại (học viên tự đánh dấu).
  - Audio: nếu `allow_seek_audio = false` thì ẩn thanh tua, chỉ cho phát/tạm dừng.
  - Part 1 hiện ảnh; Part 2 chỉ hiện số câu và lựa chọn A/B/C; Part 3–7 hiện câu hỏi theo nhóm, đoạn văn bên cạnh câu hỏi (trên điện thoại thì xếp dọc).
  - **Đáp án đúng không bao giờ được gửi xuống trình duyệt khi đang làm bài.**
- Kết quả: số câu đúng Listening, Reading; điểm quy đổi; nếu `show_answers_after` thì hiện đáp án từng câu.

### Chấm điểm
- Chỉ chấm ở server.
- Quy đổi số câu đúng sang thang 5–495 mỗi phần bằng **bảng quy đổi đặt trong file cấu hình** (`backend/src/config/toeic-score-table.json`). Không có bảng chính thức công khai, nên: tạo bảng ước tính tuyến tính đơn giản làm mặc định, ghi rõ trong code và trên giao diện là **"điểm ước tính"**, để người dùng thay bảng sau.
- Chỉ hiện điểm quy đổi khi đề đủ 100 câu mỗi phần; đề ngắn chỉ hiện số câu đúng.

### Admin — tài khoản
- Lần đầu chạy `npm run seed` tạo tài khoản `owner` từ `.env` (tên hiển thị `OWNER_DISPLAY_NAME`, hiện là "Thom Tran"). Trên giao diện gọi owner là **"Admin chính"**.
- **Chỉ `owner`** được: tạo admin (nhập tên đăng nhập, tên hiển thị, mật khẩu), vô hiệu hóa/mở lại, đặt lại mật khẩu khi admin khác quên, xem **Lịch sử chỉnh sửa** (`audit_log`) và **Lịch sử đăng nhập** (`login_history`). Ngoài ra mọi admin có quyền như nhau.
- Mọi admin đổi được mật khẩu của chính mình. Không có "quên mật khẩu" tự phục vụ.
- Mọi thao tác thay đổi dữ liệu của admin (đề, tài liệu, tài khoản) phải ghi `audit_log` bằng `logAudit()` với `detail` là câu tiếng Việt dễ đọc, và thêm nhãn vào `AUDIT_ACTION_LABELS` (`frontend/src/utils/format.js`).
- Giới hạn đăng nhập sai (ví dụ 5 lần / 15 phút theo IP + username).

### Admin — quản lý đề
- Danh sách đề: mã, tên, trạng thái, người sửa gần nhất, thời gian.
- Ghi chú nội bộ cho từng đề: **không bao giờ** trả về ở API phía học viên.
- **Nháp / Xuất bản:** mọi chỉnh sửa ghi vào `draft_json`. Nút "Xuất bản" kiểm tra đề hợp lệ (đủ đáp án, file được tham chiếu đã upload...), tạo một `exam_versions` mới. Học viên chỉ đọc version đã xuất bản.
- **Khóa chỉnh sửa:** mở trang sửa → xin khóa (`lock_admin_id`, `lock_expires_at` ~2 phút), client gửi heartbeat ~30 giây để gia hạn. Người khác mở cùng đề thấy "*Tên* đang chỉnh sửa từ *giờ*", ở chế độ chỉ xem, có nút "Giành quyền chỉnh sửa" (cảnh báo trước). Mọi request lưu phải kèm `version`; server từ chối (409) nếu version đã thay đổi hoặc không giữ khóa, client báo rõ ràng, không ghi đè âm thầm.
- **Tự động lưu:** debounce ~2 giây sau mỗi thay đổi, lưu khi rời tab (`visibilitychange`), trạng thái hiển thị "Đang lưu… / Đã lưu lúc HH:mm / Mất kết nối, đã lưu tạm trên máy". Dự phòng `localStorage`, có mạng lại thì đẩy lên. Cảnh báo `beforeunload` khi còn thay đổi chưa lên server. Vẫn có nút "Lưu".
- Xem trước đề như học viên.
- **Xóa đề (đã làm):** **mọi admin** (đổi theo yêu cầu người dùng; trước đó chỉ owner) — nút "Xóa" ở danh sách đề và cuối tab "Kiểm tra & xuất bản"; hỏi lại "Bạn có chắc chắn…" rồi gõ lại mã đề (`confirmCode`); không xóa khi người khác đang giữ khóa; ghi `audit_log` (`delete_exam`). Đã chốt: **được xóa đề đã có học viên làm, không giữ kết quả cũ** — xóa luôn version, lượt làm bài, file trên đĩa, học viên không còn bài nào khác; dòng `audit_log` cũ được giữ (bỏ `exam_id`, thêm "[đề MÃ]" vào detail).
- **Đã làm (mốc 3):** `allow_seek_audio`, `show_answers_after`, tên đề, thời gian được **chụp vào `exam_versions` lúc xuất bản** (sửa nháp không ảnh hưởng học viên tới khi xuất bản lại). Có "Ngừng mở đề" (`status` về `draft`, giữ lịch sử version; ai đang làm dở vẫn làm tiếp). Logic khóa ở `backend/src/exam/locks.js`, kiểm tra trước khi xuất bản ở `backend/src/exam/validate.js`. Các lần tự lưu liên tiếp của một người chỉ ghi 1 dòng `audit_log` mỗi 10 phút. Mốc 4 sẽ mở rộng `POST /api/admin/exams/:id/save` để nhận thêm `content` (draft_json).

### Admin — upload đề
1. **Import Excel** theo `docs/mau-de-toeic.xlsx` (xem mục bên dưới). Đọc file → hiển thị bảng xem trước + danh sách lỗi/cảnh báo theo số câu → admin bấm "Áp dụng" mới ghi vào bản nháp. Không ghi đè dữ liệu đang có nếu file lỗi.
2. **Nhập nhanh đáp án:** lưới 200 câu bấm A/B/C/D (Part 2 chỉ A/B/C), và ô dán chuỗi dạng `1A 2C 3B` hoặc `ACBD...`.
3. **Kéo thả nhiều file** ảnh/audio. Tự khớp theo tên file đã ghi trong Excel; file không khớp thì liệt kê để admin gán bằng tay.
4. Form sửa từng câu/nhóm cho các chỉnh sửa nhỏ.
5. (Giai đoạn sau, chưa làm) Tách đề tự động từ PDF/ảnh bằng AI.

**Đã làm (mốc 4):** parser ở `backend/src/exam/excelImport.js` (bỏ phần ghi chú/comment trong file trước khi đọc vì exceljs lỗi với file do openpyxl tạo). Lỗi *chặn áp dụng* (đáp án sai chữ, trùng câu, sai Part, mã nhóm không tồn tại, mã đề trùng) khác với thiếu sót *chỉ chặn xuất bản* (thiếu đáp án, đoạn văn, file — do `validate.js`). Mọi nội dung ghi vào nháp đi qua `normalizeContent()` (`contentSchema.js`). Nội dung đề tham chiếu file bằng **tên gốc** (không phân biệt hoa thường); lúc xuất bản ghi bảng `files` (tên → `stored_name`) vào `content_json` của version; học viên nhận đường dẫn `/api/files/<stored_name>`. Xóa/thay file chỉ đặt `media.deleted_at`, không xóa trên đĩa (version cũ còn dùng). Upload kiểm tra đuôi + MIME + chữ ký file; request multipart kiểm tra `Origin`. Bộ đọc chuỗi đáp án ở `frontend/src/utils/answerParser.js` (test trong `backend/tests/answer-parser.test.js`). Đã thêm trình phát audio (không cho tua khi `allow_seek_audio = 0`) và hiển thị ảnh Part 1 / ảnh đoạn văn.

### Admin — kết quả
- Danh sách lượt làm bài, lọc theo tên, SĐT, đề, khoảng ngày; phân trang.
- Chi tiết lượt làm: thông tin học viên, điểm, từng câu (chọn gì, đúng/sai).
- Xuất Excel.
- **Đã làm (mốc 7):** `backend/src/routes/results.js`. Tìm tên không dấu nhờ hàm SQL `fold()` (đăng ký trong `db/index.js`). Danh sách/chi tiết/xuất Excel đều gọi `finalizeExpiredAttempts` trước để bài hết giờ được chấm. File Excel có 2 trang: «Kết quả» và «Đáp án từng câu» (tô xanh/đỏ), tối đa 5000 dòng; mỗi lần xuất ghi `audit_log` (`export_results`). Hàm lọc ngày + phân trang dùng chung ở `backend/src/listUtils.js`.

## Định dạng file Excel mẫu (`docs/mau-de-toeic.xlsx`)

Parser đọc theo **tên trang và tên cột** (không theo vị trí), bỏ khoảng trắng thừa:
- Trang **"Thông tin đề"**: cột "Mục" / "Giá trị". Mục: `Mã đề`, `Tên đề`, `Thời gian (phút)`, `Ghi chú nội bộ`, `Audio cả bài Listening`, `Audio Part 1`…`Audio Part 4`.
- Trang **"Nhóm câu"**: `Mã nhóm`, `Part`, `Loại`, `Từ câu`, `Đến câu`, `Đoạn văn (chữ)`, `Ảnh đoạn văn` (nhiều tên cách nhau bằng `;`), `Ảnh kèm`. Mã nhóm: `P3-01`…`P3-13`, `P4-01`…`P4-10`, `P6-01`…`P6-04`, `P7-D01`…`P7-D10` (đoạn đơn), `P7-DD01`…`P7-DD02` (đoạn đôi), `P7-DB01`…`P7-DB03` (đoạn ba).
- Trang **"Câu hỏi"**: `Số câu`, `Part`, `Mã nhóm`, `Câu hỏi`, `A`, `B`, `C`, `D`, `Đáp án`, `Ảnh`, `Giải thích`.

Kiểm tra khi import: đủ 200 câu và đúng Part theo cấu trúc chuẩn (cho phép đề thiếu nhưng cảnh báo); Đáp án thuộc A–D (Part 2: A–C); Part 3–7 có đủ lựa chọn; Part 6–7 nhóm có đoạn văn chữ hoặc ảnh; mã nhóm tồn tại. Thiếu nội dung Listening chỉ là **cảnh báo**, không chặn lưu nháp (đề mẫu hiện để trống Listening).

## Bảo mật (bắt buộc)

- Kiểm tra quyền ở **mọi** API admin (middleware), không chỉ ẩn nút trên giao diện.
- Truy vấn SQL dùng tham số (`?`), không ghép chuỗi.
- Upload: chỉ nhận `mp3`, `m4a`, `wav`, `jpg`, `jpeg`, `png`, `webp`, `xlsx`; kiểm tra cả đuôi và MIME; giới hạn `MAX_UPLOAD_MB`; lưu bằng tên ngẫu nhiên trong `DATA_DIR`; không bao giờ dùng tên file người dùng gửi để tạo đường dẫn.
- Escape mọi nội dung hiển thị (React mặc định đã làm; **không** dùng `dangerouslySetInnerHTML` cho nội dung đề).
- Thêm `helmet`, giới hạn kích thước body JSON.
- Không log mật khẩu, không trả `password_hash` ra API.
- SĐT học viên chỉ admin xem được.

## Cách làm việc

- Làm theo các mốc dưới đây, **mỗi mốc chạy được và kiểm tra được** rồi mới sang mốc tiếp. Cuối mỗi mốc: tóm tắt đã làm gì, cách chạy thử, và việc tiếp theo.
- Hỏi người dùng trước khi: thêm thư viện lớn, đổi công nghệ đã chốt, đổi cấu trúc database đã có dữ liệu, hoặc khi yêu cầu chưa rõ.
- Không xóa file của người dùng. Không đưa `.env`, `data/` lên Git.
- Viết test cho phần chấm điểm, parser Excel, logic khóa/version.
- Giao diện tiếng Việt, responsive (dùng được trên điện thoại cho học viên; admin ưu tiên máy tính).

## Các mốc

1. **Khung dự án:** Vite + Express, kết nối SQLite, migration, đọc `.env`, script `dev`/`build`/`start`/`seed`, backend phục vụ `frontend/dist` ở production.
2. **Đăng nhập admin + quản lý tài khoản** (owner / admin).
3. **Quản lý đề:** danh sách, tạo đề, ghi chú nội bộ, nháp/xuất bản, khóa chỉnh sửa, tự động lưu.
4. **Upload:** import Excel + xem trước + kiểm tra lỗi, nhập nhanh đáp án, kéo thả file và tự khớp tên.
5. **Học viên làm bài:** form thông tin, danh sách đề, giao diện làm bài, audio, đếm ngược ở server, tự lưu, đánh dấu câu.
6. **Chấm điểm + trang kết quả.**
7. **Admin xem kết quả + xuất Excel.**
8. **Hoàn thiện:** kiểm tra bảo mật, tài liệu deploy Windows (NSSM + Cloudflare Tunnel), hướng dẫn sử dụng cho admin.
   - **Đã làm:** test bảo mật tổng hợp `backend/tests/security.test.js` (thêm API admin mới thì thêm vào danh sách `ADMIN_ROUTES`); giới hạn tạo lượt làm bài theo IP (`rateLimit.js`); `uuid` được ép lên bản đã vá qua `overrides` trong `backend/package.json`; lệnh `npm run backup`, `npm run reset-password`; tài liệu `docs/deploy-windows.md`; hướng dẫn cho giáo viên là trang `/admin/huong-dan` (`frontend/src/admin/GuidePage.jsx`) — đổi tên nút trên giao diện thì sửa cả trang này.
