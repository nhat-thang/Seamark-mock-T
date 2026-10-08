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
| `C:\toeic-backup` | Bản sao lưu (`BACKUP_DIR`). Có ổ đĩa dữ liệu thứ hai thì nên đặt ở ổ đó (ví dụ `E:\toeic-backup`) | Đọc + ghi |

> Kiểm tra ổ đĩa trước khi chọn chỗ sao lưu: `Get-PSDrive -PSProvider FileSystem`. Ổ `D:` trên nhiều VPS là **ổ CD**, không ghi được.

---

## 1. Chuẩn bị máy chủ (làm 1 lần)

### 1.1. Cài Node.js 24, Git, NSSM, cloudflared

Dự án cần **Node.js 24** (khai báo ở `engines` trong `package.json`). Mở PowerShell bằng **Run as administrator**, dán cả đoạn dưới đây (tự tải và cài bản mới nhất):

```powershell
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$tmp = "$env:TEMP\toeic-setup"; New-Item -ItemType Directory -Force $tmp | Out-Null
# Node.js 24 LTS
$sums = (Invoke-WebRequest "https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt" -UseBasicParsing).Content
$msi = ([regex]::Match($sums, 'node-v24\.[\d.]+-x64\.msi')).Value
Invoke-WebRequest "https://nodejs.org/dist/latest-v24.x/$msi" -OutFile "$tmp\$msi" -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i `"$tmp\$msi`" /qn /norestart" -Wait
# Git
$rel = Invoke-RestMethod "https://api.github.com/repos/git-for-windows/git/releases/latest" -UseBasicParsing
$asset = $rel.assets | Where-Object { $_.name -match '^Git-[\d.]+-64-bit\.exe$' } | Select-Object -First 1
Invoke-WebRequest $asset.browser_download_url -OutFile "$tmp\git.exe" -UseBasicParsing
Start-Process "$tmp\git.exe" -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP-" -Wait
# NSSM -> C:\tools\nssm\nssm.exe
Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$tmp\nssm.zip" -UseBasicParsing
Expand-Archive "$tmp\nssm.zip" "$tmp\nssm" -Force
New-Item -ItemType Directory -Force C:\tools\nssm, C:\tools\cloudflared | Out-Null
Copy-Item "$tmp\nssm\nssm-2.24\win64\nssm.exe" C:\tools\nssm\nssm.exe -Force
# cloudflared -> C:\tools\cloudflared\cloudflared.exe
Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile C:\tools\cloudflared\cloudflared.exe -UseBasicParsing
# Cho phép chạy script có sẵn trên máy (lệnh npm trong PowerShell là một script)
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
```

**Đóng** cửa sổ đó, mở PowerShell (Administrator) mới rồi kiểm tra:

```powershell
node -v          # v24.x.x
npm -v
git --version
C:\tools\nssm\nssm.exe version
C:\tools\cloudflared\cloudflared.exe --version
```

> Thư viện `better-sqlite3` và `bcrypt` có sẵn bản dựng cho Windows 64-bit, **không** cần cài Python hay Visual Studio. Lệnh cài đặt của dự án đã dùng `--ignore-scripts` để npm không cố biên dịch lại (nếu không sẽ gặp lỗi `gyp ERR! find Python`).

### 1.2. Tạo tài khoản Windows `webapp` (không có quyền admin)

```powershell
# Đặt một mật khẩu mạnh, ghi lại (cần ở bước NSSM và sao lưu)
$pw = Read-Host -AsSecureString "Mật khẩu cho tài khoản webapp"
New-LocalUser -Name "webapp" -Password $pw -PasswordNeverExpires -UserMayNotChangePassword -Description "Chạy web thi thử TOEIC"
```

Không thêm `webapp` vào nhóm Administrators.

### 1.3. Tạo thư mục và phân quyền

```powershell
New-Item -ItemType Directory -Force C:\toeic\data, C:\toeic\logs, C:\toeic-backup | Out-Null

