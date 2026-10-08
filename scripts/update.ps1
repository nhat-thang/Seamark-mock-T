# Cập nhật web thi thử lên phiên bản mới nhất trên GitHub (chạy trên VPS).
# Cách chạy: mở PowerShell bằng "Run as administrator" rồi gõ:
#     C:\toeic\app\scripts\update.ps1
# Các bước: sao lưu -> tải code mới -> tắt web -> cài thư viện -> build giao diện -> bật web -> kiểm tra.
# Dữ liệu (đề, kết quả, tài khoản) nằm ở DATA_DIR nên không bị ảnh hưởng.
# Thông báo in ra viết không dấu để hiện đúng trên mọi cửa sổ PowerShell.
param(
  [string]$AppDir = 'C:\toeic\app',
  [string]$Service = 'toeic-web',
  [string]$Nssm = 'C:\tools\nssm\nssm.exe'
)

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) {
  Write-Host "`nLOI: $text" -ForegroundColor Red
  exit 1
}

# ---- Kiểm tra trước khi làm ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail 'Hay mo PowerShell bang "Run as administrator" roi chay lai.' }
$envFile = Join-Path $AppDir '.env'
if (-not (Test-Path $envFile)) { Fail "Khong thay file .env trong $AppDir." }
if (-not (Test-Path $Nssm)) { Fail "Khong thay NSSM o $Nssm." }

# Cổng của web lấy từ .env (mặc định 3000) để kiểm tra web sau khi bật lại
$port = 3000
$portLine = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
if ($portLine) { $port = [int]$portLine.Matches[0].Groups[1].Value }

Set-Location $AppDir

# ---- Các bước khi web còn đang chạy ----
Step '1/6 Sao luu du lieu truoc khi cap nhat'
node backend\src\backup.js
if ($LASTEXITCODE -ne 0) { Fail 'Sao luu that bai, chua cap nhat gi. Xem thong bao phia tren.' }

Step '2/6 Tai code moi tu GitHub'
# --ff-only: chỉ cập nhật khi code trên VPS không bị ai sửa tay (tránh trộn lẫn code)
git pull --ff-only
if ($LASTEXITCODE -ne 0) { Fail 'Khong tai duoc code moi (git pull). Web van chay ban cu.' }

# ---- Tắt web để cài thư viện (Windows khóa các file thư viện đang được web dùng) ----
Step '3/6 Tat web'
# Dịch vụ khác phụ thuộc vào web (ví dụ link tạm "toeic-tunnel" cài theo hướng dẫn cũ) làm Windows từ chối tắt web
# -> bỏ sự phụ thuộc đó (cloudflared tự kết nối lại khi web chạy lại, không cần phụ thuộc)
foreach ($dep in (Get-Service -Name $Service).DependentServices) {
  sc.exe config $dep.Name depend= / | Out-Null   # "depend= /" = không phụ thuộc dịch vụ nào
}
& $Nssm stop $Service | Out-Null
# Chờ web tắt hẳn (tối đa 30 giây): web còn chạy thì Windows khóa file thư viện, npm ci sẽ lỗi
for ($i = 0; $i -lt 15 -and (Get-Service -Name $Service).Status -ne 'Stopped'; $i++) { Start-Sleep -Seconds 2 }
if ((Get-Service -Name $Service).Status -ne 'Stopped') {
  & $Nssm start $Service | Out-Null
  Fail 'Khong tat duoc web nen chua cai dat gi. Web van chay ban cu. Gui man hinh nay cho nguoi ho tro.'
}

$problem = $null
Step '4/6 Cai thu vien (npm ci)'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { $problem = 'Cai thu vien (npm ci) that bai.' }

if (-not $problem) {
  Step '5/6 Build giao dien'
  npm run build
  if ($LASTEXITCODE -ne 0) { $problem = 'Build giao dien that bai.' }
}

# Dù cài / build lỗi vẫn bật lại web để học viên không bị gián đoạn lâu
Step '6/6 Bat lai web'
& $Nssm start $Service | Out-Null

# Chờ web sẵn sàng (tối đa 30 giây)
$ok = $false
for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
  Start-Sleep -Seconds 2
  try { $ok = (Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 3).ok -eq $true } catch { }
}

if ($problem) { Fail "$problem Xem thong bao phia tren va gui cho nguoi ho tro." }
if (-not $ok) { Fail 'Web chua chay lai. Xem nhat ky: Get-Content C:\toeic\logs\toeic-web.log -Tail 30 -Encoding UTF8' }

$version = git log -1 --format='%h %s'
Write-Host "`nXONG! Web da chay phien ban: $version" -ForegroundColor Green
