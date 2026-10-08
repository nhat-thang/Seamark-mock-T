# Web thi thử TOEIC (Listening + Reading)

Website cho học viên của trung tâm tiếng Anh làm đề TOEIC thử và xem điểm ngay. Admin (giáo viên) tải đề lên, xem bài làm, thông tin học viên và điểm.

## Phạm vi bản 1

- **Có:** TOEIC Listening (Part 1–4) và Reading (Part 5–7), 200 câu trắc nghiệm, máy tự chấm.
- **Chưa có:** Speaking, Writing, IELTS, tài khoản học viên. Database được thiết kế để thêm sau mà không phải làm lại.
- **Không làm trong code:** chặn truy cập theo mạng trung tâm. Nếu cần sẽ cấu hình ở Cloudflare khi deploy.

## Tính năng

### Học viên
1. Trang chủ: nút **Bắt đầu làm bài** và **Đăng nhập admin**.
2. Nhập họ, tên, số điện thoại (kiểm tra số Việt Nam).
3. Danh sách đề đã xuất bản.
4. Làm bài:
   - Listening: phát audio, ảnh Part 1, mặc định không cho tua (admin bật được cho từng đề).
   - Reading: câu đơn, điền đoạn văn, đọc hiểu một, hai hoặc ba đoạn.
   - Đồng hồ đếm ngược, hết giờ tự nộp.
   - Bảng số câu: đã làm, chưa làm, **cần kiểm tra lại**.
   - Tự lưu bài làm, tải lại trang không mất bài.
5. Kết quả: số câu đúng từng phần, điểm quy đổi **ước tính**, đáp án chi tiết nếu admin cho phép.

### Admin
1. **Tài khoản:** một tài khoản **Admin chính** (owner, "Thom Tran") được tạo tài khoản admin khác, vô hiệu hóa tài khoản, đặt lại mật khẩu khi ai đó quên, xem lịch sử chỉnh sửa và lịch sử đăng nhập. Mọi admin có quyền như nhau với đề và kết quả, và tự đổi được mật khẩu của mình.
2. **Quản lý đề:**
   - Mỗi đề có mã đề, tên, thời gian, **ghi chú nội bộ** (chỉ admin thấy).
   - Trạng thái **Nháp / Đã xuất bản**. Sửa đề đã xuất bản không ảnh hưởng học viên cho tới khi bấm Xuất bản lại; ai đang làm dở vẫn làm trên bản cũ.
   - **Khóa chỉnh sửa:** một đề chỉ một người sửa tại một thời điểm, người khác thấy "Cô X đang chỉnh sửa" và ở chế độ xem.
   - **Tự động lưu** liên tục + nút Lưu, trạng thái "Đã lưu lúc …". Mất mạng thì lưu tạm trên trình duyệt.
3. **Upload đề nhanh:**
   - Import file Excel mẫu (`docs/mau-de-toeic.xlsx`), có màn hình xem trước và báo lỗi trước khi lưu.
   - Nhập nhanh 200 đáp án bằng bảng bấm A/B/C/D hoặc dán chuỗi `1A 2C 3B ...`.
   - Kéo thả nhiều file ảnh/audio cùng lúc, tự khớp theo tên file.
   - Đoạn văn Part 6, 7 có thể upload bằng ảnh thay vì gõ chữ.
4. **Kết quả:** danh sách lượt làm bài (lọc theo tên, SĐT, đề, ngày), chi tiết từng câu, xuất Excel.
5. Lịch sử ai sửa đề lúc nào.

## Công nghệ

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (một file trong `DATA_DIR`)
- Deploy: Windows Server VPS, chạy dưới tài khoản Windows riêng (`webapp`) bằng NSSM, ra Internet qua Cloudflare Tunnel.

## Cấu trúc thư mục

```
toeic-test/
├── frontend/          React (Vite)
├── backend/           Node.js / Express
├── data/              database + file upload khi chạy ở máy dev (không đẩy lên Git)
├── docs/
│   └── mau-de-toeic.xlsx   file Excel mẫu: khung 200 câu đúng cấu trúc TOEIC
├── .env.example       mẫu cấu hình
├── CLAUDE.md          hướng dẫn cho Claude Code
└── README.md
```

## Chạy ở máy dev

Chạy tất cả lệnh ở **thư mục gốc** `toeic-test/`:

