// Lệnh sao lưu: `npm run backup`
// - Sao lưu database SQLite (an toàn ngay cả khi web đang chạy) thành file toeic-YYYYMMDD-HHmm.sqlite
// - Chép thêm các file ảnh / audio mới vào thư mục sao lưu (file cũ đã có thì bỏ qua)
// - Chỉ giữ 14 bản database gần nhất
// Thư mục sao lưu: BACKUP_DIR trong .env (nên đặt ở ổ đĩa khác), mặc định DATA_DIR/backups.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { openDb } = require('./db');

const KEEP = 14;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const backupDir = path.resolve(config.rootDir, process.env.BACKUP_DIR || path.join(config.dataDir, 'backups'));
  const dbDir = path.join(backupDir, 'database');
  const uploadsBackup = path.join(backupDir, 'uploads');
  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(uploadsBackup, { recursive: true });

  if (!fs.existsSync(config.dbFile)) throw new Error(`Không thấy database: ${config.dbFile}`);

  // 1. Database
  const target = path.join(dbDir, `toeic-${stamp()}.sqlite`);
  const db = openDb(config.dbFile);
  await db.backup(target);
  db.close();
  console.log(`Đã sao lưu database: ${target}`);

  // 2. File ảnh / audio (tên file ngẫu nhiên, không bao giờ bị sửa nên chỉ cần chép file mới)
  const uploads = path.join(config.dataDir, 'uploads');
  let copied = 0;
  if (fs.existsSync(uploads)) {
    for (const name of fs.readdirSync(uploads)) {
      const dest = path.join(uploadsBackup, name);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(uploads, name), dest);
        copied++;
      }
    }
  }
  console.log(`Đã chép ${copied} file ảnh/audio mới vào ${uploadsBackup}`);

  // 3. Xóa bớt bản database cũ
  const old = fs.readdirSync(dbDir).filter((f) => /^toeic-\d{8}-\d{4}\.sqlite$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(dbDir, f));
  if (old.length) console.log(`Đã xóa ${old.length} bản sao lưu cũ (giữ ${KEEP} bản gần nhất).`);
}

main().catch((err) => {
  console.error('Sao lưu thất bại:', err.message);
  process.exit(1);
});