# Dữ liệu, nhật ký, sao lưu: webapp được đọc + ghi
icacls C:\toeic\data /grant "webapp:(OI)(CI)M"
icacls C:\toeic\logs /grant "webapp:(OI)(CI)M"
icacls C:\toeic-backup /grant "webapp:(OI)(CI)M"
```

Cấp thêm cho `webapp` quyền chạy tác vụ theo lịch (dùng cho sao lưu ở mục 6): `Win + R` → `secpol.msc` → **Local Policies → User Rights Assignment → Log on as a batch job** → **Add User or Group…** → `webapp` → **OK**. (Quyền "Log on as a service" thì NSSM tự cấp ở mục 4.)

---

## 2. Lấy mã nguồn từ GitHub và build

```powershell
git clone https://github.com/nhat-thang/Seamark-mock-T.git C:\toeic\app
# Mã nguồn: webapp chỉ được đọc + chạy
icacls C:\toeic\app /grant "webapp:(OI)(CI)RX"

cd C:\toeic\app
npm ci            # tự cài luôn cho backend và frontend
npm run build     # tạo frontend\dist
npm test          # (nên chạy) kiểm tra mọi thứ hoạt động trên máy chủ: phải "fail 0"
```

> Repo để **Private** thì lần đầu `git clone` sẽ hiện cửa sổ đăng nhập GitHub.

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
MAX_UPLOAD_MB=95
BACKUP_DIR=C:\toeic-backup
```

> Đường dẫn viết thẳng, **không** đặt trong dấu nháy kép. Mật khẩu không chứa dấu cách, `#` và dấu nháy. `MAX_UPLOAD_MB` không đặt quá 95 (Cloudflare gói Free chặn request trên 100 MB). Lưu file bằng Notepad với bảng mã **UTF-8**.

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

> Báo `The service did not start due to a logon failure`: mật khẩu đưa cho NSSM không khớp mật khẩu `webapp`. Đặt lại cả hai cùng lúc:
> ```powershell
> $wpw = Read-Host "Mat khau moi cho webapp"
> ```
> rồi (dán riêng):
> ```powershell
> Set-LocalUser -Name webapp -Password (ConvertTo-SecureString $wpw -AsPlainText -Force)
> & C:\tools\nssm\nssm.exe set toeic-web ObjectName ".\webapp" "$wpw"
> & C:\tools\nssm\nssm.exe start toeic-web
> ```
> Lệnh `Read-Host` luôn dán **riêng một mình**, nếu không dòng lệnh dán sau sẽ bị hiểu là mật khẩu.

Kiểm tra:

```powershell
& $nssm status toeic-web                                  # SERVICE_RUNNING
Invoke-RestMethod http://127.0.0.1:3000/api/health        # ok = True
Get-Content C:\toeic\logs\toeic-web.log -Tail 20          # "Backend đang chạy tại http://127.0.0.1:3000 (production)"
```

Mở trình duyệt trên máy chủ: http://127.0.0.1:3000 phải thấy trang chủ.

---

## 5. Đưa ra Internet bằng Cloudflare Tunnel

### 5.1. Chưa có tên miền: link tạm để khách dùng thử

Cloudflare Quick Tunnel cho một link `https://<chữ-ngẫu-nhiên>.trycloudflare.com`, miễn phí, không cần tài khoản. **Chỉ dùng để thử**: link đổi tên mỗi lần dịch vụ / máy khởi động lại, Cloudflare không cam kết ổn định, một số mạng chặn tên miền này.

Chạy thành dịch vụ (không phải giữ cửa sổ PowerShell):

