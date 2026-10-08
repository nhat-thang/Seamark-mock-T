// Các thao tác soạn đề tự thiết kế. Mọi hàm đều trả về nội dung MỚI (không sửa nội dung cũ).
//
// Cấu trúc: content.parts (các phần), content.groups (nhóm đọc hiểu), content.questions (câu hỏi).
// Thứ tự câu = thứ tự trong mảng questions; số câu (no) luôn được đánh lại 1, 2, 3... theo thứ tự đó.
// Mỗi câu có `id` cố định (để chọn câu khi số câu thay đổi); mỗi nhóm có mã (N1, N2...).

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Đánh lại số câu theo thứ tự phần, giữ nguyên thứ tự câu trong mỗi phần */
export function renumber(content) {
  const byPart = [];
  for (const q of content.questions) (byPart[q.part] ||= []).push(q);
  const questions = byPart.flat().filter(Boolean).map((q, i) => ({ ...q, no: i + 1 }));
  return { ...content, questions };
}

/**
 * Các "khối" của một phần theo đúng thứ tự: câu lẻ, hoặc nhóm đọc hiểu (kèm các câu của nhóm).
 * Nhóm chưa có câu nào được đặt ở cuối phần.
 */
export function unitsOfPart(content, partNo) {
  const units = [];
  const seenGroups = new Set();
  const groupByCode = new Map(content.groups.map((g) => [g.code, g]));
  for (const q of content.questions) {
    if (q.part !== partNo) continue;
    if (q.groupCode && groupByCode.has(q.groupCode)) {
      if (seenGroups.has(q.groupCode)) continue;
      seenGroups.add(q.groupCode);
      units.push({
        kind: 'group',
        group: groupByCode.get(q.groupCode),
        questions: content.questions.filter((x) => x.groupCode === q.groupCode),
      });
    } else {
      units.push({ kind: 'question', question: q });
    }
  }
  for (const g of content.groups) {
    if (g.part === partNo && !seenGroups.has(g.code)) units.push({ kind: 'group', group: g, questions: [] });
  }
  return units;
}

/** Ghép lại câu hỏi của một phần theo danh sách khối mới */
function withPartUnits(content, partNo, units) {
  const others = content.questions.filter((q) => q.part !== partNo);
  const mine = units.flatMap((u) => (u.kind === 'group' ? u.questions : [u.question]));
  // Giữ thứ tự phần: đặt câu của phần này đúng chỗ (renumber sắp theo phần)
  return renumber({ ...content, questions: [...others, ...mine] });
}

export function newQuestion(partNo, groupCode = null) {
  return {
    id: randomId(),
    no: 0,
    part: partNo,
    type: 'mcq',
    groupCode,
    question: '',
    options: { A: '', B: '', C: '', D: '' },
    answer: null,
    image: null,
    audio: null,
    explanation: '',
  };
}

export const MAX_ADD_AT_ONCE = 50;
const clampCount = (n) => Math.min(Math.max(Number.parseInt(n, 10) || 1, 1), MAX_ADD_AT_ONCE);

/** Thêm n question lẻ vào cuối part. Trả về [nội dung mới, id question mới đầu tiên] */
export function addQuestions(content, partNo, n = 1) {
  const qs = Array.from({ length: clampCount(n) }, () => newQuestion(partNo));
  const units = [...unitsOfPart(content, partNo), ...qs.map((q) => ({ kind: 'question', question: q }))];
  return [withPartUnits(content, partNo, units), qs[0].id];
}
export const addQuestion = (content, partNo) => addQuestions(content, partNo, 1);

/** Thêm n question vào cuối một nhóm đọc hiểu */
export function addQuestionsToGroup(content, code, n = 1) {
  const g = content.groups.find((x) => x.code === code);
  const qs = Array.from({ length: clampCount(n) }, () => newQuestion(g.part, code));
  const units = unitsOfPart(content, g.part).map((u) =>
    u.kind === 'group' && u.group.code === code ? { ...u, questions: [...u.questions, ...qs] } : u
  );
  return [withPartUnits(content, g.part, units), qs[0].id];
}
export const addQuestionToGroup = (content, code) => addQuestionsToGroup(content, code, 1);

/** Thêm nhóm đọc hiểu (kèm sẵn 1 câu) vào cuối phần. Trả về [nội dung mới, mã nhóm] */
export function addGroup(content, partNo) {
  let n = content.groups.length + 1;
  while (content.groups.some((g) => g.code === `N${n}`)) n++;
  const group = { code: `N${n}`, part: partNo, kind: 'reading', passage: '', passageImages: [], image: null, audio: null };
  const q = newQuestion(partNo, group.code);
  const next = { ...content, groups: [...content.groups, group] };
  const units = [...unitsOfPart(next, partNo).filter((u) => !(u.kind === 'group' && u.group.code === group.code)), { kind: 'group', group, questions: [q] }];
  return [withPartUnits(next, partNo, units), group.code];
}

