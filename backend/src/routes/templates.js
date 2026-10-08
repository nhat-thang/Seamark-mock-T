// API khung mẫu đề (mọi admin). requireAdmin được gắn ở app.js.
//   GET  /api/admin/templates             danh sách khung mẫu (hiện trong "Tạo đề mới")
//   POST /api/admin/templates/:id/delete   xóa khung mẫu (đề đã tạo từ khung không bị ảnh hưởng)
// Lưu đề thành khung: POST /api/admin/exams/:id/template (ở routes/adminExams.js)
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const { summary } = require('../exam/templates');

function templatesRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT t.*, a.display_name FROM exam_templates t LEFT JOIN admins a ON a.id = t.created_by
          ORDER BY t.name COLLATE NOCASE`
      )
      .all();
    res.json({
      templates: rows.map((t) => ({
        id: t.id,
        name: t.name,
        durationMinutes: t.duration_minutes,
        sourceExamId: t.source_exam_id,
        createdBy: t.display_name,
        updatedAt: t.updated_at,
        ...summary(JSON.parse(t.structure_json)),
      })),
    });
  });

  router.post('/:id/delete', (req, res) => {
    const t = db.prepare('SELECT * FROM exam_templates WHERE id = ?').get(Number.parseInt(req.params.id, 10) || 0);
    if (!t) return res.status(404).json({ error: 'Không tìm thấy khung mẫu.' });
    db.prepare('DELETE FROM exam_templates WHERE id = ?').run(t.id);
    logAudit(db, { adminId: req.admin.id, action: 'delete_template', detail: `Xóa khung mẫu "${t.name}"` });
    res.json({ ok: true });
  });

  return router;
}

module.exports = templatesRouter;
