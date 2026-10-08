// API phía HỌC VIÊN về đề thi.
// Lưu ý bảo mật: chỉ trả thông tin công khai. KHÔNG trả internal_note, draft_json, content_json.
const express = require('express');

function examsRouter(db) {
  const router = express.Router();

  // GET /api/exams — danh sách đề đã xuất bản
  router.get('/', (req, res) => {
    // Lấy thông tin từ bản xuất bản hiện tại (exam_versions), không lấy từ bản nháp
    const rows = db
      .prepare(
        `SELECT e.id, e.code, v.title, v.duration_minutes, v.question_count
           FROM exams e
           JOIN exam_versions v ON v.id = e.published_version_id
          WHERE e.status = 'published'
          ORDER BY v.title COLLATE NOCASE`
      )
      .all();

    res.json({
      exams: rows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        durationMinutes: r.duration_minutes,
        questionCount: r.question_count,
      })),
    });
  });

  return router;
}

module.exports = examsRouter;
