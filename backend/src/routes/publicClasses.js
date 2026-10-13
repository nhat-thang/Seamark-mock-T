// API phía HỌC SINH cho Class Assignment (không đăng nhập):
//   GET /api/classes                              các lớp đang có (tên, màu, số bài đang mở)
//   GET /api/classes/:id                          lớp + họ tên các học sinh đang học
//   GET /api/classes/:id/assignments?student=:sid bài của lớp đang mở + số lần học sinh đó đã làm
// Đã chốt với người dùng: danh sách lớp và họ tên học sinh hiện công khai (học sinh bấm tên mình là làm được).
// Bảo mật: CHỈ trả họ tên — KHÔNG trả SĐT, ghi chú, ngày vào học, học phí, mật khẩu đề.
const express = require('express');
const { loadStudents } = require('../classes/students');

function publicClassesRouter(db) {
  const router = express.Router();
  const toInt = (v) => Number.parseInt(v, 10) || 0;

  // Đề Class Assignment đang mở của một lớp
  const OPEN_ASSIGNMENTS = `
    SELECT e.id, e.access_code, v.title, v.duration_minutes, v.question_count, v.published_at, a.display_name AS teacher_name
      FROM exam_classes ec
      JOIN exams e ON e.id = ec.exam_id
      JOIN exam_versions v ON v.id = e.published_version_id
      LEFT JOIN admins a ON a.id = e.created_by
     WHERE ec.class_id = ? AND e.category = 'homework' AND e.status = 'published'`;

  function findClass(req, res) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND deleted_at IS NULL').get(toInt(req.params.id));
    if (!cls) res.status(404).json({ error: 'Không tìm thấy lớp học. Có thể lớp đã kết thúc.' });
    return cls;
  }

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.color,
                (SELECT COUNT(*) FROM class_students st WHERE st.class_id = c.id AND st.removed_at IS NULL) AS students,
                (SELECT COUNT(*) FROM exam_classes ec JOIN exams e ON e.id = ec.exam_id
                  WHERE ec.class_id = c.id AND e.category = 'homework' AND e.status = 'published') AS assignments
           FROM classes c
          WHERE c.deleted_at IS NULL
          ORDER BY c.name COLLATE NOCASE`
      )
      .all()
      .filter((c) => c.students > 0); // lớp chưa có học sinh thì chưa hiện
    res.json({ classes: rows.map((c) => ({ id: c.id, name: c.name, color: c.color, studentCount: c.students, assignmentCount: c.assignments })) });
  });

  router.get('/:id', (req, res) => {
    const cls = findClass(req, res);
    if (!cls) return;
    // loadStudents đã xếp theo tên như sổ điểm danh; chỉ lấy học sinh đang học và CHỈ họ tên
    const students = loadStudents(db, cls).filter((s) => s.isActive).map((s) => ({ id: s.id, fullName: s.fullName }));
    res.json({ class: { id: cls.id, name: cls.name, color: cls.color }, students });
  });

  router.get('/:id/assignments', (req, res) => {
    const cls = findClass(req, res);
    if (!cls) return;
    const studentId = toInt(req.query.student);
    const student = studentId
      ? db.prepare('SELECT s.id FROM students s JOIN class_students st ON st.id = s.class_student_id WHERE st.id = ? AND st.class_id = ?').get(studentId, cls.id)
      : null;
    const mine = student
      ? db.prepare(
          `SELECT v.exam_id, a.status, a.started_at, a.submitted_at, a.deadline_at, a.correct_count, a.question_total
             FROM attempts a JOIN exam_versions v ON v.id = a.exam_version_id
            WHERE a.student_id = ? ORDER BY a.started_at`
        ).all(student.id)
      : [];
    const now = new Date().toISOString();
    const rows = db.prepare(`${OPEN_ASSIGNMENTS} ORDER BY v.published_at DESC`).all(cls.id);
    res.json({
      assignments: rows.map((r) => {
        const own = mine.filter((m) => m.exam_id === r.id);
        const done = own.filter((m) => m.status === 'submitted');
        const last = done.at(-1);
        return {
          id: r.id,
          title: r.title,
          teacherName: r.teacher_name,
          durationMinutes: r.duration_minutes,
          questionCount: r.question_count,
          publishedAt: r.published_at,
          needsPassword: Boolean(r.access_code), // chỉ báo có / không, KHÔNG gửi mật khẩu
          doneCount: done.length,
          lastSubmittedAt: last ? last.submitted_at : null,
          lastCorrect: last ? last.correct_count : null,
          lastTotal: last ? last.question_total : null,
          inProgress: own.some((m) => m.status === 'in_progress' && m.deadline_at > now),
        };
      }),
    });
  });

  return router;
}

module.exports = publicClassesRouter;