```powershell
$nssm = "C:\tools\nssm\nssm.exe"
& $nssm install toeic-tunnel "C:\tools\cloudflared\cloudflared.exe" "tunnel --url http://localhost:3000"
& $nssm set toeic-tunnel DisplayName "Link tam Cloudflare cho web TOEIC"
& $nssm set toeic-tunnel Start SERVICE_AUTO_START
& $nssm set toeic-tunnel ObjectName "NT AUTHORITY\LocalService" ""
icacls C:\toeic\logs /grant "LOCAL SERVICE:(OI)(CI)M" | Out-Null
& $nssm set toeic-tunnel AppStdout "C:\toeic\logs\tunnel.log"
& $nssm set toeic-tunnel AppStderr "C:\toeic\logs\tunnel.log"
& $nssm set toeic-tunnel AppRotateFiles 1
& $nssm set toeic-tunnel AppRotateBytes 10485760
& $nssm start toeic-tunnel
```

Xem link hiện tại (chạy lại mỗi khi máy khởi động lại):

```powershell
(Select-String C:\toeic\logs\tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -Last 1).Matches.Value
```

Khi đã có tên miền: gỡ link tạm (`nssm stop toeic-tunnel` rồi `nssm remove toeic-tunnel confirm`) và làm 5.2–5.3. Dữ liệu không bị ảnh hưởng.

### 5.2. Mua tên miền

