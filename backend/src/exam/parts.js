// Các "phần" (Part) của đề: tên + lời dặn hiện trước câu đầu tiên của phần.
//
// - Đề TOEIC: luôn có 7 Part cố định; tên và lời dặn mặc định ở dưới, admin sửa được.
// - Đề tự thiết kế: admin tự tạo các phần (tên, lời dặn, audio cho cả phần).
// Trong cả hai loại, câu hỏi ghi số phần ở trường `part` (1, 2, 3...).

const TOEIC_PART_DEFAULTS = [
  { no: 1, name: 'Part 1 – Mô tả tranh', directions: 'Nghe bốn câu mô tả về bức tranh và chọn câu mô tả đúng nhất. Các câu mô tả chỉ có trong audio, không in ra.' },
  { no: 2, name: 'Part 2 – Hỏi đáp', directions: 'Nghe một câu hỏi hoặc câu nói và ba câu trả lời, chọn câu trả lời phù hợp nhất. Nội dung chỉ có trong audio.' },
  { no: 3, name: 'Part 3 – Hội thoại', directions: 'Nghe các đoạn hội thoại ngắn và trả lời các câu hỏi về mỗi đoạn.' },
  { no: 4, name: 'Part 4 – Bài nói', directions: 'Nghe các bài nói ngắn của một người và trả lời các câu hỏi về mỗi bài.' },
  { no: 5, name: 'Part 5 – Hoàn thành câu', directions: 'Chọn từ hoặc cụm từ phù hợp nhất để hoàn thành câu.' },
  { no: 6, name: 'Part 6 – Hoàn thành đoạn văn', directions: 'Đọc đoạn văn và chọn từ, cụm từ hoặc câu phù hợp nhất cho mỗi chỗ trống.' },
  { no: 7, name: 'Part 7 – Đọc hiểu', directions: 'Đọc các đoạn văn (đoạn đơn, đoạn đôi, đoạn ba) và chọn câu trả lời đúng nhất cho mỗi câu hỏi.' },
];

const isCustom = (content) => content?.examType === 'CUSTOM';

/**
 * Danh sách phần của đề, luôn đủ thông tin: [{ no, name, directions, audio }]
 * Đề TOEIC cũ (chưa có `parts`) -> dùng tên / lời dặn mặc định.
 */
function partsOf(content) {
  if (isCustom(content)) return (content.parts || []).map((p, i) => ({ ...p, no: i + 1 }));
  const saved = new Map((content?.parts || []).map((p) => [p.no, p]));
  return TOEIC_PART_DEFAULTS.map((d) => ({
    no: d.no,
    name: saved.get(d.no)?.name || d.name,
    directions: saved.get(d.no)?.directions ?? d.directions,
    audio: null, // audio TOEIC nằm ở content.audio
  }));
}

module.exports = { TOEIC_PART_DEFAULTS, partsOf, isCustom };