/** Chuyển một khối (câu lẻ / nhóm) lên (-1) hoặc xuống (+1) trong phần */
export function moveUnit(content, partNo, unitKey, dir) {
  const units = unitsOfPart(content, partNo);
  const i = units.findIndex((u) => unitKeyOf(u) === unitKey);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= units.length) return content;
  [units[i], units[j]] = [units[j], units[i]];
  return withPartUnits(content, partNo, units);
}

/** Chuyển câu lên / xuống bên trong nhóm */
export function moveInGroup(content, code, id, dir) {
  const g = content.groups.find((x) => x.code === code);
  const units = unitsOfPart(content, g.part).map((u) => {
    if (!(u.kind === 'group' && u.group.code === code)) return u;
    const qs = [...u.questions];
    const i = qs.findIndex((q) => q.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= qs.length) return u;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    return { ...u, questions: qs };
  });
  return withPartUnits(content, g.part, units);
}

export const unitKeyOf = (u) => (u.kind === 'group' ? `g:${u.group.code}` : `q:${u.question.id}`);

export function updateQuestionById(content, id, patch) {
  return { ...content, questions: content.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
}

export function deleteQuestion(content, id) {
  return renumber({ ...content, questions: content.questions.filter((q) => q.id !== id) });
}

/** Xóa nhiều question một lúc (ids: Set hoặc mảng id) */
export function deleteQuestions(content, ids) {
  const set = new Set(ids);
  return renumber({ ...content, questions: content.questions.filter((q) => !set.has(q.id)) });
}

export function updateGroup(content, code, patch) {
  return { ...content, groups: content.groups.map((g) => (g.code === code ? { ...g, ...patch } : g)) };
}

/** Xóa nhóm cùng các câu của nhóm */
export function deleteGroup(content, code) {
  return renumber({
    ...content,
    groups: content.groups.filter((g) => g.code !== code),
    questions: content.questions.filter((q) => q.groupCode !== code),
  });
}

// ---------- Phần ----------

export function addPart(content) {
  const parts = [...content.parts, { name: `Part ${content.parts.length + 1}`, directions: '', audio: null }];
  return [{ ...content, parts: parts.map((p, i) => ({ ...p, no: i + 1 })) }, parts.length];
}

export function updatePart(content, partNo, patch) {
  return { ...content, parts: content.parts.map((p, i) => (i + 1 === partNo ? { ...p, ...patch } : p)) };
}

/** Xóa phần cùng mọi câu, nhóm của phần; các phần sau lùi số */
export function deletePart(content, partNo) {
  const shift = (n) => (n > partNo ? n - 1 : n);
  return renumber({
    ...content,
    parts: content.parts.filter((_, i) => i + 1 !== partNo).map((p, i) => ({ ...p, no: i + 1 })),
    groups: content.groups.filter((g) => g.part !== partNo).map((g) => ({ ...g, part: shift(g.part) })),
    questions: content.questions.filter((q) => q.part !== partNo).map((q) => ({ ...q, part: shift(q.part) })),
  });
}

/** Đổi chỗ phần với phần trước (-1) / sau (+1) */
export function movePart(content, partNo, dir) {
  const other = partNo + dir;
  if (other < 1 || other > content.parts.length) return content;
  const swap = (n) => (n === partNo ? other : n === other ? partNo : n);
  const parts = [...content.parts];
  [parts[partNo - 1], parts[other - 1]] = [parts[other - 1], parts[partNo - 1]];
  return renumber({
    ...content,
    parts: parts.map((p, i) => ({ ...p, no: i + 1 })),
    groups: content.groups.map((g) => ({ ...g, part: swap(g.part) })),
    questions: content.questions.map((q) => ({ ...q, part: swap(q.part) })),
  });
}

// ---------- Lựa chọn ----------

export function addOption(q) {
  const keys = Object.keys(q.options);
  if (keys.length >= MAX_OPTIONS) return q;
  return { ...q, options: { ...q.options, [LETTERS[keys.length]]: '' } };
}

/** Bớt lựa chọn cuối cùng (nếu đáp án đang là lựa chọn đó thì bỏ đáp án) */
export function removeOption(q) {
  const keys = Object.keys(q.options);
  if (keys.length <= MIN_OPTIONS) return q;
  const last = keys[keys.length - 1];
  const options = { ...q.options };
  delete options[last];
  return { ...q, options, answer: q.answer === last ? null : q.answer };
}

/** Một dòng tóm tắt câu hỏi cho dàn ý */
export function questionSummary(q) {
  const t = (q.question || '').replace(/\s+/g, ' ').trim();
  if (t) return t.length > 48 ? `${t.slice(0, 48)}…` : t;
  if (q.image) return '(có ảnh)';
  if (q.audio) return '(có audio)';
  return '(chưa có nội dung)';
}
