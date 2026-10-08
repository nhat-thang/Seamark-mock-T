# Đưa web thi thử TOEIC lên Windows Server

Tài liệu cho người cài đặt máy chủ. Làm lần lượt từ trên xuống. Các lệnh chạy trong **PowerShell mở bằng quyền Administrator** (trừ khi ghi khác).

## Sơ đồ

```
Học viên / giáo viên ──HTTPS──> Cloudflare ──Tunnel──> cloudflared (dịch vụ Windows)
                                                          │
                                                          ▼  http://127.0.0.1:3000
                                           node backend\src\server.js  (dịch vụ "toeic-web" chạy bằng NSSM,
                                                          │              dưới tài khoản Windows "webapp", KHÔNG có quyền admin)
                                                          ▼
                                           C:\toeic\data  (database SQLite + file ảnh/audio)
```

- Web chỉ nghe ở `127.0.0.1`, **không mở cổng nào trên tường lửa**. Mọi truy cập từ Internet đi qua Cloudflare Tunnel.
- Một tiến trình Node phục vụ cả giao diện (`frontend/dist`) và API (`/api`).

Thư mục dùng trong tài liệu (đổi được, nhớ sửa tương ứng trong `.env`):

| Thư mục | Chứa gì | Quyền của tài khoản `webapp` |
|---|---|---|
| `C:\toeic\app` | Mã nguồn web | Chỉ đọc + chạy |
| `C:\toeic\data` | Database + ảnh/audio (`DATA_DIR`) | Đọc + ghi |
| `C:\toeic\logs` | Nhật ký của dịch vụ | Đọc + ghi |
| `D:\toeic-backup` | Bản sao lưu (`BACKUP_DIR`), nên ở ổ khác | Đọc + ghi |

---

## 1. Chuẩn bị máy chủ (làm 1 lần)

### 1.1. Cài Node.js

Tải bản **LTS** (Windows Installer `.msi`, 64-bit) tại https://nodejs.org và cài với tùy chọn mặc định (cho mọi người dùng, vào `C:\Program Files\nodejs`). Kiểm tra:

```powershell
node -v
npm -v
```

> Thư viện `better-sqlite3` và `bcrypt` có sẵn bản dựng cho Windows 64-bit + Node LTS, thường **không** cần cài Visual Studio. Nếu bước `npm ci` ở mục 2 báo lỗi biên dịch (`gyp ERR!`), cài thêm "Build Tools for Visual Studio" (chọn "Desktop development with C++") rồi chạy lại.

### 1.2. Tạo tài khoản Windows `webapp` (không có quyền admin)

```powershell
# Đặt một mật khẩu mạnh, ghi lại (cần ở bước NSSM và sao lưu)
$pw = Read-Host -AsSecureString "Mật khẩu cho tài khoản webapp"
New-LocalUser -Name "webapp" -Password $pw -PasswordNeverExpires -UserMayNotChangePassword -Description "Chạy web thi thử TOEIC"
```

Không thêm `webapp` vào nhóm Administrators.

### 1.3. Tạo thư mục và phân quyền

```powershell
New-Item -ItemType Directory -Force C:\toeic\app, C:\toeic\data, C:\toeic\logs, D:\toeic-backup | Out-Null

# Mã nguồn: webapp chỉ được đọc + chạy
icacls C:\toeic\app /grant "webapp:(OI)(CI)RX"
# Dữ liệu, nhật ký, sao lưu: webapp được đọc + ghi
icacls C:\toeic\data /grant "webapp:(OI)(CI)M"
icacls C:\toeic\logs /grant "webapp:(OI)(CI)M"
icacls D:\toeic-backup /grant "webapp:(OI)(CI)M"
```

### 1.4. Cài NSSM

Tải NSSM tại https://nssm.cc/download, giải nén, chép `win64\nssm.exe` vào `C:\tools\nssm\nssm.exe`. Kiểm tra: `C:\tools\nssm\nssm.exe version`.

---

## 2. Đưa mã nguồn lên và build

1. Chép toàn bộ thư mục dự án vào `C:\toeic\app`, **trừ** các thư mục `node_modules`, `data`, `frontend\dist` và file `.env` của máy dev.
2. Cài thư viện và build giao diện:

```powershell
cd C:\toeic\app
npm ci            # tự cài luôn cho backend và frontend
npm run build     # tạo frontend\dist
npm test          # (nên chạy) kiểm tra mọi thứ hoạt động trên máy chủ
```

---

## 3. Cấu hình `.env`

```powershell
cd C:\toeic\app
Copy-Item .env.example .env
# Tạo chuỗi bí mật ngẫu nhiên cho SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
notepad .env
```

Sửa thành (giữ nguyên các dòng khác):

