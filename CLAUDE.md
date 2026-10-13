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
- Không phụ thuộc dịch vụ cloud bên ngoài (không Supabase, Firebase, S3...). Ngoại lệ đã chốt với người dùng: AI kiểm tra đề dán vào (Gemini) — là tính năng phụ, không có key / mất mạng thì web vẫn chạy đủ.
- Bật `trust proxy` khi `NODE_ENV=production` (đứng sau Cloudflare).

## Mô hình dữ liệu (gợi ý, có thể tinh chỉnh nhưng giữ ý tưởng)

- `admins`: id, username, password_hash, display_name, role (`owner` | `admin`), is_active, created_at.
- `exams`: id, code (unique), title, exam_type (`TOEIC_LR`; để sẵn cho `IELTS` sau), duration_minutes, internal_note, allow_seek_audio, show_answers_after, status (`draft` | `published`), draft_json, published_version_id, lock_admin_id, lock_expires_at, version (số nguyên tăng mỗi lần lưu), updated_by, updated_at.
- `exam_versions`: id, exam_id, version_no, content_json, published_at, published_by. **Một bản xuất bản là bất biến.** Lượt làm bài trỏ tới version cụ thể.
- `media`: id, exam_id, original_name, stored_name (ngẫu nhiên), mime, size, created_at.
- `students`: id, last_name, first_name, phone, created_at, class_student_id. Người làm bài: SĐT có ghi thì mỗi SĐT là một người (index UNIQUE chỉ với SĐT khác rỗng); Training Test không SĐT thì gộp theo đúng họ tên; Class Assignment gắn với học sinh lớp (`class_student_id`, đổi tên học sinh lớp thì tên ở đây đổi theo).
- `attempts`: id, student_id, exam_version_id, started_at, submitted_at, deadline_at, answers_json, flagged_json, listening_correct, reading_correct, listening_score, reading_score, total_score, status (`in_progress` | `submitted`).
- `audit_log`: id, admin_id, action, exam_id, class_id, detail, created_at.
- Lớp học / thời khóa biểu / điểm danh: xem mục "Lớp học, thời khóa biểu, điểm danh, học phí" bên dưới.

Cấu trúc nội dung đề (`content_json` / `draft_json`) gồm: thông tin audio (một file cho cả Listening hoặc mỗi Part một file), danh sách nhóm câu (mã nhóm, part, loại, từ câu, đến câu, đoạn văn chữ, danh sách ảnh đoạn văn, ảnh kèm), danh sách 200 câu (số câu, part, mã nhóm, câu hỏi, lựa chọn A–D, đáp án, ảnh, giải thích). Lưu JSON trong SQLite là đủ cho quy mô này và giúp việc nháp/xuất bản đơn giản.

Quy ước trong đoạn văn (`passage`), hiển thị bởi `frontend/src/components/PassageText.jsx` (không dùng HTML): dòng `---` ngăn các văn bản của đoạn đôi/đoạn ba; dòng bắt đầu bằng `|` là một hàng bảng (hàng đầu là tiêu đề); `__(131)__` là chỗ trống câu 131 (Part 6); `[1]`…`[4]` là vị trí chèn câu (Part 7). Nhóm câu có `kind`: `text` (Part 6), `single`, `double`, `triple`. Đề mẫu thật đầu tiên: `backend/src/seed-data/reading-01.js` (Reading 101–200, 180 phút, có giải thích tiếng Việt), test đối chiếu đáp án ở `backend/tests/reading-01.test.js`.

