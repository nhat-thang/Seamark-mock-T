// Đọc buổi học (kèm tên lớp, các giáo viên, số học sinh đã điểm danh) và đổi sang dữ liệu trả về trình duyệt.
const { sessionPermissions, teacherIdsOf } = require('./rules');

// teacher_ids: id các giáo viên có tài khoản dạy buổi (một buổi có thể nhiều giáo viên);
// teacher_pairs: "id:tên|id:tên" (id và tên trong cùng một chuỗi để không bị lệch cặp).
const SESSION_SELECT = `
  SELECT s.*, c.name AS class_name, c.color AS class_color,
         (SELECT GROUP_CONCAT(st.admin_id) FROM session_teachers st WHERE st.session_id = s.id) AS teacher_ids,
         (SELECT GROUP_CONCAT(st.admin_id || ':' || a.display_name, '|') FROM session_teachers st
            JOIN admins a ON a.id = st.admin_id WHERE st.session_id = s.id) AS teacher_pairs,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS n_marked,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status IN ('present', 'late')) AS n_present
    FROM class_sessions s
    JOIN classes c ON c.id = s.class_id`;

/** Các giáo viên có tài khoản của buổi: [{ id, name }] (sắp theo tên) */
function teachersOf(row) {
  if (!row.teacher_pairs) return [];
  return String(row.teacher_pairs)
    .split('|')
    .map((p) => {
      const i = p.indexOf(':');
      return { id: Number(p.slice(0, i)), name: p.slice(i + 1) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Tên giáo viên của buổi để hiển thị: "Cô Lan, Thầy Nam" (+ giáo viên ngoài nếu có) */
function teacherName(row) {
  const names = teachersOf(row).map((t) => t.name);
  if (row.teacher_name) names.push(row.teacher_name);
  return names.join(', ');
}

function toSession(row, admin, now = Date.now(), access = null) {
  const p = sessionPermissions(admin, row, now, access);
  const ids = teacherIdsOf(row);
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
    teacher: {
      ids, // giáo viên có tài khoản
      list: teachersOf(row),
      id: ids[0] ?? null, // (giữ cho phần cũ còn dùng)
      name: teacherName(row),
      otherName: row.teacher_name, // giáo viên ngoài (không có tài khoản)
      isOther: ids.length === 0,
      isMine: ids.includes(admin.id),
    },
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

module.exports = { SESSION_SELECT, teacherName, teachersOf, toSession, findSession, notify };
