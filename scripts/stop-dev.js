// Lệnh: npm run stop-dev
// Tắt mọi bản "npm run dev" của dự án này còn chạy ngầm (ví dụ cửa sổ terminal cũ quên tắt),
// để lần chạy sau không bị báo "Port ... is already in use".
//
// Chỉ tắt:
//   1. tiến trình concurrently / vite có đường dẫn dự án này, cùng mọi tiến trình con của chúng;
//   2. backend "src/server.js" đang giữ đúng cổng PORT trong .env (và tiến trình "node --watch" sinh ra nó).
// Không đụng tới chương trình khác (Docker, dự án khác...).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');

// Đọc PORT trong .env (không có thì 3000)
let port = 3000;
try {
  const m = fs.readFileSync(path.join(projectDir, '.env'), 'utf8').match(/^\s*PORT\s*=\s*(\d+)/m);
  if (m) port = Number(m[1]);
} catch {
  // không có .env
}

if (process.platform !== 'win32') {
  try {
    execFileSync('pkill', ['-f', `${projectDir}.*(vite|concurrently)`], { stdio: 'ignore' });
  } catch {
    // pkill trả lỗi khi không có tiến trình nào -> bỏ qua
  }
  console.log('Đã tắt các bản dev đang chạy (nếu có).');
  process.exit(0);
}

const ps = `
$dir = '${projectDir.replace(/'/g, "''")}'
$all = @(Get-CimInstance Win32_Process)
$targets = @{}
function Add-Tree($id) {
  if ($targets.ContainsKey($id)) { return }
  $targets[$id] = $true
  foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $id }) { Add-Tree $c.ProcessId }
}
# 1. concurrently / vite của dự án + tiến trình con
foreach ($p in $all | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -like "*$dir*concurrently*" -or $_.CommandLine -like "*$dir*vite*") }) {
  Add-Tree $p.ProcessId
}
# 2. backend đang giữ cổng ${port}
foreach ($c in @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue)) {
  $p = $all | Where-Object { $_.ProcessId -eq $c.OwningProcess }
  if ($p -and $p.CommandLine -like '*src/server.js*') {
    $targets[$p.ProcessId] = $true
    $parent = $all | Where-Object { $_.ProcessId -eq $p.ParentProcessId }
    if ($parent -and $parent.CommandLine -like '*--watch*src/server.js*') { $targets[$parent.ProcessId] = $true }
  }
}
$n = 0
foreach ($id in $targets.Keys) {
  $p = $all | Where-Object { $_.ProcessId -eq $id }
  if ($p -and $p.Name -eq 'node.exe') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; $n++ }
}
Write-Output $n
`;
const count = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
console.log(
  count === '0'
    ? 'Không có bản dev nào của dự án đang chạy.'
    : `Đã tắt ${count} tiến trình của bản dev cũ. Giờ chạy lại: npm run dev`
);