**Hai loại đề (`exams.exam_type`, cũng ghi trong `content.examType`):**
- `TOEIC_LR`: 200 câu, 7 Part cố định. `content.parts` = tên + lời dặn 7 Part (mặc định trong `backend/src/exam/parts.js` và `frontend/src/utils/parts.js` — sửa thì sửa cả hai), hiện trước câu đầu mỗi Part.
- `CUSTOM` (đề tự thiết kế, đã chốt với người dùng): `content.parts` do admin tạo (tên, lời dặn, audio); câu có `id` cố định, `part` = số thứ tự phần, 2–6 lựa chọn A–F, có `image`, `audio`; nhóm đọc hiểu (`kind: 'reading'`, có `audio`); số câu luôn đánh lại 1..N theo thứ tự mảng. `shuffleQuestions`: **xáo cho từng học viên** (trong từng phần, nhóm giữ liền nhau) — thứ tự lưu ở `attempts.question_order`, học viên thấy `displayNo`, đáp án vẫn ghi theo `no` gốc. Chấm: **số câu đúng + thang 10** (`attempts.correct_count/question_total/score10`, có cho cả đề TOEIC), không quy đổi điểm TOEIC. Không dùng Excel mẫu. Soạn đề ở `frontend/src/admin/exam/CustomBuilderTab.jsx` + thư mục `admin/exam/builder/` — **giao diện dạng thẻ kiểu biểu mẫu** (đã chốt): thẻ tiêu đề đề (`content.description` = mô tả đề cho học viên), thẻ Part, thẻ khối, thẻ question; thanh công cụ nổi đi theo thẻ đang chọn (thêm question / dán đề / khối chữ / khối ảnh / khối audio / part, chèn ngay sau thẻ đang chọn); kéo thả bằng tay cầm 6 chấm (HTML5, không thư viện; bàn phím ↑ ↓); xóa có "Hoàn tác" (snackbar) thay hộp xác nhận; chế độ "Đáp án" chọn đáp án + điểm; icon là SVG viết sẵn (`builder/icons.jsx`, không tải font icon ngoài). Vẫn giữ thêm nhiều question một lúc (tối đa 50) và "Chọn nhiều để xóa". Thao tác dữ liệu trong `utils/customExam.js`: `toItems` / `fromItems` (danh sách thẻ phẳng ↔ nội dung), `insertQuestions`, `insertBlock`, `insertPart`, `moveItem`, `nudgeItem`, `deleteItem`, `duplicateItem`, `upgradeContent` (đề cũ → dạng mới). Test: `backend/tests/custom-upgrade.test.js`.
- **Trường của question CUSTOM:** `type` (`multiple_choice` | `short_answer` | `paragraph`; đề cũ `mcq` = trắc nghiệm), `points` (0–100, mặc định 1), `required`, `description`, `optionImages {A: tên file}`, `acceptedAnswers` + `othersWrong` (trả lời ngắn), `shuffleOptions`, `imageAlign`; `explanation` = "phản hồi câu trả lời". Thêm / xóa lựa chọn ở giữa thì đánh lại chữ A, B, C… (đáp án, ảnh đi theo). **Khối** = `groups` cũ ("nhóm đọc hiểu") thêm `title`, `blockType` (`text` | `image` | `audio`), `afterId` (vị trí khối chưa có câu: id câu đứng trước; `'_start'` = đầu part; không có = cuối part). Câu thuộc khối (`groupCode`) luôn liền nhau ngay sau khối. **Mốc A đã làm** (soạn đề); **mốc B chưa làm:** học viên làm + chấm câu trả lời ngắn / dài, điểm theo `points` (thang 10 = điểm đạt / tổng điểm), màn hình chấm tay câu trả lời dài cho giáo viên, xáo trộn lựa chọn — tới lúc đó `validate.js` chặn xuất bản đề có câu trả lời ngắn / dài hoặc bật xáo lựa chọn. Câu bắt buộc: chỉ nhắc khi học viên bấm Nộp bài (đã chốt). **Thuật ngữ đã chốt:** đề tự thiết kế dùng chữ "Part" và "Question" (cả admin lẫn học viên); nhãn số câu khi làm bài của mọi loại đề là "Question N"; nút / hướng dẫn vẫn tiếng Việt.
- **Training Test / Class Assignment (đã chốt, thay cho "Homework"):** `exams.category` = `exam` (Training Test) | `homework` (**Class Assignment** — giá trị cũ giữ nguyên trong database vì SQLite không sửa được CHECK), độc lập với `exam_type`: bên trong soạn / thời gian / cách làm / xuất bản / AI kiểm tra giống hệt. Migration `011_class_assignment.sql` chuyển các đề homework cũ thành Training Test. Class Assignment: tên luôn bắt đầu bằng "Class Assignment - " (`assignmentTitle()` trong `routes/adminExams.js`, giao diện `frontend/src/utils/assignment.js`), mã tự đặt CA-001…, giao cho **nhiều lớp** (bảng `exam_classes`), **mật khẩu đề không bắt buộc** (`exams.access_code`, lưu dạng chữ để giáo viên xem lại, so sánh không phân biệt hoa thường, không bao giờ gửi cho học sinh). Lớp + mật khẩu lưu bằng `POST /api/admin/exams/:id/assignment`, có hiệu lực ngay (không cần xuất bản lại). `exams.created_by` = giáo viên ra đề. **Hoạt động:** tab "Hoạt động" của đề (`GET /api/admin/exams/:id/activity`, `admin/exam/ActivityTab.jsx`): theo từng lớp được giao, đủ học sinh (đã làm / chưa làm, số lần, lúc nào, điểm); lịch sử bài làm của một học sinh ở trang lớp (bấm tên học sinh). Kết quả lọc theo `category`, `authorId`; mỗi lượt làm có `wrong` / `blank`; học sinh của lớp hiện tên lớp thay SĐT. Test: `backend/tests/class-assignment.test.js`.
- **Khung mẫu** (bảng `exam_templates`, `backend/src/exam/templates.js`): lưu CẤU TRÚC đề tự thiết kế (part, số question, số lựa chọn, nhóm, thời gian, xáo trộn) — không lưu nội dung / đáp án / file. Lưu / cập nhật / bỏ ở tab "Kiểm tra & xuất bản"; hiện trong "Tạo đề mới"; `POST /api/admin/exams` nhận `templateId`. Mọi admin dùng được, có ghi `audit_log`.
- **Dán đề + AI kiểm tra** (đã chốt: Gemini, AI gợi ý đáp án nhưng giáo viên duyệt, không có key vẫn dùng được): nút ⇥ "Nhập câu hỏi" trên thanh công cụ của trang soạn đề tự thiết kế (`frontend/src/admin/exam/PasteImport.jsx`, giữ nguyên tính năng). Tách đề **không dùng AI** ở `frontend/src/utils/pasteParser.js` (test: `backend/tests/paste-parser.test.js`); khi dán, HTML trong bộ nhớ tạm được đổi thành chữ, chỗ có ảnh ghi `[[ẢNH]]`. AI chỉ kiểm tra: `POST /api/admin/ai/check` (tối đa 30 question/lần, trình duyệt tự chia đợt vì Cloudflare cắt request > 100 giây), `backend/src/ai/` (gọi REST bằng `fetch`, key trong header; đổi dịch vụ AI = viết module cùng giao diện). `.env`: `AI_API_KEY`, `AI_MODEL` (mặc định `gemini-flash-latest`), `AI_DAILY_LIMIT`; đếm lượt ở bảng `ai_usage`. Question CUSTOM có thể có `review: { aiAnswer?, needsImage? }` — chặn xuất bản tới khi giáo viên xác nhận / thêm ảnh / bấm "Không cần ảnh"; **không gửi cho học viên** (bỏ ở `toStudentContent`, `buildResult`).
- Hướng dẫn từng bước (`frontend/src/admin/Tour.jsx`, chỉ cho trang soạn đề tự thiết kế): ghi nhớ đã xem theo từng admin ở `admins.tours_done` (`POST /api/auth/tours/:name`). Tên hiện tại `custom-builder-v2` (đổi tên khi hướng dẫn đổi nhiều để admin xem lại một lần).

