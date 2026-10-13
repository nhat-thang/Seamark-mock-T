// Quy tắc của một buổi học: ai được mở, khi nào được bắt đầu, sửa điểm danh tới khi nào.
const { addDays, toInstant, formatDate, weekdayOf, vnDate, WEEKDAY_LONG } = require('./time');

// Được bấm "Bắt đầu buổi học" sớm nhất 30 phút trước giờ học trên thời khóa biểu
const START_EARLY_MINUTES = 30;

/** Id các giáo viên (có tài khoản) dạy buổi này — từ cột teacher_ids của SESSION_SELECT */
const teacherIdsOf = (s) => (s.teacher_ids ? String(s.teacher_ids).split(',').map(Number) : []);

/**
 * Các mốc thời gian của buổi học (số mili giây):
 * - startFrom: từ lúc này được bấm "Bắt đầu" và điểm danh
 * - editUntil: giáo viên sửa điểm danh tới hết ngày hôm sau ngày học (đã chốt). Buổi owner thêm vào sau khi
 *   đã qua (học bù / đột xuất) thì tính từ ngày owner thêm buổi, để giáo viên còn kịp điểm danh bổ sung.
 *   Sau mốc này chỉ admin chính sửa được.
 */
function sessionWindow(s) {
  const addedLate = s.created_at && s.created_at > s.ends_at;
  const base = addedLate ? vnDate(Date.parse(s.created_at)) : s.date;
  return {
    startFrom: Date.parse(s.starts_at) - START_EARLY_MINUTES * 60 * 1000,
    editUntil: Date.parse(toInstant(addDays(base, 2), '00:00')),
  };
}

/**
 * Quyền của admin với một buổi học tại thời điểm `now`.
 * - Mở / điểm danh: admin chính, giáo viên dạy buổi đó, và giáo viên phụ trách lớp (đã chốt).
 *   access: kết quả accessOf() (classes/access.js).
 * - Admin chính sửa điểm danh không giới hạn thời gian, nhưng cũng chỉ bắt đầu được từ 30 phút trước giờ học.
 */
function sessionPermissions(admin, s, now = Date.now(), access = null) {
  const isOwner = admin.role === 'owner';
  const canOpen = isOwner || teacherIdsOf(s).includes(admin.id) || Boolean(access && access.canSeeClass(s.class_id));
  const { startFrom, editUntil } = sessionWindow(s);
  let reason = '';
  if (!canOpen) {
    reason = 'Đây không phải buổi dạy của bạn. Bạn chỉ mở được buổi mình dạy hoặc của lớp mình phụ trách.';
  } else if (now < startFrom) {
    reason = `Chưa tới giờ. Bạn bấm "Bắt đầu" được từ ${START_EARLY_MINUTES} phút trước giờ học.`;
  } else if (!isOwner && now >= editUntil) {
    reason = 'Đã hết hạn sửa điểm danh (hết ngày hôm sau ngày học). Cần sửa thì nhờ admin chính.';
  }
  const canEdit = canOpen && !reason;
  return { isOwner, canOpen, canStart: canEdit, canEdit, startFrom, editUntil, reason };
}

/** "Thứ 2, 13/10/2026 18:00–19:30" — dùng trong lịch sử chỉnh sửa và thông báo */
function describeSession(s) {
  return `${WEEKDAY_LONG[weekdayOf(s.date)]}, ${formatDate(s.date)} ${s.start_time}–${s.end_time}`;
}

module.exports = { START_EARLY_MINUTES, sessionWindow, sessionPermissions, describeSession, teacherIdsOf };
