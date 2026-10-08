// GET /api/files/:storedName — phục vụ ảnh / audio của đề.
// Tên file trên đĩa là chuỗi ngẫu nhiên 32 ký tự (không đoán được), chỉ ai có nội dung đề mới biết.
// Hỗ trợ tải từng đoạn (Range) để audio phát / tua được.
const path = require('path');
const express = require('express');
const { SERVE_MIME } = require('../upload');

const NAME_RE = /^[a-f0-9]{32}\.(mp3|m4a|wav|jpg|jpeg|png|webp)$/;

function filesRouter(db, config) {
  const router = express.Router();
  const uploadsDir = path.join(config.dataDir, 'uploads');

  router.get('/:name', (req, res) => {
    const name = req.params.name;
    // Chỉ nhận đúng dạng tên do hệ thống tạo -> không thể dùng ".." để đọc file khác
    if (!NAME_RE.test(name) || !db.prepare('SELECT 1 FROM media WHERE stored_name = ?').get(name)) {
      return res.status(404).json({ error: 'Không tìm thấy file.' });
    }
    res.type(SERVE_MIME[path.extname(name).slice(1)]);
    // Nội dung một file không bao giờ đổi (thay file = tên ngẫu nhiên mới), nên cho trình duyệt và
    // Cloudflare lưu đệm lâu dài: cả lớp cùng nghe audio thì Cloudflare phát giúp, VPS không bị nghẽn mạng.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(name, { root: uploadsDir, dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Không tìm thấy file.' });
    });
  });

  return router;
}

module.exports = filesRouter;
