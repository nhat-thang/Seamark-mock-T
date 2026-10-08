// API xem lịch sử — CHỈ admin chính (owner).
//   GET /api/admin/history/audit   lịch sử chỉnh sửa (đề thi, tài liệu, tài khoản...)
//   GET /api/admin/history/logins  lịch sử đăng nhập
// Có lọc và phân trang. (requireAdmin + requireOwner được gắn ở app.js)
const express = require('express');
const { paginate, addDateFilter } = require('../listUtils');

function historyRouter(db) {
  const router = express.Router();

  router.get('/audit', (req, res) => {
    const where = [];
    const params = [];
    const adminId = Number.parseInt(req.query.adminId, 10);
    if (adminId) { where.push('l.admin_id = ?'); params.push(adminId); }
    addDateFilter(req.query, 'l.created_at', where, params);

    const result = paginate(db, {
      select: `SELECT l.id, l.action, l.detail, l.created_at, l.exam_id,
                      a.username, a.display_name, e.code AS exam_code, e.title AS exam_title`,
      from: `FROM audit_log l
             LEFT JOIN admins a ON a.id = l.admin_id
             LEFT JOIN exams e ON e.id = l.exam_id`,
      where,
      params,
      orderBy: 'l.created_at DESC, l.id DESC',
      page: req.query.page,
    });

    res.json({
      items: result.rows.map((r) => ({
        id: r.id,
        action: r.action,
        detail: r.detail,
        createdAt: r.created_at,
        admin: r.username ? { username: r.username, displayName: r.display_name } : null,
        exam: r.exam_id ? { id: r.exam_id, code: r.exam_code, title: r.exam_title } : null,
      })),
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  });

  router.get('/logins', (req, res) => {
    const where = [];
    const params = [];
    const username = String(req.query.username || '').trim().toLowerCase();
    if (username) { where.push('h.username LIKE ?'); params.push(`%${username}%`); }
    if (req.query.result === 'success') where.push('h.success = 1');
    if (req.query.result === 'fail') where.push('h.success = 0');
    addDateFilter(req.query, 'h.created_at', where, params);

    const result = paginate(db, {
      select: `SELECT h.id, h.username, h.ip, h.user_agent, h.success, h.reason, h.created_at,
                      a.display_name`,
      from: `FROM login_history h LEFT JOIN admins a ON a.id = h.admin_id`,
      where,
      params,
      orderBy: 'h.created_at DESC, h.id DESC',
      page: req.query.page,
    });

    res.json({
      items: result.rows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.display_name ?? null,
        ip: r.ip,
        userAgent: r.user_agent,
        success: r.success === 1,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  });

  return router;
}

module.exports = historyRouter;