```bash
copy .env.example .env   # Linux/macOS: cp .env.example .env
npm install              # cài thư viện cho cả backend và frontend
npm run seed             # tạo database + tài khoản owner + 2 đề mẫu
npm run dev              # chạy backend (cổng 3000) và frontend (http://localhost:5173) cùng lúc
```

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy chế độ phát triển, sửa code tự tải lại |
| `npm run stop-dev` | Tắt các bản `npm run dev` cũ còn chạy ngầm (khi bị báo cổng đang bị dùng) |
| `npm test` | Chạy test backend |
| `npm run build` | Build frontend vào `frontend/dist` |
| `npm start` | Chạy bản production (cần `NODE_ENV=production` trong `.env` và đã `npm run build`): một cổng phục vụ cả web và API |
| `npm run seed` | Tạo owner + đề mẫu (chạy lại nhiều lần không bị trùng) |
| `npm run backup` | Sao lưu database + ảnh/audio vào `BACKUP_DIR` (giữ 14 bản gần nhất) |
| `npm run reset-password -- <tên đăng nhập> <mật khẩu mới>` | Đặt lại mật khẩu trên máy chủ (khi admin chính quên mật khẩu) |

**Gặp "Máy chủ gặp lỗi" / "Không kết nối được máy chủ" khi chạy thử trên máy:**
- Cổng `PORT` trong `.env` có thể đang bị chương trình khác dùng (ví dụ Docker). Đổi sang số khác (3001, 3002…).
- Sửa `.env` xong phải tắt hẳn `npm run dev` (Ctrl + C, gõ Y) rồi chạy lại. Khi chạy, cửa sổ terminal phải có 2 dòng cùng một cổng: `Các yêu cầu /api sẽ được chuyển tới backend ở http://127.0.0.1:<PORT>` và `Backend đang chạy tại http://127.0.0.1:<PORT>`.
- Nếu báo cổng 5173 hoặc cổng backend đang bị dùng: còn một bản `npm run dev` cũ chạy ngầm (cửa sổ terminal khác, terminal trong VS Code…). Chạy `npm run stop-dev` để tắt hết các bản dev của dự án (không đụng chương trình khác), rồi `npm run dev` lại.

Database được tạo tại `DATA_DIR/toeic.sqlite`. Muốn làm lại từ đầu: tắt server, xóa file đó, chạy lại `npm run seed`.

Ảnh giao diện nằm trong `frontend/public/images/` (`logo-seamark.png`, `decor-1.png`, `decor-2.png`): thay file cùng tên là xong. Màu sắc chỉnh trong `frontend/src/styles/theme.css`.

## Tài liệu

- **Đưa lên máy chủ Windows** (NSSM + Cloudflare Tunnel, sao lưu, cập nhật, xử lý sự cố): [docs/deploy-windows.md](docs/deploy-windows.md)
- **Hướng dẫn sử dụng cho giáo viên**: ngay trong trang admin, menu **Hướng dẫn** (`/admin/huong-dan`).

## Cấu trúc đề TOEIC trong file mẫu

| Part | Câu | Cấu trúc | Cần nhập |
|---|---|---|---|
| 1 | 1–6 | 6 câu, mỗi câu 1 ảnh | Ảnh + đáp án |
| 2 | 7–31 | 25 câu, 3 lựa chọn | Đáp án |
| 3 | 32–70 | 13 hội thoại × 3 câu | Câu hỏi, A–D, đáp án |
| 4 | 71–100 | 10 bài nói × 3 câu | Câu hỏi, A–D, đáp án |
| 5 | 101–130 | 30 câu | Câu hỏi, A–D, đáp án |
| 6 | 131–146 | 4 đoạn × 4 câu | Đoạn văn, A–D, đáp án |
| 7 | 147–200 | 10 đoạn đơn (29 câu), 2 cụm đoạn đôi, 3 cụm đoạn ba (25 câu) | Đoạn văn, câu hỏi, A–D, đáp án |

Phần Listening trong file mẫu hiện để trống nội dung, chỉ có số câu và Part. Phần Reading sẽ được điền đề thật.

## Lưu ý

- Chỉ dùng đề và audio trung tâm có quyền sử dụng (tự soạn, hoặc tài liệu có giấy phép).
- Điểm quy đổi là **ước tính**, không phải điểm TOEIC chính thức.
- Không đẩy `.env` và thư mục `data/` lên Git.
