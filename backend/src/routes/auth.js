// API đăng nhập / đăng xuất / đổi mật khẩu cho admin.
const express = require('express');
const { verifyPassword, hashPassword, getDummyHash, validateNewPassword } = require('../auth/password');
const { COOKIE_NAME, createSession, deleteSession, deleteSessionsOfAdmin } = require('../auth/sessions');
const { recordLogin, checkLoginBlocked } = require('../auth/loginHistory');
const { requireAdmin, requireJson, getSessionToken } = require('../auth/middleware');
const { logAudit } = require('../audit');

// Chỉ trả những trường an toàn (KHÔNG BAO GIỜ trả password_hash)
function publicAdmin(a) {
  return { id: a.id, username: a.username, displayName: a.displayName ?? a.display_name, role: a.role };
}

function authRouter(db, config) {
  const router = express.Router();
  router.use(requireJson);

  const cookieOptions = {
    httpOnly: true, // JavaScript trên trang không đọc được cookie
    sameSite: 'lax',
    secure: config.isProduction, // production chạy HTTPS qua Cloudflare
    path: '/',
  };

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }
    if (username.length > 50 || password.length > 200) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const ip = req.ip;
    const userAgent = String(req.get('user-agent') || '').slice(0, 300);
    const log = (extra) => recordLogin(db, { username, ip, userAgent, ...extra });

    const block = checkLoginBlocked(db, { username, ip });
    if (block.blocked) {
      log({ success: false, reason: 'rate_limited' });
      return res.status(429).json({
        error: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${block.minutesLeft} phút.`,
      });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    const ok = await verifyPassword(password, admin ? admin.password_hash : getDummyHash());

    if (!admin || !ok) {
      log({ adminId: admin?.id ?? null, success: false, reason: admin ? 'wrong_password' : 'unknown_user' });
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }
    // Chỉ báo "bị vô hiệu hóa" khi mật khẩu đúng, để người lạ không dò được
    if (!admin.is_active) {
      log({ adminId: admin.id, success: false, reason: 'disabled' });
      return res.status(403).json({
        error: 'Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ admin chính.',
      });
    }

    log({ adminId: admin.id, success: true, reason: 'ok' });
    const token = createSession(db, { adminId: admin.id, secret: config.sessionSecret, ip, userAgent });
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ admin: publicAdmin(admin) });
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    deleteSession(db, getSessionToken(req), config.sessionSecret);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });

  // GET /api/auth/me — admin đang đăng nhập là ai (+ các phần hướng dẫn đã xem)
  router.get('/me', requireAdmin(db, config), (req, res) => {
    const row = db.prepare('SELECT tours_done FROM admins WHERE id = ?').get(req.admin.id);
    res.json({ admin: { ...publicAdmin(req.admin), toursDone: JSON.parse(row?.tours_done || '[]') } });
  });

  // POST /api/auth/tours/:name — đánh dấu đã xem / bỏ qua một phần hướng dẫn từng bước
  router.post('/tours/:name', requireAdmin(db, config), (req, res) => {
    const name = String(req.params.name);
    if (!/^[a-z0-9-]{1,40}$/.test(name)) return res.status(400).json({ error: 'Tên hướng dẫn không hợp lệ.' });
    const row = db.prepare('SELECT tours_done FROM admins WHERE id = ?').get(req.admin.id);
    const done = new Set(JSON.parse(row?.tours_done || '[]'));
    done.add(name);
    db.prepare('UPDATE admins SET tours_done = ? WHERE id = ?').run(JSON.stringify([...done].slice(0, 50)), req.admin.id);
    res.json({ toursDone: [...done] });
  });

  // POST /api/auth/change-password — mọi admin tự đổi mật khẩu của mình
  router.post('/change-password', requireAdmin(db, config), async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng.' });
    }
    const err = validateNewPassword(newPassword);
    if (err) return res.status(400).json({ error: err });
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    }

    const hash = await hashPassword(newPassword);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, req.admin.id);
    // Đăng xuất ở các máy khác, giữ lại phiên đang dùng
    deleteSessionsOfAdmin(db, req.admin.id, req.admin.sessionId);
    logAudit(db, { adminId: req.admin.id, action: 'change_password', detail: 'Tự đổi mật khẩu' });
    res.json({ ok: true });
  });

  return router;
}

module.exports = authRouter;
