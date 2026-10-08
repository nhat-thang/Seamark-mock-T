// Kiểm tra nội dung đề trước khi xuất bản.
// errors: chặn xuất bản. warnings: chỉ nhắc (ví dụ đề chưa có Listening vẫn cho xuất bản).
const { allowedChoices } = require('./content');
const { listFileRefs } = require('./files');

// Cấu trúc chuẩn TOEIC Listening + Reading
const STANDARD_PARTS = [
  { part: 1, from: 1, to: 6 },
  { part: 2, from: 7, to: 31 },
  { part: 3, from: 32, to: 70 },
  { part: 4, from: 71, to: 100 },
  { part: 5, from: 101, to: 130 },
  { part: 6, from: 131, to: 146 },
  { part: 7, from: 147, to: 200 },
];

function standardPart(no) {
  return STANDARD_PARTS.find((p) => no >= p.from && no <= p.to)?.part ?? null;
}

/** [1,2,3,5,7,8] -> "1–3, 5, 7–8" */
function formatRanges(nums) {
  const out = [];
  let start = null;
  let prev = null;
  for (const n of nums) {
    if (start === null) {
      start = n;
    } else if (n !== prev + 1) {
      out.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = n;
    }
    prev = n;
  }
  if (start !== null) out.push(start === prev ? `${start}` : `${start}–${prev}`);
  return out.join(', ');
}

/**
 * @param {object} content nội dung đề (draft_json)
 * @param {object} [options]
 * @param {Set<string>|null} [options.uploadedFiles] tên các file đã tải lên cho đề này (null = bỏ qua kiểm tra file)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateContent(content, { uploadedFiles = null } = {}) {
  if (content?.examType === 'CUSTOM') return validateCustom(content, { uploadedFiles });
  const errors = [];
  const warnings = [];
  const questions = Array.isArray(content?.questions) ? content.questions : [];
  const groups = Array.isArray(content?.groups) ? content.groups : [];
  const groupByCode = new Map(groups.map((g) => [g.code, g]));

  if (questions.length === 0) {
    errors.push('Đề chưa có câu hỏi nào.');
    return { errors, warnings };
  }

  const seen = new Set();
  const referencedFiles = []; // [tên file, nơi dùng]

  for (const q of questions) {
    const label = `Câu ${q.no}`;
    if (!Number.isInteger(q.no) || q.no < 1 || q.no > 200) {
      errors.push(`Có câu mang số "${q.no}" không hợp lệ (số câu phải từ 1 đến 200).`);
      continue;
    }
    if (seen.has(q.no)) {
      errors.push(`${label} bị trùng (xuất hiện nhiều lần).`);
      continue;
    }
    seen.add(q.no);

    const expected = standardPart(q.no);
    if (q.part !== expected) {
      errors.push(`${label} phải thuộc Part ${expected} (đang ghi Part ${q.part}).`);
    }

    const choices = allowedChoices(q);
    if (!q.answer) errors.push(`${label} chưa có đáp án.`);
    else if (!choices.includes(q.answer)) {
      errors.push(`${label}: đáp án "${q.answer}" không hợp lệ (chỉ được ${choices.join(', ')}).`);
    }

    // Part 3–7: các lựa chọn phải có chữ
    if (q.part >= 3) {
      const missing = choices.filter((c) => !String(q.options?.[c] ?? '').trim());
      if (missing.length) errors.push(`${label} thiếu nội dung lựa chọn ${missing.join(', ')}.`);
    }
    if ((q.part === 5 || q.part === 7) && !String(q.question ?? '').trim()) {
      errors.push(`${label} chưa có nội dung câu hỏi.`);
    }
    if ((q.part === 3 || q.part === 4) && !String(q.question ?? '').trim()) {
      warnings.push(`${label} chưa có nội dung câu hỏi.`);
    }
    if (q.part === 1 && !q.image) errors.push(`${label} (Part 1) chưa có ảnh.`);
    if (q.image) referencedFiles.push([q.image, label]);

    // Nhóm câu
    if (q.groupCode) {
      const g = groupByCode.get(q.groupCode);
      if (!g) errors.push(`${label} thuộc nhóm "${q.groupCode}" nhưng nhóm này không tồn tại.`);
      else if (q.no < g.from || q.no > g.to) {
        warnings.push(`${label} thuộc nhóm ${g.code} nhưng nằm ngoài khoảng câu ${g.from}–${g.to} của nhóm.`);
      }
    } else if (q.part === 6 || q.part === 7) {
      errors.push(`${label} (Part ${q.part}) chưa gắn với nhóm câu / đoạn văn nào.`);
    }
  }

  for (const g of groups) {
    const hasPassage = String(g.passage ?? '').trim() || (g.passageImages || []).length > 0;
    if ((g.part === 6 || g.part === 7) && !hasPassage) {
      errors.push(`Nhóm ${g.code} chưa có đoạn văn (chữ hoặc ảnh).`);
    }
    for (const img of g.passageImages || []) referencedFiles.push([img, `nhóm ${g.code}`]);
    if (g.image) referencedFiles.push([g.image, `nhóm ${g.code}`]);
  }

  // Câu còn thiếu so với đề chuẩn 200 câu
  const missingListening = [];
  const missingReading = [];
  for (let no = 1; no <= 200; no++) {
    if (!seen.has(no)) (no <= 100 ? missingListening : missingReading).push(no);
  }
  if (missingListening.length === 100) warnings.push('Đề chưa có phần Listening (câu 1–100).');
  else if (missingListening.length) warnings.push(`Listening còn thiếu câu: ${formatRanges(missingListening)}.`);
  if (missingReading.length === 100) warnings.push('Đề chưa có phần Reading (câu 101–200).');
  else if (missingReading.length) warnings.push(`Reading còn thiếu câu: ${formatRanges(missingReading)}.`);

  // Audio
  const hasListening = missingListening.length < 100;
  const audio = content.audio || {};
  const partAudios = Object.values(audio.parts || {}).filter(Boolean);
  if (hasListening && !audio.full && partAudios.length === 0) {
    errors.push('Đề có câu Listening nhưng chưa có file audio (ghi tên file ở trang «Thông tin đề» hoặc gán trong mục "Ảnh & audio").');
  }
  if (audio.full) referencedFiles.push([audio.full, 'audio cả bài']);
  for (const [part, name] of Object.entries(audio.parts || {})) if (name) referencedFiles.push([name, `audio Part ${part}`]);

  // File được nhắc tới phải đã tải lên (so tên không phân biệt hoa/thường)
  if (uploadedFiles) {
    const uploaded = new Set([...uploadedFiles].map((n) => n.toLowerCase()));
    for (const [name, where] of referencedFiles) {
      if (!uploaded.has(String(name).toLowerCase())) errors.push(`Chưa tải lên file "${name}" (dùng ở ${where}).`);
    }
  }

  return { errors, warnings };
}

/** Kiểm tra file được nhắc tới đã tải lên chưa (so tên không phân biệt hoa/thường) */
function checkFiles(content, uploadedFiles, errors) {
  if (!uploadedFiles) return;
  const uploaded = new Set([...uploadedFiles].map((n) => n.toLowerCase()));
  for (const ref of listFileRefs(content)) {
    if (!uploaded.has(String(ref.name).toLowerCase())) errors.push(`Chưa tải lên file "${ref.name}" (dùng ở ${ref.where}).`);
  }
}

