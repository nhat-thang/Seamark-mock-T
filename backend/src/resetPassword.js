// Đặt lại mật khẩu bằng lệnh trên máy chủ — dùng khi ADMIN CHÍNH quên mật khẩu
// (trên web chỉ admin chính mới đặt lại được mật khẩu cho người khác).
//
// Cách dùng (ở thư mục gốc dự án):
//   npm run reset-password -- <tên đăng nhập> <mật khẩu mới>
// Ví dụ:
//   npm run reset-password -- owner MatKhauMoi@2026
const config = require('./config');
const { openDb } = require('./db');
const { runMigrations } = require('./db/migrate');
const { hashPasswordSync, validateNewPassword } = require('./auth/password');
const { deleteSessionsOfAdmin } = require('./auth/sessions');
const { logAudit } = require('./audit');

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword) {
  console.error('Cách dùng: npm run reset-password -- <tên đăng nhập> <mật khẩu mới>');
  process.exit(1);
}
const err = validateNewPassword(newPassword);
if (err) {
  console.error(err);
  process.exit(1);
}

const db = openDb(config.dbFile);
runMigrations(db, { log: () => {} });
const admin = db.prepare('SELECT id, display_name FROM admins WHERE username = ?').get(username.trim().toLowerCase());
if (!admin) {
  console.error(`Không có tài khoản "${username}".`);
  process.exit(1);
}
db.prepare('UPDATE admins SET password_hash = ?, is_active = 1 WHERE id = ?').run(hashPasswordSync(newPassword), admin.id);
deleteSessionsOfAdmin(db, admin.id);
logAudit(db, { adminId: null, action: 'reset_password', detail: `Đặt lại mật khẩu cho "${username}" (${admin.display_name}) bằng lệnh trên máy chủ` });
db.close();
console.log(`Đã đặt mật khẩu mới cho "${username}" (${admin.display_name}). Tài khoản đã được mở khóa nếu đang bị vô hiệu hóa.`);