Thiết kế sao cho sau này thêm được câu hỏi tự luận và ghi âm (Speaking, Writing, IELTS) mà không phải đập bỏ: ví dụ mỗi câu có trường `type` (`mcq` hiện tại).

## Tính năng và quy tắc nghiệp vụ

### Học viên
- Trang chủ: hai cách làm bài **Training Test** (`/bat-dau`) và **Class Assignment** (`/lop`), cùng nút "Đăng nhập admin".
- **Training Test (đã chốt):** chỉ nhập họ và tên, KHÔNG cần SĐT; chỉ thấy đề `category = 'exam'`. Không có SĐT nên server không tự mở lại bài dở theo tên (tránh người trùng tên vào nhầm bài) — trình duyệt nhớ bài đang làm theo từng đề (`saveOngoing` trong `utils/attemptStorage.js`). API vẫn nhận SĐT (nếu gửi) để tương thích bản cũ.
- **Class Assignment (đã chốt):** chọn lớp → bấm tên mình → chọn bài của lớp (`pages/ClassAssignmentPage.jsx`, API công khai `routes/publicClasses.js`). Danh sách lớp và họ tên học sinh hiện **công khai** theo yêu cầu, nhưng API chỉ trả họ tên (không SĐT / ghi chú / mật khẩu đề). Người làm bài gắn với học sinh lớp qua `students.class_student_id`. **Không nhớ tên đã chọn** (đã chốt): mỗi lần vào lớp đều phải bấm tên, tránh học sinh sau dùng chung máy làm nhầm dưới tên người trước.
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
5. Dán chữ của đề (copy từ web / Word / PDF) để tự tách — đã làm cho đề tự thiết kế (xem "Dán đề + AI kiểm tra"). Tách đề từ ảnh chụp / PDF scan bằng AI: chưa làm.

