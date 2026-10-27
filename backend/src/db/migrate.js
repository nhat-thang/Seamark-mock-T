// Hệ thống migration đơn giản:
// - Các file SQL trong thư mục migrations/ được đặt tên có số thứ tự: 001_init.sql, 002_xxx.sql...
// - Bảng schema_migrations ghi lại file nào đã chạy, để mỗi file chỉ chạy đúng một lần.
// - Muốn thay đổi cấu trúc database: TẠO FILE MỚI, không sửa file cũ đã chạy.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function runMigrations(db, { log = console.log } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  // Sắp xếp theo tên để chạy đúng thứ tự 001, 002, ...
  // File .js dùng khi cần chuyển dữ liệu bằng code (không viết được bằng SQL): module.exports = (db) => { ... }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.(sql|js)$/.test(f))
    .sort();

  const insert = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const full = path.join(MIGRATIONS_DIR, file);
    // Chạy trong transaction: lỗi giữa chừng thì không để database ở trạng thái dở dang
    db.transaction(() => {
      if (file.endsWith('.js')) require(full)(db, { log });
      else db.exec(fs.readFileSync(full, 'utf8'));
      insert.run(file);
    })();
    log(`[migration] Đã chạy ${file}`);
  }
}

module.exports = { runMigrations };
