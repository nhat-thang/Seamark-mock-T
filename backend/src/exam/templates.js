// Khung mẫu đề tự thiết kế: chỉ giữ CẤU TRÚC, bỏ nội dung.
const crypto = require('crypto');
const { normalizeContent } = require('./contentSchema');

/** Lấy cấu trúc từ nội dung đề: tên / lời dặn Part, số question, số lựa chọn, nhóm đọc hiểu */
function toStructure(content) {
  return {
    examType: 'CUSTOM',
    shuffleQuestions: !!content.shuffleQuestions,
    parts: content.parts.map((p) => ({ name: p.name, directions: p.directions || '', audio: null })),
    groups: content.groups.map((g) => ({ code: g.code, part: g.part, kind: 'reading', passage: '', passageImages: [], image: null, audio: null })),
    questions: content.questions.map((q) => ({
      part: q.part,
      groupCode: q.groupCode || null,
      // giữ số lựa chọn (A–B hay A–F), bỏ nội dung
      options: Object.fromEntries(Object.keys(q.options || { A: '', B: '', C: '', D: '' }).map((l) => [l, ''])),
    })),
  };
}

/** Tạo nội dung đề mới (trống) từ cấu trúc khung — mỗi question có id mới */
function fromStructure(structure) {
  return normalizeContent({
    ...structure,
    examType: 'CUSTOM',
    questions: (structure.questions || []).map((q) => ({
      ...q,
      id: crypto.randomBytes(6).toString('hex'),
      question: '',
      answer: null,
      image: null,
      audio: null,
      explanation: '',
    })),
  });
}

function summary(structure) {
  return { partCount: (structure.parts || []).length, questionCount: (structure.questions || []).length };
}

module.exports = { toStructure, fromStructure, summary };
