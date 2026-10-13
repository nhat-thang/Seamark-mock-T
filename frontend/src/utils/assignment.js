// Hai loại đề (đã chốt với người dùng):
//   Training Test    (category 'exam')     : cho mọi người, học viên chỉ nhập họ tên rồi chọn đề.
//   Class Assignment (category 'homework') : đề riêng của lớp; học sinh chọn lớp -> bấm tên mình -> chọn đề.
// Tên đề Class Assignment luôn bắt đầu bằng "Class Assignment - " (server tự thêm khi lưu):
// ô nhập chỉ cho giáo viên gõ phần tên phía sau, chữ "Class Assignment -" hiện cố định phía trước.

export const ASSIGNMENT_PREFIX = 'Class Assignment - ';

/** "Class Assignment - Đề lớp 1A" -> "Đề lớp 1A" (phần giáo viên tự đặt) */
export function assignmentName(title) {
  const s = String(title ?? '');
  return s.startsWith(ASSIGNMENT_PREFIX) ? s.slice(ASSIGNMENT_PREFIX.length) : s.replace(/^(class\s*assignment|homework)\s*[-–—:]?\s*/i, '');
}

/** Phần tên giáo viên gõ -> tên đầy đủ để lưu */
export const assignmentTitle = (name) => `${ASSIGNMENT_PREFIX}${name}`;

export const CATEGORY_LABELS = { exam: 'Training Test', homework: 'Class Assignment' };
