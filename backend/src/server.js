// Điểm khởi động backend: đọc cấu hình -> mở database -> chạy migration -> mở cổng.
const config = require('./config');
const { openDb } = require('./db');
const { runMigrations } = require('./db/migrate');
const { createApp } = require('./app');
const { finalizeExpiredAttempts } = require('./exam/attempts');

const db = openDb(config.dbFile);
runMigrations(db);

// Tự nộp các bài đã hết giờ (học viên đóng trình duyệt giữa chừng): chạy lúc khởi động và mỗi phút
function autoSubmit() {
  try {
    const n = finalizeExpiredAttempts(db);
    if (n > 0) console.log(`[tự nộp] Đã nộp ${n} bài hết giờ.`);
  } catch (err) {
    console.error('[tự nộp] Lỗi:', err);
  }
}
autoSubmit();
setInterval(autoSubmit, 60 * 1000).unref();

const app = createApp({ db, config });

// Express 5 gọi hàm này cả khi mở cổng THẤT BẠI (truyền lỗi vào err), nên phải kiểm tra err
const server = app.listen(config.port, config.host, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[lỗi] Cổng ${config.port} đang bị chương trình khác dùng (ví dụ Docker, một bản web khác đang chạy).\n` +
          `      Hãy tắt chương trình đó, hoặc đổi PORT trong file .env sang số khác (ví dụ ${config.port + 1}) rồi chạy lại.`
      );
    } else {
      console.error(`[lỗi] Không mở được cổng ${config.port}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log(`Backend đang chạy tại http://${config.host}:${config.port} (${config.nodeEnv})`);
  console.log(`Dữ liệu lưu ở: ${config.dataDir}`);
});

// Tắt gọn gàng khi dừng dịch vụ (Ctrl+C hoặc NSSM stop): đóng cổng rồi đóng database
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Nếu sau 5 giây vẫn chưa đóng được thì thoát luôn
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
