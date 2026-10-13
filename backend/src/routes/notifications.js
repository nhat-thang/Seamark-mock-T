// Chuông thông báo trên web cho giáo viên (requireAdmin gắn ở app.js). Trình duyệt hỏi lại mỗi phút.
//   GET  /api/admin/notifications       buổi dạy sắp tới (24 giờ tới), buổi chưa điểm danh, thông báo mới
//   POST /api/admin/notifications/read  đánh dấu đã đọc hết
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { SESSION_SELECT, toSession } = require('../classes/sessions');
const { DAY_MS } = require('../classes/time');
const { accessOf } = require('../classes/access');

function notificationsRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  router.get('/', (req, res) => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const me = req.admin.id;
    const access = accessOf(db, req.admin);
    const list = (sql, ...params) =>
      db.prepare(`${SESSION_SELECT} WHERE c.deleted_at IS NULL AND ${sql} ORDER BY s.starts_at`).all(...params).map((r) => toSession(r, req.admin, now, access));

    const mine = 'EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id AND x.admin_id = ?)';
    // Buổi mình dạy trong 24 giờ tới (kể cả đang diễn ra) mà chưa điểm danh
    const upcoming = list(
      `${mine} AND s.attendance_at IS NULL AND s.ends_at > ? AND s.starts_at < ?`,
      me, nowIso, new Date(now + DAY_MS).toISOString()
    );
    // Buổi đã kết thúc, chưa điểm danh, còn sửa được: buổi mình dạy + buổi của lớp mình phụ trách.
    // Admin chính thêm các buổi chỉ có giáo viên ngoài ("Khác").
    const teacherSql = req.admin.role === 'owner'
      ? `(${mine} OR NOT EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id))`
      : `(${mine} OR s.class_id IN (SELECT class_id FROM class_teachers WHERE admin_id = ?))`;
    const pending = list(
      `${teacherSql} AND s.attendance_at IS NULL AND s.ends_at <= ? AND s.starts_at >= ?`,
      ...(req.admin.role === 'owner' ? [me] : [me, me]), nowIso, new Date(now - 3 * DAY_MS).toISOString()
    ).filter((s) => req.admin.role === 'owner' || Date.parse(s.editUntil) > now);

    const items = db
      .prepare('SELECT id, text, link, created_at, read_at FROM notifications WHERE admin_id = ? ORDER BY created_at DESC, id DESC LIMIT 20')
      .all(me)
      .map((n) => ({ id: n.id, text: n.text, link: n.link, createdAt: n.created_at, read: !!n.read_at }));
    const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE admin_id = ? AND read_at IS NULL').get(me).n;

    res.json({ upcoming, pending, items, unread });
  });

  router.post('/read', (req, res) => {
    db.prepare('UPDATE notifications SET read_at = ? WHERE admin_id = ? AND read_at IS NULL').run(new Date().toISOString(), req.admin.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = notificationsRouter;
