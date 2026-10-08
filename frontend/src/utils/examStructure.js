// Cấu trúc chuẩn đề TOEIC Listening + Reading và các hàm tạo / tìm câu hỏi.

export const STANDARD_PARTS = [
  { part: 1, from: 1, to: 6, name: 'Mô tả tranh' },
  { part: 2, from: 7, to: 31, name: 'Hỏi đáp' },
  { part: 3, from: 32, to: 70, name: 'Hội thoại' },
  { part: 4, from: 71, to: 100, name: 'Bài nói' },
  { part: 5, from: 101, to: 130, name: 'Hoàn thành câu' },
  { part: 6, from: 131, to: 146, name: 'Hoàn thành đoạn văn' },
  { part: 7, from: 147, to: 200, name: 'Đọc hiểu' },
];

export const KIND_OPTIONS = [
  { value: 'conversation', label: 'Hội thoại (Part 3)' },
  { value: 'talk', label: 'Bài nói (Part 4)' },
  { value: 'text', label: 'Đoạn văn điền từ (Part 6)' },
  { value: 'single', label: 'Đoạn văn đơn (Part 7)' },
  { value: 'double', label: 'Đoạn văn đôi (Part 7)' },
  { value: 'triple', label: 'Đoạn văn ba (Part 7)' },
];

export function standardPart(no) {
  return STANDARD_PARTS.find((p) => no >= p.from && no <= p.to)?.part ?? null;
}

/** Các lựa chọn hợp lệ: Part 2 chỉ A–C */
export const lettersForPart = (part) => (part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);

/** Nhóm chứa câu số no (theo khoảng Từ câu – Đến câu) */
export function groupForNo(groups, no) {
  return (groups || []).find((g) => no >= g.from && no <= g.to) || null;
}

/** Tạo câu trống đúng cấu trúc (dùng khi nhập đáp án / thêm câu chưa có) */
export function emptyQuestion(no, groups) {
  const part = standardPart(no);
  const options = {};
  for (const l of lettersForPart(part)) options[l] = '';
  return {
    no,
    part,
    type: 'mcq',
    groupCode: [3, 4, 6, 7].includes(part) ? groupForNo(groups, no)?.code ?? null : null,
    question: '',
    options,
    answer: null,
    image: null,
    explanation: '',
  };
}

/** Trả về nội dung mới với câu `no` được sửa bằng hàm change (tạo câu nếu chưa có) */
export function updateQuestion(content, no, change) {
  const exists = content.questions.some((q) => q.no === no);
  const base = exists ? content.questions : [...content.questions, emptyQuestion(no, content.groups)];
  const questions = base.map((q) => (q.no === no ? { ...q, ...change(q) } : q)).sort((a, b) => a.no - b.no);
  return { ...content, questions };
}