/** Kiểm tra đề tự thiết kế */
function validateCustom(content, { uploadedFiles = null } = {}) {
  const errors = [];
  const warnings = [];
  const questions = content.questions || [];
  const parts = content.parts || [];
  const groups = content.groups || [];

  if (questions.length === 0) {
    errors.push('Đề chưa có câu hỏi nào.');
    return { errors, warnings };
  }

  parts.forEach((p, i) => {
    const n = questions.filter((q) => q.part === i + 1).length;
    if (n === 0) warnings.push(`Part "${p.name}" chưa có question nào (học viên sẽ không thấy part này).`);
  });

  for (const q of questions) {
    const label = `Question ${q.no}`;
    const letters = Object.keys(q.options || {});
    if (letters.length < 2) errors.push(`${label} cần ít nhất 2 lựa chọn.`);
    const empty = letters.filter((l) => !String(q.options[l] ?? '').trim());
    if (empty.length) errors.push(`${label} chưa có nội dung lựa chọn ${empty.join(', ')}.`);
    if (!q.answer) errors.push(`${label} chưa có đáp án.`);
    else if (!letters.includes(q.answer)) errors.push(`${label}: đáp án "${q.answer}" không có trong các lựa chọn.`);
    // Câu phải có gì đó để hỏi: chữ, ảnh, audio, hoặc thuộc nhóm đọc hiểu
    if (!String(q.question ?? '').trim() && !q.image && !q.audio && !q.groupCode) {
      errors.push(`${label} chưa có nội dung (gõ question, hoặc thêm ảnh / audio).`);
    }
  }

  for (const g of groups) {
    const n = questions.filter((q) => q.groupCode === g.code).length;
    const hasContent = String(g.passage ?? '').trim() || (g.passageImages || []).length || g.image || g.audio;
    if (n === 0) warnings.push(`Nhóm ${g.code} chưa có question nào.`);
    if (!hasContent) errors.push(`Nhóm ${g.code} chưa có đoạn văn (chữ, ảnh hoặc audio).`);
  }

  checkFiles(content, uploadedFiles, errors);
  return { errors, warnings };
}

module.exports = { validateContent, standardPart, formatRanges, STANDARD_PARTS };
