// Quy tắc của một buổi học: ai được mở, khi nào được bắt đầu, sửa điểm danh tới khi nào.
const { addDays, toInstant, formatDate, weekdayOf, WEEKDAY_LONG } = require('./time');

// Được bấm "Bắt đầu buổi học" sớm nhất 30 phút trước giờ học trên thời khóa biểu
const START_EARLY_MINUTES = 30;

/**
 * Các mốc thời gian của buổi học (số mili giây):
 * - startFrom: từ lúc này được bấm "Bắt đầu" và điểm danh
 * - editUntil: giáo viên sửa điểm danh tới hết ngày hôm sau ngày học (đã chốt với người dùng).
 *   Sau mốc này chỉ admin chính sửa được.
 */
function sessionWindow(s) {
  return {
    startFrom: Date.parse(s.starts_at) - START_EARLY_MINUTES * 60 * 1000,
    editUntil: Date.parse(toInstant(addDays(s.date, 2), '00:00')),
  };
}

/**
 * Quyền của admin với một buổi học tại thời điểm `now`.
 * - Admin chỉ mở được buổi mình dạy. Buổi của giáo viên "Khác" chỉ admin chính mở (đã chốt).
 * - Admin chính mở được mọi buổi, sửa điểm danh không giới hạn thời gian,
 *   nhưng cũng chỉ bắt đầu được từ 30 phút trước giờ học (không điểm danh trước cho buổi chưa tới).
 */
function sessionPermissions(admin, s, now = Date.now()) {
  const isOwner = admin.role === 'owner';
  const canOpen = isOwner || (s.teacher_admin_id != null && s.teacher_admin_id === admin.id);
  const { startFrom, editUntil } = sessionWindow(s);
  let reason = '';
  if (!canOpen) {
    reason = s.teacher_admin_id == null
      ? 'Buổi này do giáo viên ngoài dạy, chỉ admin chính mở được để điểm danh.'
      : 'Đây không phải buổi dạy của bạn. Bạn chỉ mở được các buổi mình dạy.';
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

module.exports = { START_EARLY_MINUTES, sessionWindow, sessionPermissions, describeSession };
