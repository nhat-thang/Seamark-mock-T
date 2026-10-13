// Bài tập về nhà (homework): tên đề luôn bắt đầu bằng "Homework - " (server tự thêm khi lưu).
// Ô nhập chỉ cho giáo viên gõ phần tên phía sau, chữ "Homework -" hiện cố định phía trước.

export const HOMEWORK_PREFIX = 'Homework - ';

/** "Homework - Đề lớp 1A" -> "Đề lớp 1A" (phần giáo viên tự đặt) */
export function homeworkName(title) {
  const s = String(title ?? '');
  return s.startsWith(HOMEWORK_PREFIX) ? s.slice(HOMEWORK_PREFIX.length) : s.replace(/^homework\s*[-–—:]?\s*/i, '');
}

/** Phần tên giáo viên gõ -> tên đầy đủ để lưu */
export const homeworkTitle = (name) => `${HOMEWORK_PREFIX}${name}`;

export const CATEGORY_LABELS = { exam: 'Đề thi thử', homework: 'Homework' };