**Đã làm (mốc 4):** parser ở `backend/src/exam/excelImport.js` (bỏ phần ghi chú/comment trong file trước khi đọc vì exceljs lỗi với file do openpyxl tạo). Lỗi *chặn áp dụng* (đáp án sai chữ, trùng câu, sai Part, mã nhóm không tồn tại, mã đề trùng) khác với thiếu sót *chỉ chặn xuất bản* (thiếu đáp án, đoạn văn, file — do `validate.js`). Mọi nội dung ghi vào nháp đi qua `normalizeContent()` (`contentSchema.js`). Nội dung đề tham chiếu file bằng **tên gốc** (không phân biệt hoa thường); lúc xuất bản ghi bảng `files` (tên → `stored_name`) vào `content_json` của version; học viên nhận đường dẫn `/api/files/<stored_name>`. Xóa/thay file chỉ đặt `media.deleted_at`, không xóa trên đĩa (version cũ còn dùng). Upload kiểm tra đuôi + MIME + chữ ký file; request multipart kiểm tra `Origin`. Bộ đọc chuỗi đáp án ở `frontend/src/utils/answerParser.js` (test trong `backend/tests/answer-parser.test.js`). Đã thêm trình phát audio (không cho tua khi `allow_seek_audio = 0`) và hiển thị ảnh Part 1 / ảnh đoạn văn.

### Admin — kết quả
- Danh sách lượt làm bài, lọc theo tên, SĐT, đề, khoảng ngày; phân trang.
- Chi tiết lượt làm: thông tin học viên, điểm, từng câu (chọn gì, đúng/sai).
- Xuất Excel.
- **Đã làm (mốc 7):** `backend/src/routes/results.js`. Tìm tên không dấu nhờ hàm SQL `fold()` (đăng ký trong `db/index.js`). Danh sách/chi tiết/xuất Excel đều gọi `finalizeExpiredAttempts` trước để bài hết giờ được chấm. File Excel có 2 trang: «Kết quả» và «Đáp án từng câu» (tô xanh/đỏ), tối đa 5000 dòng; mỗi lần xuất ghi `audit_log` (`export_results`). Hàm lọc ngày + phân trang dùng chung ở `backend/src/listUtils.js`.