```ini
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
DATA_DIR=C:\toeic\data
SESSION_SECRET=<dán chuỗi ngẫu nhiên vừa tạo>
OWNER_USERNAME=owner
OWNER_PASSWORD=<mật khẩu mạnh, ít nhất 8 ký tự, KHÔNG dùng mật khẩu mặc định>
OWNER_DISPLAY_NAME=Thom Tran
MAX_UPLOAD_MB=100
BACKUP_DIR=D:\toeic-backup
```

Chỉ cho `webapp` và Administrators đọc file `.env` (file chứa mật khẩu):

```powershell
icacls C:\toeic\app\.env /inheritance:r /grant "Administrators:F" "SYSTEM:F" "webapp:R"
```

Tạo database và tài khoản admin chính:

```powershell
npm run seed
```

> Lệnh seed ở chế độ production sẽ **từ chối** nếu `OWNER_PASSWORD` là mật khẩu mặc định hoặc ngắn hơn 8 ký tự. Lệnh seed cũng tạo 3 đề mẫu ("Đề mẫu 1", "Đề mẫu 2", "TOEIC Reading – Đề 1"); không cần thì vào trang admin bấm "Ngừng mở đề".

Sau khi đăng nhập web lần đầu, admin chính nên **đổi mật khẩu ngay trên web**. Từ đó `OWNER_PASSWORD` trong `.env` không còn tác dụng.

---

## 4. Chạy web thành dịch vụ Windows bằng NSSM

```powershell
$nssm = "C:\tools\nssm\nssm.exe"
& $nssm install toeic-web "C:\Program Files\nodejs\node.exe" "src\server.js"
& $nssm set toeic-web AppDirectory "C:\toeic\app\backend"
& $nssm set toeic-web DisplayName "Web thi thu TOEIC"
& $nssm set toeic-web Start SERVICE_AUTO_START
# Chạy dưới tài khoản webapp (nhập mật khẩu đã đặt ở bước 1.2)
& $nssm set toeic-web ObjectName ".\webapp" "<mật khẩu webapp>"
# Nhật ký, tự cắt file khi quá 10 MB
& $nssm set toeic-web AppStdout "C:\toeic\logs\toeic-web.log"
& $nssm set toeic-web AppStderr "C:\toeic\logs\toeic-web.log"
& $nssm set toeic-web AppRotateFiles 1
& $nssm set toeic-web AppRotateOnline 1
& $nssm set toeic-web AppRotateBytes 10485760
# Bị tắt bất ngờ thì tự chạy lại sau 5 giây
& $nssm set toeic-web AppExit Default Restart
& $nssm set toeic-web AppRestartDelay 5000

& $nssm start toeic-web
```

> Nếu báo lỗi đăng nhập dịch vụ: mở `secpol.msc` → Local Policies → User Rights Assignment → **Log on as a service** → thêm `webapp`.

Kiểm tra:

```powershell
& $nssm status toeic-web                                  # SERVICE_RUNNING
Invoke-RestMethod http://127.0.0.1:3000/api/health        # ok = True
Get-Content C:\toeic\logs\toeic-web.log -Tail 20          # "Backend đang chạy tại http://127.0.0.1:3000 (production)"
```

Mở trình duyệt trên máy chủ: http://127.0.0.1:3000 phải thấy trang chủ.

---

## 5. Đưa ra Internet bằng Cloudflare Tunnel

Cần: tên miền đã quản lý trên Cloudflare (ví dụ `seamark.vn`). Cách dễ nhất là tạo tunnel trên trang web Cloudflare:

1. Vào https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** → đặt tên `toeic`.
2. Chọn môi trường **Windows**, làm theo hướng dẫn: tải `cloudflared`, rồi chạy lệnh cài dịch vụ có kèm token (PowerShell quyền Administrator):
   ```powershell
   cloudflared.exe service install <TOKEN do Cloudflare cung cấp>
   ```
3. Ở bước **Public Hostname**:
   - Subdomain: `thithu` — Domain: `seamark.vn` (sẽ thành `https://thithu.seamark.vn`)
   - Service: Type **HTTP**, URL **`localhost:3000`**
   - Mở **Additional application settings → HTTP Settings** → **HTTP Host Header**: điền đúng `thithu.seamark.vn`.
     (Web kiểm tra nguồn gửi khi tải file lên; thiếu bước này có thể bị báo "Yêu cầu không hợp lệ" khi upload ảnh/audio.)
4. Trong Cloudflare (trang quản lý tên miền) → **SSL/TLS → Edge Certificates** → bật **Always Use HTTPS**.

Kiểm tra từ máy khác: mở `https://thithu.seamark.vn`, đăng nhập admin, thử tải một ảnh lên một đề nháp.

> Muốn chỉ cho máy trong mạng trung tâm vào trang admin: cấu hình ở Cloudflare (Zero Trust → Access → Applications, áp cho đường dẫn `/admin*` và `/api/admin*`). Web không cần sửa gì.

---

## 6. Sao lưu tự động hằng ngày

