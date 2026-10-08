// Tạo ứng dụng Express. Tách riêng khỏi server.js để test có thể tạo app với database tạm.
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const examsRouter = require('./routes/exams');
const authRouter = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const historyRouter = require('./routes/history');
const attemptsRouter = require('./routes/attempts');
const adminExamsRouter = require('./routes/adminExams');
const filesRouter = require('./routes/files');
const resultsRouter = require('./routes/results');
const templatesRouter = require('./routes/templates');
const { requireAdmin, requireOwner } = require('./auth/middleware');

/**
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db
 * @param {object} options.config cấu hình (xem config.js)
 */
function createApp({ db, config }) {
  const app = express();

  // Đứng sau Cloudflare Tunnel: tin header X-Forwarded-* để lấy đúng IP người dùng
  if (config.isProduction) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet());
  // Giới hạn kích thước body JSON (đề 200 câu ở dạng chữ vẫn dưới mức này)
  app.use(express.json({ limit: '5mb' }));

  // ----- API -----
  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/exams', examsRouter(db));
  api.use('/attempts', attemptsRouter(db));
  api.use('/files', filesRouter(db, config));
  api.use('/auth', authRouter(db, config));

  // Mọi API dưới /api/admin đều bắt buộc đăng nhập
  const admin = express.Router();
  admin.use(requireAdmin(db, config));
  // Mọi admin
  admin.use('/exams', adminExamsRouter(db, config));
  admin.use('/results', resultsRouter(db));
  admin.use('/templates', templatesRouter(db));
  // Tải file Excel mẫu (docs/mau-de-toeic.xlsx)
  admin.get('/excel-template', (req, res) => {
    res.download(path.join(config.rootDir, 'docs', 'mau-de-toeic.xlsx'), 'mau-de-toeic.xlsx', (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Không tìm thấy file mẫu.' });
    });
  });
  // Chỉ admin chính (owner)
  admin.use('/accounts', requireOwner, accountsRouter(db));
  admin.use('/history', requireOwner, historyRouter(db));
  api.use('/admin', admin);

  // Đường dẫn /api không tồn tại
  api.use((req, res) => {
    res.status(404).json({ error: 'Không tìm thấy địa chỉ yêu cầu.' });
  });
  app.use('/api', api);

  // ----- Frontend (chỉ ở production) -----
  // Ở máy dev, frontend chạy riêng bằng Vite (cổng 5173) và gọi /api qua proxy.
  if (config.isProduction) {
    const indexHtml = path.join(config.frontendDist, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      console.warn('[cảnh báo] Chưa có frontend/dist. Hãy chạy "npm run build" trước.');
    }
    app.use(
      express.static(config.frontendDist, {
        index: false,
        // File trong /assets có mã băm trong tên (đổi nội dung là đổi tên) -> cho trình duyệt nhớ lâu
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );
    // Mọi đường dẫn khác (ví dụ /bat-dau) đều trả về index.html để React Router xử lý.
    // index.html không cache: cập nhật web xong, người dùng thấy bản mới ngay.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml, (err) => err && next(err));
    });
  }

  // ----- Xử lý lỗi chung -----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Máy chủ gặp lỗi. Vui lòng thử lại sau.' });
  });

  return app;
}

module.exports = { createApp };
