// Tên + lời dặn từng phần của đề (giống backend/src/exam/parts.js).
// Đề TOEIC: 7 Part cố định, có tên / lời dặn mặc định (admin sửa được). Đề tự thiết kế: admin tự đặt.

export const TOEIC_PART_DEFAULTS = [
  { no: 1, name: 'Part 1 – Mô tả tranh', directions: 'Nghe bốn câu mô tả về bức tranh và chọn câu mô tả đúng nhất. Các câu mô tả chỉ có trong audio, không in ra.' },
  { no: 2, name: 'Part 2 – Hỏi đáp', directions: 'Nghe một câu hỏi hoặc câu nói và ba câu trả lời, chọn câu trả lời phù hợp nhất. Nội dung chỉ có trong audio.' },
  { no: 3, name: 'Part 3 – Hội thoại', directions: 'Nghe các đoạn hội thoại ngắn và trả lời các câu hỏi về mỗi đoạn.' },
  { no: 4, name: 'Part 4 – Bài nói', directions: 'Nghe các bài nói ngắn của một người và trả lời các câu hỏi về mỗi bài.' },
  { no: 5, name: 'Part 5 – Hoàn thành câu', directions: 'Chọn từ hoặc cụm từ phù hợp nhất để hoàn thành câu.' },
  { no: 6, name: 'Part 6 – Hoàn thành đoạn văn', directions: 'Đọc đoạn văn và chọn từ, cụm từ hoặc câu phù hợp nhất cho mỗi chỗ trống.' },
  { no: 7, name: 'Part 7 – Đọc hiểu', directions: 'Đọc các đoạn văn (đoạn đơn, đoạn đôi, đoạn ba) và chọn câu trả lời đúng nhất cho mỗi câu hỏi.' },
];

export const isCustomExam = (content) => content?.examType === 'CUSTOM';

/** [{ no, name, directions, audio }] — luôn đủ thông tin */
export function partsOf(content) {
  if (isCustomExam(content)) return (content.parts || []).map((p, i) => ({ ...p, no: i + 1 }));
  const saved = new Map((content?.parts || []).map((p) => [p.no, p]));
  return TOEIC_PART_DEFAULTS.map((d) => ({
    no: d.no,
    name: saved.get(d.no)?.name || d.name,
    directions: saved.get(d.no)?.directions ?? d.directions,
    audio: null,
  }));
}

/** Tên phần theo số phần */
export function partName(content, no) {
  return partsOf(content).find((p) => p.no === no)?.name || `Part ${no}`;
}

/** Số câu học viên thấy (đề xáo trộn có thể khác số câu gốc) */
export const shownNo = (q) => q.displayNo ?? q.no;
