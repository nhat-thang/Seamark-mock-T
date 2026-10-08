// Chấm điểm — CHỈ chạy ở server.
const defaultScoreTable = require('../config/toeic-score-table.json');
const { isListening } = require('./content');
const { partsOf, isCustom } = require('./parts');

// Điểm quy đổi chỉ có ý nghĩa khi phần đó đủ 100 câu như đề thật
const FULL_SECTION = 100;

/**
 * Đổi số câu đúng sang điểm ước tính (5–495) theo bảng quy đổi.
 * Trả về null nếu phần đó không đủ 100 câu (đề ngắn chỉ hiện số câu đúng).
 */
function scaledScore(table, section, correct, total) {
  if (total !== FULL_SECTION) return null;
  const score = table[section]?.[correct];
  return Number.isFinite(score) ? score : null;
}

/** Điểm thang 10, làm tròn 1 chữ số thập phân (ví dụ 32/40 -> 8) */
const score10 = (correct, total) => (total > 0 ? Math.round((correct * 100) / total) / 10 : null);

/**
 * Chấm một bài làm.
 * @param {object} content nội dung đề (có đáp án)
 * @param {object} answers câu trả lời { "101": "A", ... }
 * @returns kết quả: số câu đúng (tổng, từng phần), điểm, và chi tiết từng câu
 */
function gradeAttempt(content, answers, table = defaultScoreTable) {
  const custom = isCustom(content);
  const result = {
    listeningCorrect: 0,
    listeningTotal: 0,
    readingCorrect: 0,
    readingTotal: 0,
    correct: 0,
    total: 0,
    details: [],
  };
  const byPart = new Map(partsOf(content).map((p) => [p.no, { no: p.no, name: p.name, correct: 0, total: 0 }]));

  for (const q of content.questions) {
    const chosen = answers?.[q.no] ?? null;
    const isCorrect = chosen !== null && chosen === q.answer;
    result.total++;
    if (isCorrect) result.correct++;
    const part = byPart.get(q.part);
    if (part) {
      part.total++;
      if (isCorrect) part.correct++;
    }
    if (!custom) {
      if (isListening(q.part)) {
        result.listeningTotal++;
        if (isCorrect) result.listeningCorrect++;
      } else {
        result.readingTotal++;
        if (isCorrect) result.readingCorrect++;
      }
    }
    result.details.push({ no: q.no, part: q.part, chosen, answer: q.answer, isCorrect });
  }

  result.parts = [...byPart.values()].filter((p) => p.total > 0);
  result.score10 = score10(result.correct, result.total);

  // Điểm quy đổi TOEIC chỉ cho đề TOEIC
  result.listeningScore = custom ? null : scaledScore(table, 'listening', result.listeningCorrect, result.listeningTotal);
  result.readingScore = custom ? null : scaledScore(table, 'reading', result.readingCorrect, result.readingTotal);
  // Tổng điểm chỉ có khi cả hai phần đều có điểm quy đổi
  result.totalScore =
    result.listeningScore !== null && result.readingScore !== null ? result.listeningScore + result.readingScore : null;
  return result;
}

module.exports = { gradeAttempt, scaledScore, score10, FULL_SECTION };