Dễ nhất là mua trên Cloudflare (https://dash.cloudflare.com → **Domain Registration → Register Domains**; giá gốc, khoảng 10–11 USD/năm cho `.com`, thanh toán thẻ Visa/Mastercard hoặc PayPal; nên đứng tên trung tâm và bật Auto-renew). Tên miền mua ở đây có sẵn trong Cloudflare, không phải đổi nameserver.

Tên miền `.vn` (Cloudflare không bán) hoặc tên miền trung tâm đã có: thêm vào Cloudflare (**Add a domain**, gói Free) rồi đổi nameserver ở nhà đăng ký theo 2 nameserver Cloudflare đưa. Nếu tên miền đang chạy website / email, kiểm tra Cloudflare đã chép đủ bản ghi DNS (nhất là `MX`) trước khi đổi.

### 5.3. Tunnel cố định cho tên miền

Cần: tên miền đã quản lý trên Cloudflare (ví dụ `seamark.vn`). Cách dễ nhất là tạo tunnel trên trang web Cloudflare:

1. Vào https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** → đặt tên `toeic`.
2. Chọn môi trường **Windows**, làm theo hướng dẫn: tải `cloudflared`, rồi chạy lệnh cài dịch vụ có kèm token (PowerShell quyền Administrator):
   ```powershell
   C:\tools\cloudflared\cloudflared.exe service install "<TOKEN do Cloudflare cung cấp>"
   Get-Service cloudflared     # Status: Running
   ```
3. Ở bước **Public Hostname**:
   - Subdomain: `thithu` — Domain: `seamark.vn` (sẽ thành `https://thithu.seamark.vn`)
   - Service: Type **HTTP**, URL **`localhost:3000`**
   - Mở **Additional application settings → HTTP Settings** → **HTTP Host Header**: điền đúng `thithu.seamark.vn`.
     (Web kiểm tra nguồn gửi khi tải file lên; thiếu bước này có thể bị báo "Yêu cầu không hợp lệ" khi upload ảnh/audio.)
   - Giao diện mới của Cloudflare có thể gọi mục này là **Published application routes**.
4. Trong Cloudflare (trang quản lý tên miền) → **SSL/TLS → Edge Certificates** → bật **Always Use HTTPS**.

Kiểm tra từ máy khác: mở `https://thithu.seamark.vn`, đăng nhập admin, thử tải một ảnh lên một đề nháp.

> Muốn chỉ cho máy trong mạng trung tâm vào trang admin: cấu hình ở Cloudflare (Zero Trust → Access → Applications, áp cho đường dẫn `/admin*` và `/api/admin*`). Web không cần sửa gì.

---

## 6. Sao lưu tự động hằng ngày

Lệnh `npm run backup` sao lưu database (an toàn ngay khi web đang chạy) và chép các file ảnh/audio mới vào `BACKUP_DIR`, giữ 14 bản database gần nhất.

Tạo lịch chạy lúc 23:00 mỗi ngày dưới tài khoản `webapp` (cần quyền "Log on as a batch job" ở mục 1.3). Dán **riêng** dòng nhập mật khẩu:

```powershell
$wpw = Read-Host "Mat khau tai khoan webapp"
```

rồi:

```powershell
$action  = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "src\backup.js" -WorkingDirectory "C:\toeic\app\backend"
$trigger = New-ScheduledTaskTrigger -Daily -At 23:00
Register-ScheduledTask -TaskName "toeic-backup" -Action $action -Trigger $trigger -User "webapp" -Password $wpw -RunLevel Limited | Out-Null
Remove-Variable wpw
# Chạy thử ngay:
schtasks /run /tn "toeic-backup"
Start-Sleep 15
Get-ScheduledTaskInfo -TaskName "toeic-backup" | Format-List LastRunTime, LastTaskResult   # LastTaskResult: 0
Get-ChildItem C:\toeic-backup\database
```

- `LastTaskResult` là `267011` (chưa chạy lần nào) dù đã chạy thử: `webapp` thiếu quyền **Log on as a batch job** (mục 1.3).
- Giờ trong lịch là **giờ của VPS**. Kiểm tra bằng `Get-Date`. VPS để múi giờ nước ngoài thì đổi sang giờ Việt Nam (`Set-TimeZone -Id "SE Asia Standard Time"`, hỏi chủ máy trước vì ảnh hưởng phần mềm khác) hoặc dời giờ chạy cho khớp. Giờ trên web và file Excel kết quả luôn là giờ Việt Nam, không phụ thuộc VPS.
- Bản sao lưu nằm cùng máy với dữ liệu: nên chép định kỳ thư mục `C:\toeic-backup` sang nơi khác (ổ cứng ngoài, Google Drive của trung tâm…), ít nhất mỗi tuần một lần.

### Khôi phục từ bản sao lưu

```powershell
& C:\tools\nssm\nssm.exe stop toeic-web
# Giữ lại database hiện tại phòng khi cần
Rename-Item C:\toeic\data\toeic.sqlite "toeic.sqlite.truoc-khoi-phuc"
Remove-Item C:\toeic\data\toeic.sqlite-wal, C:\toeic\data\toeic.sqlite-shm -ErrorAction SilentlyContinue
Copy-Item C:\toeic-backup\database\toeic-YYYYMMDD-HHmm.sqlite C:\toeic\data\toeic.sqlite
# Chép lại ảnh/audio (chỉ chép file còn thiếu)
robocopy C:\toeic-backup\uploads C:\toeic\data\uploads /E /XC /XN /XO
& C:\tools\nssm\nssm.exe start toeic-web
```

---

## 7. Cập nhật phiên bản mới

Trên máy lập trình: sửa code → `npm test` → `git push`. Trên VPS, mở PowerShell **Run as administrator** và chạy:

```powershell
C:\toeic\app\scripts\update.ps1
```

Script tự làm: sao lưu → `git pull` → tắt web → `npm ci` → build giao diện → bật lại web → kiểm tra. Hết chừng 1–3 phút, web tắt khoảng 1–2 phút nên làm ngoài giờ thi (học viên đang làm dở không mất bài). Cuối cùng in `XONG! Web da chay phien ban: ...`; có lỗi thì in `LOI: ...` và web vẫn được bật lại.

- Không sửa code trực tiếp trên VPS (script sẽ từ chối `git pull` để tránh trộn code).
- File `.env` và dữ liệu ở `C:\toeic\data` không bị đụng tới.
- Thay đổi cấu trúc database (nếu có) **tự chạy** khi dịch vụ khởi động (xem dòng `[migration]` trong nhật ký).
- Lần đầu cập nhật từ bản cũ chưa có `scripts\update.ps1`: chạy `cd C:\toeic\app; git pull` trước, rồi mới chạy script.

---

## 8. Xử lý sự cố

| Hiện tượng | Kiểm tra / cách xử lý |
|---|---|
| `npm : File ...\npm.ps1 cannot be loaded because running scripts is disabled` | Chạy (Administrator): `Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force`. |
| `npm ci` báo `gyp ERR! find Python` / `Cannot find module 'better-sqlite3'` | Đang dùng code cũ. `git pull` rồi chạy lại `npm ci` (bản mới đã cài với `--ignore-scripts`, dùng bản dựng sẵn, không cần Python). |
| Đọc nhật ký thấy chữ tiếng Việt lỗi dấu | Thêm `-Encoding UTF8`: `Get-Content C:\toeic\logs\toeic-web.log -Tail 30 -Encoding UTF8`. |
| Dịch vụ không chạy (`SERVICE_STOPPED`, `SERVICE_PAUSED`) | Xem `C:\toeic\logs\toeic-web.log`. `logon failure`: xem ghi chú ở mục 4. Hay gặp: `SESSION_SECRET` chưa đặt / quá ngắn; cổng 3000 bị chương trình khác dùng (`netstat -ano \| findstr :3000`); `webapp` không có quyền ghi `C:\toeic\data`. |
| Trang web báo lỗi 502 / 1033 của Cloudflare | Dịch vụ `toeic-web` hoặc `cloudflared` đang tắt. Kiểm tra `Get-Service cloudflared` và `nssm status toeic-web`. |
| Link `trycloudflare.com` không vào được nữa | Máy / dịch vụ đã khởi động lại nên link đổi tên. Lấy link mới bằng lệnh ở mục 5.1. |
| Tải ảnh/audio lên báo "Yêu cầu không hợp lệ" | Chưa đặt **HTTP Host Header** ở bước 5.3. |
| Đăng nhập xong vẫn bị đẩy ra | Đang vào bằng `http://` thay vì `https://` (cookie đăng nhập chỉ gửi qua HTTPS ở production). Bật Always Use HTTPS. |
| Admin chính quên mật khẩu | Trên máy chủ: `cd C:\toeic\app` rồi `npm run reset-password -- owner <mật khẩu mới>`. Các admin khác quên mật khẩu thì admin chính đặt lại trên web. |
| Ổ đĩa đầy | Xem dung lượng `C:\toeic\data\uploads` và `C:\toeic-backup`. |

---

## 9. Kiểm tra trước khi mở cho học viên

- [ ] `NODE_ENV=production`, `HOST=127.0.0.1`, `SESSION_SECRET` là chuỗi ngẫu nhiên riêng.
- [ ] Đã đổi mật khẩu admin chính trên web; file `.env` chỉ `webapp` + Administrators đọc được.
- [ ] Dịch vụ `toeic-web` chạy dưới tài khoản `webapp` (Services → cột "Log On As"), tự khởi động cùng Windows.
- [ ] Không mở cổng 3000 trên tường lửa; vào bằng `https://` tên miền được.
- [ ] Đã chạy thử sao lưu và thấy file trong `C:\toeic-backup`.
- [ ] Đã ngừng mở các đề mẫu không dùng.
- [ ] Windows Update: **Settings → Windows Update → Change active hours** đặt theo giờ học của trung tâm (tránh máy tự khởi động lại giữa giờ thi); trước buổi thi quan trọng bấm **Pause updates**.
- [ ] Đã thử 5–10 người cùng làm một đề có audio để xem tốc độ thực tế. Audio nên nén mp3 64–96 kbps, mono cho nhẹ.
- [ ] Đã làm thử một bài như học viên trên điện thoại (cả mạng 4G, không chỉ Wi-Fi trung tâm).
