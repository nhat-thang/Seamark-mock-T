// Đọc buổi học (kèm tên lớp, tên giáo viên, số học sinh đã điểm danh) và đổi sang dữ liệu trả về trình duyệt.
const { sessionPermissions } = require('./rules');

const SESSION_SELECT = `
  SELECT s.*, c.name AS class_name, c.color AS class_color,
         t.display_name AS teacher_display,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS n_marked,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present', 'late')) AS n_present
    FROM class_sessions s
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN admins t ON t.id = s.teacher_admin_id`;

/** Tên giáo viên của buổi: tên tài khoản, hoặc tên gõ tay khi chọn "Khác" */
const teacherName = (row) => (row.teacher_admin_id ? row.teacher_display : row.teacher_name);

function toSession(row, admin, now = Date.now()) {
  const p = sessionPermissions(admin, row, now);
  return {
    id: row.id,
    classId: row.class_id,
    className: row.class_name,
    classColor: row.class_color,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    teacher: { id: row.teacher_admin_id, name: teacherName(row), isOther: !row.teacher_admin_id },
    room: row.room,
    note: row.note,
    seriesId: row.series_id,
    startedAt: row.started_at,
    attendanceAt: row.attendance_at,
    marked: row.n_marked,
    present: row.n_present,
    // Mốc thời gian để trình duyệt tự tính trạng thái theo từng phút (sắp tới / bắt đầu được / chưa điểm danh)
    startFrom: new Date(p.startFrom).toISOString(),
    editUntil: new Date(p.editUntil).toISOString(),
    canOpen: p.canOpen,
  };
}

/** Buổi học theo id (bỏ qua buổi của lớp đã xóa) */
function findSession(db, id) {
  return db.prepare(`${SESSION_SELECT} WHERE s.id = ? AND c.deleted_at IS NULL`).get(id) || null;
}

/** Thêm thông báo cho một giáo viên (không tự báo cho chính người vừa thao tác) */
function notify(db, { adminId, actorId, text, link = '' }) {
  if (!adminId || adminId === actorId) return;
  db.prepare('INSERT INTO notifications (admin_id, text, link, created_at) VALUES (?, ?, ?, ?)').run(
    adminId, text, link, new Date().toISOString()
  );
}

module.exports = { SESSION_SELECT, teacherName, toSession, findSession, notify };
