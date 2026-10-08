// Chuẩn hóa nội dung đề (draft_json) trước khi lưu.
// Mọi đường ghi nội dung (import Excel, nhập nhanh đáp án, sửa từng câu, soạn đề tự thiết kế) đều đi qua đây:
// chỉ giữ các trường đã biết, ép đúng kiểu, giới hạn độ dài.
//
// Hai loại đề:
//   TOEIC_LR : 200 câu chuẩn, 7 Part cố định, đáp án A–D (Part 2: A–C)
//   CUSTOM   : đề tự thiết kế — tự chia phần, mỗi câu 2–6 lựa chọn (A–F), câu có thể kèm ảnh / audio,
//              có nhóm đọc hiểu (1 đoạn văn + nhiều câu), có thể xáo trộn câu cho từng học viên.
const crypto = require('crypto');
const { TOEIC_PART_DEFAULTS } = require('./parts');

const KINDS = ['conversation', 'talk', 'text', 'single', 'double', 'triple', 'reading'];
const LETTERS = ['A', 'B', 'C', 'D'];
const CUSTOM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CUSTOM_MAX_QUESTIONS = 300;
const CUSTOM_MAX_PARTS = 20;

class ContentError extends Error {}

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

// Giữ nguyên xuống dòng (đoạn văn nhiều dòng), cắt nếu quá dài
const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, max);

/** Chỉ giữ TÊN file (bỏ đường dẫn nếu người dùng lỡ ghi), null nếu rỗng */
function fileName(v) {
  if (v === null || v === undefined) return null;
  const name = String(v).trim().split(/[\\/]/).pop().slice(0, 200).trim();
  return name || null;
}

/** Mã định danh ngắn, không đổi khi đánh lại số câu (dùng để chọn câu trong trang soạn đề) */
const newId = () => crypto.randomBytes(6).toString('hex');
const cleanId = (v) => (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(v) ? v : newId());

/** Loại nhóm mặc định suy ra từ mã nhóm / Part (đề TOEIC) */
function defaultKind(code, part) {
  if (/^P7-DB/i.test(code)) return 'triple';
  if (/^P7-DD/i.test(code)) return 'double';
  if (part === 7) return 'single';
  if (part === 6) return 'text';
  if (part === 4) return 'talk';
  if (part === 3) return 'conversation';
  return 'single';
}

const lettersForPart = (part) => (part === 2 ? LETTERS.slice(0, 3) : LETTERS);

// ---------------- Đề TOEIC ----------------

function normalizeToeicGroup(g) {
  const code = text(g?.code, 30).trim().toUpperCase();
  const part = toInt(g?.part);
  return {
    code,
    part,
    kind: KINDS.includes(g?.kind) ? g.kind : defaultKind(code, part),
    from: toInt(g?.from),
    to: toInt(g?.to),
    passage: text(g?.passage, 30000).trim(),
    passageImages: (Array.isArray(g?.passageImages) ? g.passageImages : []).map(fileName).filter(Boolean).slice(0, 10),
    image: fileName(g?.image),
  };
}

function normalizeToeicQuestion(q) {
  const part = toInt(q?.part);
  const options = {};
  for (const l of lettersForPart(part)) options[l] = text(q?.options?.[l], 1000).trim();
  const answer = typeof q?.answer === 'string' ? q.answer.trim().toUpperCase() : null;
  const groupCode = q?.groupCode ? text(q.groupCode, 30).trim().toUpperCase() : '';
  return {
    no: toInt(q?.no),
    part,
    type: 'mcq', // hiện chỉ có trắc nghiệm; sau này thêm 'essay', 'speaking'...
    groupCode: groupCode || null,
    question: text(q?.question, 3000).trim(),
    options,
    answer: LETTERS.includes(answer) ? answer : null,
    image: fileName(q?.image),
    explanation: text(q?.explanation, 5000).trim(),
  };
}

/** Tên + lời dặn 7 Part (chỉ lưu khi khác mặc định cũng được, ở đây lưu đủ cho dễ sửa) */
function normalizeToeicParts(raw) {
  const saved = new Map((Array.isArray(raw) ? raw : []).map((p) => [toInt(p?.no), p]));
  return TOEIC_PART_DEFAULTS.map((d) => ({
    no: d.no,
    name: text(saved.get(d.no)?.name, 100).trim() || d.name,
    directions: saved.get(d.no)?.directions !== undefined ? text(saved.get(d.no).directions, 2000).trim() : d.directions,
  }));
}

function normalizeToeic(raw) {
  if (raw.questions.length > 200) throw new ContentError('Đề có quá 200 câu.');
  if (raw.groups.length > 100) throw new ContentError('Đề có quá nhiều nhóm câu.');

  const questions = raw.questions.map(normalizeToeicQuestion);
  if (questions.some((q) => q.no === null || q.part === null)) {
    throw new ContentError('Có câu thiếu số câu hoặc Part.');
  }
  questions.sort((a, b) => a.no - b.no);

  const parts = {};
  for (const n of [1, 2, 3, 4]) parts[n] = fileName(raw.audio?.parts?.[n]);

  return {
    examType: 'TOEIC_LR',
    audio: { full: fileName(raw.audio?.full), parts },
    parts: normalizeToeicParts(raw.parts),
    groups: raw.groups.map(normalizeToeicGroup).filter((g) => g.code),
    questions,
  };
}

