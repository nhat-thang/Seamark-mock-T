// Middleware kiểm tra quyền. Dùng cho MỌI API admin (không chỉ ẩn nút trên giao diện).
const { COOKIE_NAME, findSessionAdmin } = require('./sessions');

/** Đọc cookie từ header (không cần thêm thư viện cookie-parser). */
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getSessionToken(req) {
  return readCookie(req, COOKIE_NAME);
}

/** Bắt buộc đã đăng nhập. Gắn thông tin admin vào req.admin. */
function requireAdmin(db, config) {
  return (req, res, next) => {
    const admin = findSessionAdmin(db, getSessionToken(req), config.sessionSecret);
    if (!admin) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    req.admin = admin;
    next();
  };
}

/** Bắt buộc là admin chính (owner). Đặt SAU requireAdmin. */
function requireOwner(req, res, next) {
  if (!req.admin || req.admin.role !== 'owner') {
    return res.status(403).json({ error: 'Chỉ admin chính mới được làm việc này.' });
  }
  next();
}

/**
 * Các request thay đổi dữ liệu phải gửi JSON.
 * Trang web lạ không gửi được JSON kèm cookie sang đây (trình duyệt chặn),
 * nên đây là một lớp chống giả mạo request (CSRF) bên cạnh cookie SameSite=Lax.
 */
function requireJson(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Yêu cầu không hợp lệ.' });
  }
  next();
}

module.exports = { requireAdmin, requireOwner, requireJson, getSessionToken };