### Lớp học, thời khóa biểu, điểm danh, học phí (đã làm)
- **Bảng** (migration `009_classes.sql`, `012_tuition.sql`): `classes` (xóa mềm `deleted_at`, `color`; học phí: `cycle_sessions` = X buổi mỗi kì, `price_per_session` — NULL = chưa cài; `fee_every` cũ không dùng nữa), `class_students` (học sinh của lớp, KHÔNG dùng chung bảng `students` của học viên thi; `parent_name`, `phone` = SĐT phụ huynh, `parent_id_number` = CCCD phụ huynh, `start_at` = thời điểm buổi bắt đầu học, `discount_percent` + `discount_note`, nghỉ học = `removed_at`; `joined_on` giữ theo `start_at`, `prior_sessions` cũ không dùng), `class_teachers` (giáo viên phụ trách lớp, nhiều người), `class_sessions` (mỗi buổi: `date` + `start_time`/`end_time` giờ VN và `starts_at`/`ends_at` UTC; `teacher_name` = giáo viên ngoài; `teacher_admin_id` = giáo viên đầu tiên (giữ cho dữ liệu cũ); `series_id` = các buổi tạo cùng lúc bằng "Lặp lại hằng tuần"; `attendance_at` có giá trị = buổi đã điểm danh), `session_teachers` (giáo viên dạy từng buổi, nhiều người), `attendance` (session × học sinh: `status` present|late|excused|absent, `bonus` 0–50), `tuition_payments` (mỗi kì ĐÃ THU: `due_amount` chốt lúc thu, `amount` thực thu, `session_ids` lúc thu, `paid_on`, `method` cash|transfer), `tuition_alert_snoozes` (owner tắt cảnh báo một kì), `tuition_events` (lịch sử thu / bỏ thu / tắt / bật cảnh báo), `fee_payments` (cách cũ — chỉ để xem lại), `notifications`. `audit_log.class_id` để lọc lịch sử theo lớp.
- **Code:** backend `backend/src/classes/` (`time.js` giờ VN, `rules.js` quyền + mốc thời gian, `access.js` lớp nào ai được xem, `students.js` đọc học sinh + **`studentView` lọc theo vai trò**, `tuitionData.js` đọc DB cho học phí, `alerts.js` cảnh báo trang chính, `sessions.js`), `utils/tuition.js` (**toàn bộ cách tính học phí, hàm thuần**), `utils/excel.js`, `routes/classes.js`, `routes/schedule.js`, `routes/tuition.js` (chỉ owner), `routes/notifications.js`; frontend `frontend/src/admin/classes/` (`TuitionBits.jsx` phần học phí dùng chung, `TuitionPage.jsx` trang Quản lý học phí `/admin/hoc-phi`) + `utils/schedule.js`. Test: `tests/tuition.test.js` (cách tính), `tests/classes.test.js` (API + phân quyền).
- **Quyền (đã chốt):** owner thấy / làm mọi thứ. **Chỉ owner** tạo / sửa / xóa lớp, cài học phí + giáo viên phụ trách, thêm / sửa / cho nghỉ học sinh, nhập Excel, xếp / sửa / xóa thời khóa biểu, thu học phí, tắt cảnh báo, vào trang Quản lý học phí. Giáo viên (admin) chỉ thấy **lớp mình phụ trách** (`class_teachers`); được xếp dạy một buổi thì tự thành giáo viên phụ trách lớp. Người điểm danh được: giáo viên của buổi + giáo viên phụ trách lớp + owner. **Lọc ở server** (`studentView`): giáo viên KHÔNG nhận tên phụ huynh, SĐT, CCCD, ghi chú, giảm giá, số tiền — chỉ họ tên, điểm danh, số buổi đã học, nhãn Đã thu / Chưa đóng, mức cảnh báo. Excel của giáo viên chỉ có tên + số buổi (+ trang điểm danh). Giao giáo viên đề Class Assignment: chỉ lớp mình phụ trách; tab Hoạt động chỉ hiện lớp mình phụ trách.
- **Mốc thời gian (đã chốt):** bấm "Bắt đầu" / điểm danh từ **30 phút trước giờ học** (áp dụng cả admin chính); giáo viên sửa điểm danh tới **hết ngày hôm sau** ngày học — buổi owner thêm vào sau khi đã qua thì tính từ ngày thêm buổi; admin chính sửa không giới hạn. Server kiểm tra (`sessionPermissions`), giao diện chỉ hiển thị.
- **Quy tắc thời khóa biểu (đã chốt, chặn ở server):** buổi ĐÃ điểm danh không xóa, không đổi ngày giờ (chỉ đổi giáo viên / phòng / ghi chú). Thêm buổi vào quá khứ, trùng giờ, hoặc thêm / xóa / dời buổi làm lệch kì đã thu → server trả 409 `reason: 'confirm'` (`conflicts`, `past`, `cycles`) để hộp xác nhận nêu rõ, gửi lại `force: true` mới lưu. Số tiền đã thu giữ nguyên; kì bị lệch hiện "lịch đã đổi sau khi thu".
- **Học phí theo buổi (đã chốt, `utils/tuition.js`):** buổi đếm theo **thời khóa biểu** (không theo điểm danh, vắng vẫn tính), đánh số 1, 2, 3… theo giờ học; "đã qua" = giờ kết thúc đã qua. Kì k = buổi (k−1)X+1…kX; chỉ thu được khi lớp đã xếp đủ X buổi của kì (thiếu thì nhắc owner "Lớp … mới xếp a/X buổi"; lớp đã hết lịch quá 30 ngày thì thôi nhắc). Học sinh bắt đầu từ buổi bắt đầu học (mặc định buổi sắp tới gần nhất); vào giữa kì thì kì đầu chỉ tính từ buổi đó. **Đóng trước:** hạn kì k = ngày buổi cuối kì k−1; kì đầu của học sinh = ngày buổi bắt đầu. Số tiền = số buổi × giá × (100 − giảm giá)/100, **chốt lúc thu**. Cảnh báo kì kế tiếp chưa đóng: lớp còn 4–2 buổi trong kì hiện tại = VÀNG, 1 = CAM, tới hạn = ĐỎ; kì hiện tại đã tới hạn mà chưa đóng = ĐỎ tới hết buổi thứ 3 của học sinh trong kì đó rồi thôi (vẫn "Chưa đóng" ở trang owner). Tắt cảnh báo theo (học sinh, kì), bật lại được. Bỏ "Đã thu" phải nhập lại mật khẩu (giới hạn 10 lần / 15 phút). "Cần thu trong tháng" = các kì có hạn đóng trong tháng.
- **Thêm học sinh:** thêm tay bắt buộc tên học sinh + tên / SĐT (10 số; máy bàn 11 số) / CCCD (12 số, nhận CMND 9 số) phụ huynh; nhập Excel (`fileName`) chỉ bắt buộc họ tên; sửa không bắt buộc — thiếu thì hiện nhãn "Thiếu thông tin".
- **Dữ liệu mẫu (chỉ máy dev):** `npm run demo:hoc-phi` (trong `backend`, thêm `-- --reset` để làm lại) ghi vào database riêng `data-demo/` (không đưa lên Git), từ chối chạy khi `NODE_ENV=production` hoặc database mẫu đã có lớp. Chạy web với dữ liệu mẫu: `DATA_DIR=./data-demo`.
- **Thông báo (đã chốt): chỉ trên web** — chuông ở thanh trên cùng (hỏi lại mỗi phút: buổi dạy 24 giờ tới, buổi chưa điểm danh, bảng `notifications` khi admin chính xếp / đổi / xóa lịch) + thông báo trình duyệt (Notification API) 60 phút trước và lúc bắt đầu được, chỉ khi trang đang mở. Không dùng dịch vụ ngoài.
- **Nhập danh sách lớp từ Excel** (file tự do, không bắt theo mẫu): `backend/src/classes/rosterExcel.js` tìm dòng tên cột (bỏ dòng tiêu đề, hiểu tên cột 2 tầng / ô "Họ và tên" gộp 2 cột) và đoán loại từng cột theo tên cột (nhiều cách gọi: "Họ tên", "Name", "Tên HS"...; "Tên phụ huynh" / "Họ tên mẹ" = tên phụ huynh, "CCCD" / "CMND" = CCCD phụ huynh, "Tên lớp" KHÔNG phải họ tên), không được thì theo nội dung. Trình duyệt ghép cột + kiểm tra từng dòng ở `frontend/src/utils/rosterImport.js` (sửa SĐT mất số 0 / +84, ngày dd/mm/yyyy, tên VIẾT HOA -> Viết Hoa Đầu Chữ, báo trùng), giáo viên đổi được từng cột. **Đã chốt:** cột họ tên bắt buộc; cột lạ gộp vào Ghi chú dạng "Tên cột: giá trị" (ghi chú tối đa 500 ký tự). Lưu qua `POST /classes/:id/students` (tối đa 300 / lần, có `fileName` -> `audit_log` "import_students"). Chỉ đọc .xlsx (.xls / .csv: báo cách lưu lại). Test: `backend/tests/class-import.test.js`.
- **Tải danh sách lớp** `GET /classes/:id/export`: trang «Danh sách lớp» (owner: đủ cột, tên cột trùng lúc nhập nên nhập lại được, các cột thống kê được bỏ qua khi nhập; giáo viên: chỉ tên + số buổi) + trang «Điểm danh» (C / M / P / V + điểm cộng từng buổi). File mẫu: `GET /classes/import-template` (owner).
- **Excel khắp nơi:** danh sách lớp, chi tiết một buổi (`GET /schedule/:id/export`), cảnh báo học phí (`GET /schedule/alerts/export`, owner có số tiền), học phí theo tháng (`GET /tuition/export?month=`), lịch sử thu của học sinh (`GET /tuition/students/:sid/export`), tab Hoạt động của đề (`GET /exams/:id/activity/export`). Hàm chung ở `utils/excel.js`.
- Danh sách học sinh xếp **theo tên** (chữ cuối họ tên, như sổ điểm danh). Điểm danh đang tích dở được giữ trong `localStorage` của máy đến khi bấm lưu. Mọi thao tác ghi `audit_log` kèm `class_id` (lần đầu điểm danh ghi tóm tắt, các lần sửa ghi đúng phần thay đổi).

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
   - **Đã deploy (VPS Windows, Node 24):** code lấy bằng `git clone` từ GitHub; cập nhật bằng `scripts/update.ps1` (sao lưu → pull → tắt dịch vụ → `npm ci` → build → bật). `postinstall` cài backend/frontend bằng `npm ci --ignore-scripts` (npm mới trên VPS cố biên dịch `better-sqlite3` và lỗi vì thiếu Python) → **chỉ thêm thư viện native nếu có sẵn bản dựng Windows x64**. `engines` = Node `>=24 <25`. `vite.config.js` chỉ đọc `HOST`/`PORT` từ `.env` (không dùng `loadEnv`, tránh `NODE_ENV=development` làm build ra bản dev). `/api/files` trả `Cache-Control: public, immutable` để Cloudflare lưu đệm (nội dung một `stored_name` không bao giờ đổi — đừng phá điều này). Upload chia đợt ≤ 90 MB / 10 file (`uploadMedia` trong `frontend/src/utils/api.js`) vì Cloudflare Free chặn request > 100 MB; `MAX_UPLOAD_MB` mặc định 95.