// ---------------- Đề tự thiết kế ----------------

function normalizeCustom(raw) {
  const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
  if (rawParts.length === 0) throw new ContentError('Đề phải có ít nhất một phần.');
  if (rawParts.length > CUSTOM_MAX_PARTS) throw new ContentError(`Đề có tối đa ${CUSTOM_MAX_PARTS} phần.`);
  if (raw.questions.length > CUSTOM_MAX_QUESTIONS) throw new ContentError(`Đề có tối đa ${CUSTOM_MAX_QUESTIONS} câu.`);
  if (raw.groups.length > 150) throw new ContentError('Đề có quá nhiều nhóm đọc hiểu.');

  const parts = rawParts.map((p, i) => ({
    no: i + 1,
    name: text(p?.name, 100).trim() || `Part ${i + 1}`,
    directions: text(p?.directions, 2000).trim(),
    audio: fileName(p?.audio),
  }));
  const partCount = parts.length;
  const clampPart = (v) => Math.min(Math.max(toInt(v) || 1, 1), partCount);

  const groups = raw.groups
    .map((g) => ({
      code: text(g?.code, 30).trim().toUpperCase(),
      part: clampPart(g?.part),
      kind: 'reading',
      passage: text(g?.passage, 30000).trim(),
      passageImages: (Array.isArray(g?.passageImages) ? g.passageImages : []).map(fileName).filter(Boolean).slice(0, 10),
      image: fileName(g?.image),
      audio: fileName(g?.audio),
    }))
    .filter((g) => g.code);
  const groupCodes = new Set(groups.map((g) => g.code));

  // Thứ tự câu = thứ tự trong mảng (trang soạn đề quyết định); số câu đánh lại 1, 2, 3...
  const questions = raw.questions.map((q, i) => {
    const keys = CUSTOM_LETTERS.filter((l) => q?.options && Object.prototype.hasOwnProperty.call(q.options, l));
    const letters = CUSTOM_LETTERS.slice(0, Math.min(Math.max(keys.length, 2), 6));
    const options = {};
    for (const l of letters) options[l] = text(q?.options?.[l], 1000).trim();
    const answer = typeof q?.answer === 'string' ? q.answer.trim().toUpperCase() : null;
    const groupCode = q?.groupCode ? text(q.groupCode, 30).trim().toUpperCase() : null;
    return {
      id: cleanId(q?.id),
      no: i + 1,
      part: clampPart(q?.part),
      type: 'mcq',
      groupCode: groupCode && groupCodes.has(groupCode) ? groupCode : null,
      question: text(q?.question, 3000).trim(),
      options,
      answer: letters.includes(answer) ? answer : null,
      image: fileName(q?.image),
      audio: fileName(q?.audio),
      explanation: text(q?.explanation, 5000).trim(),
    };
  });
  // Câu trong nhóm phải cùng phần với nhóm
  const groupPart = new Map(groups.map((g) => [g.code, g.part]));
  for (const q of questions) if (q.groupCode) q.part = groupPart.get(q.groupCode);

  return {
    examType: 'CUSTOM',
    shuffleQuestions: raw.shuffleQuestions === true,
    parts,
    groups,
    questions,
  };
}

/**
 * @throws {ContentError} nếu dữ liệu sai cấu trúc cơ bản
 */
function normalizeContent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions) || !Array.isArray(raw.groups)) {
    throw new ContentError('Nội dung đề không hợp lệ.');
  }
  return raw.examType === 'CUSTOM' ? normalizeCustom(raw) : normalizeToeic(raw);
}

/** Câu trống theo cấu trúc chuẩn TOEIC (dùng khi nhập đáp án cho câu chưa có) */
function emptyQuestion(no, part, groupCode = null) {
  return normalizeToeicQuestion({ no, part, groupCode });
}

/** Nội dung ban đầu của đề mới */
function emptyContent(examType) {
  if (examType === 'CUSTOM') {
    return {
      examType: 'CUSTOM',
      shuffleQuestions: false,
      parts: [{ no: 1, name: 'Part 1', directions: '', audio: null }],
      groups: [],
      questions: [],
    };
  }
  return {
    examType: 'TOEIC_LR',
    audio: { full: null, parts: { 1: null, 2: null, 3: null, 4: null } },
    parts: normalizeToeicParts([]),
    groups: [],
    questions: [],
  };
}

module.exports = {
  normalizeContent, ContentError, KINDS, defaultKind, fileName, emptyQuestion, emptyContent, lettersForPart,
  CUSTOM_LETTERS,
};
