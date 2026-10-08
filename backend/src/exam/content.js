// Các hàm làm việc với nội dung đề (content_json).
const crypto = require('crypto');
const { withFileUrls } = require('./files');
const { partsOf, isCustom } = require('./parts');

const LISTENING_PARTS = [1, 2, 3, 4];

/** Câu thuộc phần Listening (chỉ có nghĩa với đề TOEIC) */
const isListening = (part) => LISTENING_PARTS.includes(part);

/**
 * Các lựa chọn hợp lệ của một câu = các chữ cái có trong options
 * (TOEIC: A–D, Part 2: A–C; đề tự thiết kế: 2–6 lựa chọn A–F).
 */
function allowedChoices(question) {
  const keys = Object.keys(question.options || {});
  if (keys.length) return keys;
  return question.part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
}

/**
 * Thứ tự câu ngẫu nhiên cho một lượt làm bài (đề tự thiết kế bật "xáo trộn câu hỏi").
 * Xáo trong TỪNG PHẦN; câu trong cùng nhóm đọc hiểu luôn đi liền nhau theo thứ tự gốc.
 * Trả về mảng số câu, hoặc null nếu đề không xáo trộn.
 */
function makeQuestionOrder(content) {
  if (!isCustom(content) || !content.shuffleQuestions) return null;
  const order = [];
  for (const part of partsOf(content)) {
    // "Khối": một câu lẻ, hoặc cả nhóm đọc hiểu
    const units = [];
    const unitOfGroup = new Map();
    for (const q of content.questions.filter((x) => x.part === part.no)) {
      if (q.groupCode) {
        if (!unitOfGroup.has(q.groupCode)) {
          unitOfGroup.set(q.groupCode, []);
          units.push(unitOfGroup.get(q.groupCode));
        }
        unitOfGroup.get(q.groupCode).push(q.no);
      } else {
        units.push([q.no]);
      }
    }
    // Xáo trộn Fisher–Yates (dùng số ngẫu nhiên an toàn)
    for (let i = units.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [units[i], units[j]] = [units[j], units[i]];
    }
    for (const u of units) order.push(...u);
  }
  return order;
}

/**
 * Sắp câu theo thứ tự học viên thấy và gắn số thứ tự hiển thị (displayNo).
 * Câu trả lời vẫn ghi theo số câu gốc (no).
 */
function orderedQuestions(content, order) {
  const qs = content.questions;
  let list = qs;
  if (Array.isArray(order) && order.length) {
    const byNo = new Map(qs.map((q) => [q.no, q]));
    list = order.map((n) => byNo.get(n)).filter(Boolean);
    // Câu nào lỡ không có trong order thì thêm vào cuối
    const seen = new Set(order);
    list.push(...qs.filter((q) => !seen.has(q.no)));
  }
  return list.map((q, i) => ({ ...q, displayNo: isCustom(content) ? i + 1 : q.no }));
}

/**
 * Nội dung đề gửi cho học viên KHI ĐANG LÀM BÀI.
 * BẢO MẬT: bỏ đáp án (answer) và giải thích (explanation) — không bao giờ gửi xuống trình duyệt lúc làm bài.
 */
function toStudentContent(content, order = null) {
  const c = withFileUrls(content); // tên file -> đường dẫn /api/files/...
  return {
    examType: c.examType || 'TOEIC_LR',
    audio: c.audio,
    parts: partsOf(c),
    groups: c.groups,
    questions: orderedQuestions(c, order).map(({ answer, explanation, ...rest }) => rest), // eslint-disable-line no-unused-vars
  };
}

/**
 * Lọc câu trả lời học viên gửi lên: chỉ giữ câu có trong đề và lựa chọn hợp lệ.
 * Trả về object { "101": "A", ... }
 */
function sanitizeAnswers(content, answers) {
  const clean = {};
  if (!answers || typeof answers !== 'object') return clean;
  for (const q of content.questions) {
    const value = answers[q.no] ?? answers[String(q.no)];
    if (typeof value === 'string' && allowedChoices(q).includes(value)) clean[q.no] = value;
  }
  return clean;
}

/** Lọc danh sách câu "cần kiểm tra lại": chỉ giữ số câu có trong đề, không trùng. */
function sanitizeFlagged(content, flagged) {
  if (!Array.isArray(flagged)) return [];
  const valid = new Set(content.questions.map((q) => q.no));
  return [...new Set(flagged.map(Number).filter((n) => valid.has(n)))].sort((a, b) => a - b);
}

module.exports = {
  LISTENING_PARTS, isListening, allowedChoices, toStudentContent, sanitizeAnswers, sanitizeFlagged,
  makeQuestionOrder, orderedQuestions,
};
