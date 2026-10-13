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
        `SELECT e.id, e.code, e.category, a.display_name AS teacher_name, v.title, v.duration_minutes, v.question_count, v.published_at
           FROM exams e
           JOIN exam_versions v ON v.id = e.published_version_id
           LEFT JOIN admins a ON a.id = e.created_by
          WHERE e.status = 'published'
          ORDER BY v.title COLLATE NOCASE`
      )
      .all();

    res.json({
      exams: rows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        // 'exam' = đề thi thử, 'homework' = bài tập về nhà (kèm tên giáo viên ra đề)
        category: r.category,
        teacherName: r.category === 'homework' ? r.teacher_name : null,
        publishedAt: r.published_at,
        durationMinutes: r.duration_minutes,
        questionCount: r.question_count,
      })),
    });
  });

  return router;
}

module.exports = examsRouter;