Lệnh `npm run backup` sao lưu database (an toàn ngay khi web đang chạy) và chép các file ảnh/audio mới vào `BACKUP_DIR`, giữ 14 bản database gần nhất.

Tạo lịch chạy lúc 23:00 mỗi ngày dưới tài khoản `webapp`:

```powershell
$action  = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "src\backup.js" -WorkingDirectory "C:\toeic\app\backend"
$trigger = New-ScheduledTaskTrigger -Daily -At 23:00
Register-ScheduledTask -TaskName "toeic-backup" -Action $action -Trigger $trigger -User "webapp" -Password "<mật khẩu webapp>" -RunLevel Limited
# Chạy thử ngay:
Start-ScheduledTask -TaskName "toeic-backup"
Get-ChildItem D:\toeic-backup\database
```

Nên chép định kỳ thư mục `D:\toeic-backup` sang nơi khác (ổ cứng ngoài, Google Drive của trung tâm…).

### Khôi phục từ bản sao lưu

```powershell
& C:\tools\nssm\nssm.exe stop toeic-web
# Giữ lại database hiện tại phòng khi cần
Rename-Item C:\toeic\data\toeic.sqlite "toeic.sqlite.truoc-khoi-phuc"
Remove-Item C:\toeic\data\toeic.sqlite-wal, C:\toeic\data\toeic.sqlite-shm -ErrorAction SilentlyContinue
Copy-Item D:\toeic-backup\database\toeic-YYYYMMDD-HHmm.sqlite C:\toeic\data\toeic.sqlite
# Chép lại ảnh/audio (chỉ chép file còn thiếu)
robocopy D:\toeic-backup\uploads C:\toeic\data\uploads /E /XC /XN /XO
& C:\tools\nssm\nssm.exe start toeic-web
```

---

## 7. Cập nhật phiên bản mới

```powershell
$nssm = "C:\tools\nssm\nssm.exe"
Start-ScheduledTask -TaskName "toeic-backup"      # sao lưu trước
& $nssm stop toeic-web
# Chép mã nguồn mới đè lên C:\toeic\app (GIỮ NGUYÊN file .env; dữ liệu nằm ở C:\toeic\data nên không bị ảnh hưởng)
cd C:\toeic\app
npm ci
npm run build
npm test
& $nssm start toeic-web
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Thay đổi cấu trúc database (nếu có) **tự chạy** khi dịch vụ khởi động (xem dòng `[migration]` trong nhật ký).

---

## 8. Xử lý sự cố

| Hiện tượng | Kiểm tra / cách xử lý |
|---|---|
| Dịch vụ không chạy (`SERVICE_STOPPED`, `SERVICE_PAUSED`) | Xem `C:\toeic\logs\toeic-web.log`. Hay gặp: `SESSION_SECRET` chưa đặt / quá ngắn; cổng 3000 bị chương trình khác dùng (`netstat -ano \| findstr :3000`); `webapp` không có quyền ghi `C:\toeic\data`. |
| Trang web báo lỗi 502 / 1033 của Cloudflare | Dịch vụ `toeic-web` hoặc `cloudflared` đang tắt. Kiểm tra `Get-Service cloudflared` và `nssm status toeic-web`. |
| Tải ảnh/audio lên báo "Yêu cầu không hợp lệ" | Chưa đặt **HTTP Host Header** ở bước 5.3. |
| Đăng nhập xong vẫn bị đẩy ra | Đang vào bằng `http://` thay vì `https://` (cookie đăng nhập chỉ gửi qua HTTPS ở production). Bật Always Use HTTPS. |
| Admin chính quên mật khẩu | Trên máy chủ: `cd C:\toeic\app` rồi `npm run reset-password -- owner <mật khẩu mới>`. Các admin khác quên mật khẩu thì admin chính đặt lại trên web. |
| Ổ đĩa đầy | Xem dung lượng `C:\toeic\data\uploads` và `D:\toeic-backup`. |

---

## 9. Kiểm tra trước khi mở cho học viên

- [ ] `NODE_ENV=production`, `HOST=127.0.0.1`, `SESSION_SECRET` là chuỗi ngẫu nhiên riêng.
- [ ] Đã đổi mật khẩu admin chính trên web; file `.env` chỉ `webapp` + Administrators đọc được.
- [ ] Dịch vụ `toeic-web` chạy dưới tài khoản `webapp` (Services → cột "Log On As"), tự khởi động cùng Windows.
- [ ] Không mở cổng 3000 trên tường lửa; vào bằng `https://` tên miền được.
- [ ] Đã chạy thử sao lưu và thấy file trong `D:\toeic-backup`.
- [ ] Đã ngừng mở các đề mẫu không dùng.
- [ ] Đã làm thử một bài như học viên trên điện thoại (cả mạng 4G, không chỉ Wi-Fi trung tâm).
