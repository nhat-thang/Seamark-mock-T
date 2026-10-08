// API quản lý tài khoản admin — CHỈ admin chính (owner).
// (requireAdmin + requireOwner được gắn ở app.js)
const express = require('express');
const { hashPassword, validateNewPassword } = require('../auth/password');
const { deleteSessionsOfAdmin } = require('../auth/sessions');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toAccount(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

function accountsRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  const findById = (id) => db.prepare('SELECT * FROM admins WHERE id = ?').get(id);

  // Lấy tài khoản theo :id, báo lỗi nếu không có. Trả về null nếu đã gửi lỗi.
  function loadTarget(req, res) {
    const target = findById(Number.parseInt(req.params.id, 10) || 0);
    if (!target) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return null;
    }
    return target;
  }

  // GET /api/admin/accounts — danh sách tài khoản
  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.username, a.display_name, a.role, a.is_active, a.created_at,
                (SELECT MAX(h.created_at) FROM login_history h
                  WHERE h.admin_id = a.id AND h.success = 1) AS last_login_at
           FROM admins a
          ORDER BY (a.role = 'owner') DESC, a.display_name COLLATE NOCASE`
      )
      .all();
    res.json({ accounts: rows.map(toAccount) });
  });

  // POST /api/admin/accounts — tạo tài khoản admin mới
  router.post('/', async (req, res) => {
    const username = cleanText(req.body?.username).toLowerCase();
    const displayName = cleanText(req.body?.displayName);
    const password = String(req.body?.password ?? '');

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Tên đăng nhập phải dài 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.',
      });
    }
    if (!displayName || displayName.length > 50) {
      return res.status(400).json({ error: 'Vui lòng nhập tên hiển thị (tối đa 50 ký tự).' });
    }
    const pwErr = validateNewPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) {
      return res.status(409).json({ error: `Tên đăng nhập "${username}" đã có người dùng. Vui lòng chọn tên khác.` });
    }

    const hash = await hashPassword(password);
    const id = db
      .prepare(`INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')`)
      .run(username, hash, displayName).lastInsertRowid;
    logAudit(db, {
      adminId: req.admin.id,
      action: 'create_admin',
      detail: `Tạo tài khoản "${username}" (${displayName})`,
    });
    res.status(201).json({ account: toAccount(findById(id)) });
  });

  // POST /api/admin/accounts/:id/disable — vô hiệu hóa
  // POST /api/admin/accounts/:id/enable  — mở lại
  for (const [path, active] of [['disable', 0], ['enable', 1]]) {
    router.post(`/:id/${path}`, (req, res) => {
      const target = loadTarget(req, res);
      if (!target) return;
      if (target.id === req.admin.id) {
        return res.status(400).json({ error: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình.' });
      }
      db.prepare('UPDATE admins SET is_active = ? WHERE id = ?').run(active, target.id);
      // Vô hiệu hóa thì đăng xuất người đó ngay lập tức
      if (!active) deleteSessionsOfAdmin(db, target.id);
      logAudit(db, {
        adminId: req.admin.id,
        action: active ? 'enable_admin' : 'disable_admin',
        detail: `${active ? 'Mở lại' : 'Vô hiệu hóa'} tài khoản "${target.username}" (${target.display_name})`,
      });
      res.json({ account: toAccount(findById(target.id)) });
    });
  }

  // POST /api/admin/accounts/:id/reset-password — đặt lại mật khẩu khi người khác quên
  router.post('/:id/reset-password', async (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    if (target.id === req.admin.id) {
      return res.status(400).json({ error: 'Để đổi mật khẩu của chính bạn, hãy dùng mục "Đổi mật khẩu".' });
    }
    const newPassword = String(req.body?.newPassword ?? '');
    const pwErr = validateNewPassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const hash = await hashPassword(newPassword);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, target.id);
    // Mật khẩu cũ không còn dùng được: đăng xuất người đó ở mọi nơi
    deleteSessionsOfAdmin(db, target.id);
    logAudit(db, {
      adminId: req.admin.id,
      action: 'reset_password',
      detail: `Đặt lại mật khẩu cho "${target.username}" (${target.display_name})`,
    });
    res.json({ ok: true });
  });

  return router;
}

module.exports = accountsRouter;
