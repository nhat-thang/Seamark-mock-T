// Mở kết nối SQLite bằng better-sqlite3.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Mở (hoặc tạo mới) file database.
 * @param {string} filePath đường dẫn file .sqlite, hoặc ':memory:' khi chạy test
 */
function openDb(filePath) {
  if (filePath !== ':memory:') {
    // Tạo thư mục chứa database nếu chưa có (ví dụ lần đầu chạy)
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  // WAL: cho phép vừa đọc vừa ghi cùng lúc tốt hơn
  db.pragma('journal_mode = WAL');
  // Bật kiểm tra khóa ngoại (SQLite mặc định tắt)
  db.pragma('foreign_keys = ON');
  // Nếu database đang bận thì chờ tối đa 5 giây thay vì báo lỗi ngay
  db.pragma('busy_timeout = 5000');

  // Hàm fold(chuỗi): bỏ dấu tiếng Việt + chữ thường, để tìm "nguyen" ra "Nguyễn".
  // Dùng trong SQL: WHERE fold(s.last_name) LIKE ?
  db.function('fold', { deterministic: true }, (s) => foldText(s));
  return db;
}

/** "Nguyễn Văn Đức" -> "nguyen van duc" */
function foldText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

module.exports.foldText = foldText;

module.exports.openDb = openDb;
