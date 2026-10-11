// Các thao tác soạn đề tự thiết kế. Mọi hàm đều trả về nội dung MỚI (không sửa nội dung cũ).
//
// Cấu trúc: content.parts (các phần), content.groups (khối chữ / ảnh / audio — trước đây gọi là "nhóm đọc hiểu"),
// content.questions (câu hỏi).
// Thứ tự câu = thứ tự trong mảng questions; số câu (no) luôn được đánh lại 1, 2, 3... theo thứ tự đó.
// Mỗi câu có `id` cố định (để chọn câu khi số câu thay đổi); mỗi khối có mã (N1, N2...).
// Câu thuộc một khối (groupCode) luôn đứng liền nhau ngay sau khối đó; học viên thấy nội dung khối bên cạnh các câu này.

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_POINTS = 100;

export const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Trắc nghiệm' },
  { id: 'short_answer', label: 'Trả lời ngắn' },
  { id: 'paragraph', label: 'Đoạn / Trả lời dài' },
];
const TYPE_IDS = QUESTION_TYPES.map((t) => t.id);

/** Câu trắc nghiệm? (đề cũ ghi type 'mcq') */
export const isChoice = (q) => !q.type || q.type === 'multiple_choice' || q.type === 'mcq';

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- Giá trị mặc định / chuyển đề cũ sang dạng mới ----------

const QUESTION_DEFAULTS = {
  groupCode: null,
  question: '',
  description: '',
  options: { A: '', B: '' },
  answer: null,
  acceptedAnswers: [],
  othersWrong: true,
  points: 1,
  required: false,
  shuffleOptions: false,
  image: null,
  imageAlign: 'left',
  audio: null,
  explanation: '',
};

/** Điền các trường mới cho một câu (đề cũ chỉ có trắc nghiệm, mỗi câu 1 điểm) */
export function upgradeQuestion(q) {
  return {
    ...QUESTION_DEFAULTS,
    ...q,
    type: TYPE_IDS.includes(q.type) ? q.type : 'multiple_choice',
    optionImages: { ...(q.optionImages || {}) },
    acceptedAnswers: [...(q.acceptedAnswers || [])],
    points: Number.isFinite(q.points) ? q.points : 1,
  };
}

export function upgradeGroup(g) {
  return { kind: 'reading', blockType: 'text', title: '', passage: '', passageImages: [], image: null, audio: null, afterId: null, ...g };
}

/**
 * Đề tự thiết kế cũ (soạn trước khi có giao diện dạng thẻ) -> dạng mới. Không mất dữ liệu:
 * nhóm đọc hiểu thành khối chữ / ảnh / audio, câu cũ thành câu trắc nghiệm 1 điểm.
 * Gọi nhiều lần không sao (đề đã ở dạng mới thì giữ nguyên giá trị).
 */
export function upgradeContent(content) {
  if (content.examType !== 'CUSTOM') return content;
  return {
    ...content,
    description: content.description || '',
    groups: content.groups.map(upgradeGroup),
    questions: content.questions.map(upgradeQuestion),
  };
}

export function newQuestion(partNo, groupCode = null) {
  return upgradeQuestion({
    id: randomId(),
    no: 0,
    part: partNo,
    type: 'multiple_choice',
    groupCode,
    options: { A: '', B: '', C: '', D: '' },
  });
}

export const MAX_ADD_AT_ONCE = 50;
const clampCount = (n) => Math.min(Math.max(Number.parseInt(n, 10) || 1, 1), MAX_ADD_AT_ONCE);

/** Mã khối mới chưa dùng: N1, N2... */
function nextGroupCode(content) {
  let n = content.groups.length + 1;
  while (content.groups.some((g) => g.code === `N${n}`)) n++;
  return `N${n}`;
}

export const totalPoints = (content) => content.questions.reduce((s, q) => s + (Number.isFinite(q.points) ? q.points : 1), 0);

// ---------- Danh sách thẻ (giao diện soạn đề) ----------
//
// Trang soạn đề hiển thị một danh sách thẳng các "thẻ":
//   { kind: 'part', part, no } | { kind: 'group', group } | { kind: 'question', question }
// toItems: nội dung -> danh sách thẻ.  fromItems: danh sách thẻ -> nội dung (đánh lại part, số câu, khối).
// Các thao tác thêm / kéo thả / xóa chỉ cần sửa danh sách thẻ rồi gọi fromItems.

// afterId của khối đứng ngay đầu part (trước mọi câu)
const START = '_start';

export const itemKey = (it) => (it.kind === 'part' ? `p:${it.no}` : it.kind === 'group' ? `g:${it.group.code}` : `q:${it.question.id}`);

export function toItems(content) {
  const items = [];
  const groupByCode = new Map(content.groups.map((g) => [g.code, g]));
  const valid = (code) => (code && groupByCode.has(code) ? code : null);
  const withQuestions = new Set(content.questions.map((q) => valid(q.groupCode)).filter(Boolean));

  content.parts.forEach((part, i) => {
    const no = i + 1;
    items.push({ kind: 'part', part, no });
    const qs = content.questions.filter((q) => q.part === no);
    // Khối chưa có câu nào: đặt theo afterId = id câu đứng ngay trước nó (START = đầu part; không có = cuối part, như bản cũ)
    const empties = content.groups.filter((g) => g.part === no && !withQuestions.has(g.code));
    const placed = new Set();
    const pushEmpties = (afterId) => {
      for (const g of empties) {
        if (!placed.has(g.code) && g.afterId === afterId) {
          placed.add(g.code);
          items.push({ kind: 'group', group: g });
        }
      }
    };

    pushEmpties(START);
    const shown = new Set();
    let waiting = []; // id các câu có khối trống đứng sau, chờ tới hết khối hiện tại (không chen vào giữa khối)
    qs.forEach((q, k) => {
      const code = valid(q.groupCode);
      if (code && !shown.has(code)) {
        shown.add(code);
        items.push({ kind: 'group', group: groupByCode.get(code) });
      }
      items.push({ kind: 'question', question: q });
      waiting.push(q.id);
      const next = qs[k + 1];
      if (!(code && next && valid(next.groupCode) === code)) {
        waiting.forEach(pushEmpties);
        waiting = [];
      }
    });
    // afterId không còn (câu đã bị xóa ở chỗ khác) -> cuối part
    for (const g of empties) if (!placed.has(g.code)) items.push({ kind: 'group', group: g });
  });
  return items;
}

/** Khối mà vị trí items[k] đang nằm trong (thẻ khối, hoặc câu thuộc khối); null nếu không */
function groupAt(items, k) {
  const it = items[k];
  if (!it) return null;
  if (it.kind === 'group') return it.group.code;
  if (it.kind === 'question') return it.question.groupCode || null;
  return null;
}

export function fromItems(content, items) {
  const parts = [];
  const groups = [];
  const questions = [];
  let partNo = 0;
  let open = null; // khối đang "mở": câu ngay sau khối (hoặc sau câu của khối) mới thuộc khối được
  let lastId = null;
  for (const it of items) {
    if (it.kind === 'part') {
      partNo++;
      parts.push({ ...it.part, no: partNo });
      open = null;
      lastId = null;
    } else if (it.kind === 'group') {
      open = it.group.code;
      groups.push({ ...it.group, part: partNo, afterId: lastId ?? START });
    } else {
      const q = it.question;
      const member = !!q.groupCode && q.groupCode === open;
      if (!member) open = null;
      questions.push({ ...q, part: partNo, groupCode: member ? q.groupCode : null, no: questions.length + 1 });
      lastId = q.id;
    }
  }
  return { ...content, parts, groups, questions };
}

const indexOfKey = (items, key) => items.findIndex((it) => itemKey(it) === key);

/** Vị trí thẻ cuối cùng của khối (thẻ khối + các câu của nó) bắt đầu từ k */
function endOfGroup(items, k) {
  const code = groupAt(items, k);
  if (!code) return k;
  let e = k;
  while (items[e + 1]?.kind === 'question' && items[e + 1].question.groupCode === code) e++;
  return e;
}

/**
 * Thêm n câu ngay sau thẻ afterKey (thẻ đang chọn). Sau thẻ khối hoặc câu của khối -> câu mới thuộc khối đó.
 * Trả về [nội dung mới, key câu mới đầu tiên]
 */
export function insertQuestions(content, afterKey, n = 1) {
  const items = toItems(content);
  let i = indexOfKey(items, afterKey);
  if (i < 0) i = items.length - 1;
  const qs = Array.from({ length: clampCount(n) }, () => newQuestion(0, groupAt(items, i)));
  items.splice(i + 1, 0, ...qs.map((q) => ({ kind: 'question', question: q })));
  return [fromItems(content, items), `q:${qs[0].id}`];
}

/**
 * Thêm khối (blockType: 'text' | 'image' | 'audio') ngay sau thẻ afterKey.
 * Chèn vào giữa một khối khác thì các câu phía sau (của khối cũ) chuyển sang khối mới.
 */
export function insertBlock(content, afterKey, blockType = 'text', patch = {}) {
  const items = toItems(content);
  let i = indexOfKey(items, afterKey);
  if (i < 0) i = items.length - 1;
  const group = upgradeGroup({ code: nextGroupCode(content), part: 0, blockType, ...patch });
  const old = groupAt(items, i);
  items.splice(i + 1, 0, { kind: 'group', group });
  for (let k = i + 2; items[k]?.kind === 'question' && old && items[k].question.groupCode === old; k++) {
    items[k] = { kind: 'question', question: { ...items[k].question, groupCode: group.code } };
  }
  return [fromItems(content, items), `g:${group.code}`];
}

/** Thêm part mới ngay sau thẻ afterKey: các thẻ phía sau (cùng part) chuyển sang part mới. Không cắt ngang khối. */
export function insertPart(content, afterKey) {
  const items = toItems(content);
  let i = indexOfKey(items, afterKey);
  if (i < 0) i = items.length - 1;
  i = endOfGroup(items, i);
  items.splice(i + 1, 0, { kind: 'part', part: { name: `Part ${content.parts.length + 1}`, directions: '', audio: null } });
  const no = items.slice(0, i + 2).filter((it) => it.kind === 'part').length;
  return [fromItems(content, items), `p:${no}`];
}

/** Nhân bản thẻ: câu (đặt ngay dưới, cùng khối) hoặc khối (không kèm câu, đặt sau các câu của khối gốc) */
export function duplicateItem(content, key) {
  const items = toItems(content);
  const i = indexOfKey(items, key);
  const it = items[i];
  if (!it || it.kind === 'part') return [content, key];
  if (it.kind === 'question') {
    const { review: _r, ...q } = it.question; // eslint-disable-line no-unused-vars
    const copy = { ...q, id: randomId(), optionImages: { ...q.optionImages }, acceptedAnswers: [...q.acceptedAnswers], options: { ...q.options } };
    items.splice(i + 1, 0, { kind: 'question', question: copy });
    return [fromItems(content, items), `q:${copy.id}`];
  }
  const copy = { ...it.group, code: nextGroupCode(content), passageImages: [...(it.group.passageImages || [])] };
  items.splice(endOfGroup(items, i) + 1, 0, { kind: 'group', group: copy });
  return [fromItems(content, items), `g:${copy.code}`];
}

/**
 * Xóa thẻ. Xóa khối: các câu của khối vẫn giữ (thành câu lẻ).
 * Xóa part: các thẻ của part gộp vào part trước (part đầu tiên thì gộp vào part sau). Đề phải còn ít nhất 1 part.
 */
export function deleteItem(content, key) {
  const items = toItems(content);
  const i = indexOfKey(items, key);
  if (i < 0) return content;
  if (items[i].kind === 'part') {
    if (content.parts.length <= 1) return content;
    if (i === 0) {
      // Part đầu: giữ tên part sau, đưa thẻ part sau lên đầu
      const next = items.findIndex((it, k) => k > 0 && it.kind === 'part');
      const [header] = items.splice(next, 1);
      items[0] = header;
    } else {
      items.splice(i, 1);
    }
  } else {
    items.splice(i, 1);
  }
  return fromItems(content, items);
}

/** Xóa nhiều câu một lúc (ids: Set hoặc mảng id) */
export function deleteQuestions(content, ids) {
  const set = new Set(ids);
  return fromItems(content, toItems(content).filter((it) => !(it.kind === 'question' && set.has(it.question.id))));
}

/** Thẻ kéo được: câu, hoặc khối (kéo cả các câu của khối). Part không kéo được (dùng menu ⋮ của part). */
export const isDraggable = (it) => it.kind !== 'part';

/**
 * Kéo thẻ key tới trước thẻ thứ `to` (theo danh sách thẻ hiện tại; to = số thẻ nghĩa là cuối đề).
 * Câu thả ngay sau khối / câu của khối -> thuộc khối đó. Khối không được thả vào giữa khối khác.
 */
export function moveItem(content, key, to) {
  const items = toItems(content);
  const i = indexOfKey(items, key);
  if (i < 0 || items[i].kind === 'part') return content;
  const len = items[i].kind === 'group' ? endOfGroup(items, i) - i + 1 : 1;
  if (to > i && to <= i + len) return content; // thả vào chính nó
  const moving = items.splice(i, len);
  let t = to > i ? to - len : to;
  t = Math.max(1, Math.min(t, items.length)); // không đứng trước part đầu tiên
  if (moving[0].kind === 'group') {
    // Không chen vào giữa một khối khác: dời xuống sau khối đó
    const g = groupAt(items, t - 1);
    while (g && items[t]?.kind === 'question' && items[t].question.groupCode === g) t++;
  } else {
    moving[0] = { kind: 'question', question: { ...moving[0].question, groupCode: groupAt(items, t - 1) } };
  }
  items.splice(t, 0, ...moving);
  return fromItems(content, items);
}

/** Chuyển thẻ lên (-1) / xuống (+1) một bậc (dùng cho bàn phím) */
export function nudgeItem(content, key, dir) {
  const items = toItems(content);
  const i = indexOfKey(items, key);
  if (i < 0 || items[i].kind === 'part') return content;
  if (dir < 0) {
    if (i <= 1) return content;
    // Lên: đứng trước thẻ phía trên (khối thì nhảy qua cả khối phía trên, không chen vào giữa)
    let t = i - 1;
    if (items[i].kind === 'group') while (t > 1 && items[t].kind === 'question' && items[t].question.groupCode) t--;
    return moveItem(content, key, t);
  }
  // Xuống: đứng sau thẻ phía dưới (moveItem tự nhảy qua khối khác nếu đang chuyển một khối)
  const end = items[i].kind === 'group' ? endOfGroup(items, i) : i;
  if (end >= items.length - 1) return content;
  return moveItem(content, key, end + 2);
}

/** Câu đang thuộc khối: tách ra (đưa xuống ngay dưới khối, thành câu lẻ) */
export function detachFromBlock(content, id) {
  const items = toItems(content);
  const i = indexOfKey(items, `q:${id}`);
  if (i < 0 || !items[i].question.groupCode) return content;
  const end = endOfGroup(items, i);
  const [it] = items.splice(i, 1);
  items.splice(end, 0, { kind: 'question', question: { ...it.question, groupCode: null } });
  return fromItems(content, items);
}

/** Câu lẻ đứng ngay dưới một khối (hoặc câu của khối): gắn vào khối đó */
export function blockAbove(content, id) {
  const items = toItems(content);
  const i = indexOfKey(items, `q:${id}`);
  return i > 0 && !items[i].question.groupCode ? groupAt(items, i - 1) : null;
}

export function updateQuestionById(content, id, patch) {
  return { ...content, questions: content.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
}

export function updateGroup(content, code, patch) {
  return { ...content, groups: content.groups.map((g) => (g.code === code ? { ...g, ...patch } : g)) };
}

// ---------- Phần ----------

export function addPart(content) {
  const parts = [...content.parts, { name: `Part ${content.parts.length + 1}`, directions: '', audio: null }];
  return [{ ...content, parts: parts.map((p, i) => ({ ...p, no: i + 1 })) }, parts.length];
}

export function updatePart(content, partNo, patch) {
  return { ...content, parts: content.parts.map((p, i) => (i + 1 === partNo ? { ...p, ...patch } : p)) };
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
// Lựa chọn đánh chữ A, B, C... theo thứ tự. Thêm / xóa ở giữa thì đánh lại chữ, đáp án và ảnh đi theo lựa chọn.

const optionList = (q) =>
  Object.keys(q.options).map((l) => ({ text: q.options[l], image: q.optionImages?.[l] || null, isAnswer: q.answer === l }));

function fromOptionList(list) {
  const options = {};
  const optionImages = {};
  let answer = null;
  list.forEach((o, i) => {
    const l = LETTERS[i];
    options[l] = o.text;
    if (o.image) optionImages[l] = o.image;
    if (o.isAnswer) answer = l;
  });
  return { options, optionImages, answer };
}

/** Thêm lựa chọn trống ngay sau `letter` (không có thì thêm cuối). Trả về [phần sửa của câu, chữ của lựa chọn mới] hoặc null nếu đủ 6 */
export function insertOptionAfter(q, letter = null) {
  const list = optionList(q);
  if (list.length >= MAX_OPTIONS) return null;
  const at = letter ? Object.keys(q.options).indexOf(letter) + 1 : list.length;
  list.splice(at, 0, { text: '', image: null, isAnswer: false });
  return [fromOptionList(list), LETTERS[at]];
}

/** Xóa một lựa chọn (giữ tối thiểu 2). Trả về phần sửa của câu hoặc null */
export function removeOptionAt(q, letter) {
  const list = optionList(q);
  if (list.length <= MIN_OPTIONS) return null;
  list.splice(Object.keys(q.options).indexOf(letter), 1);
  return fromOptionList(list);
}

/** Đánh lại số câu theo thứ tự phần, giữ nguyên thứ tự câu trong mỗi phần */
export function renumber(content) {
  const byPart = [];
  for (const q of content.questions) (byPart[q.part] ||= []).push(q);
  const questions = byPart.flat().filter(Boolean).map((q, i) => ({ ...q, no: i + 1 }));
  return { ...content, questions };
}

// ---------- Dán đề ----------
// (Phần này dùng cách ghép theo "khối" của bản cũ — giữ nguyên để tính năng dán đề không đổi.)

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

/**
 * Đưa các question đã tách từ đề dán vào (pasteParser.js) vào cuối một part.
 * @param {object} content
 * @param {number|'new'} target  số part, hoặc 'new' để tạo part mới
 * @param {object[]} items  mỗi phần tử: { question, options, answer, aiAnswer, explanation, group (số thứ tự nhóm | null), needsImage }
 * @param {string[]} passages  đoạn văn của các nhóm (theo số thứ tự nhóm)
 * @returns {[object, string|null, number]} [nội dung mới, id question đầu tiên, số part đã thêm vào]
 */
export function appendPasted(content, target, items, passages) {
  let next = content;
  let partNo = target;
  if (target === 'new') [next, partNo] = addPart(content);

  // Mỗi nhóm đọc hiểu được dùng -> một nhóm mới với mã chưa có (N1, N2...)
  const codes = new Map();
  const groups = [...next.groups];
  let n = groups.length + 1;
  for (const it of items) {
    if (it.group === null || codes.has(it.group)) continue;
    while (groups.some((g) => g.code === `N${n}`)) n++;
    const code = `N${n}`;
    codes.set(it.group, code);
    groups.push({ code, part: partNo, kind: 'reading', passage: passages[it.group] || '', passageImages: [], image: null, audio: null });
  }
  next = { ...next, groups };

  const questions = items.map((it) => {
    const review = {};
    if (it.aiAnswer && it.answer) review.aiAnswer = true;
    if (it.needsImage) review.needsImage = it.needsImage;
    return {
      ...newQuestion(partNo, it.group === null ? null : codes.get(it.group)),
      question: it.question,
      options: { ...it.options },
      answer: it.answer || null,
      explanation: it.explanation || '',
      ...(Object.keys(review).length ? { review } : {}),
    };
  });

  // Khối mới theo đúng thứ tự dán: câu lẻ, hoặc nhóm (gom các câu liền nhau của cùng nhóm)
  const units = unitsOfPart(next, partNo).filter((u) => !(u.kind === 'group' && [...codes.values()].includes(u.group.code)));
  for (const q of questions) {
    const last = units[units.length - 1];
    if (q.groupCode && last?.kind === 'group' && last.group.code === q.groupCode) last.questions.push(q);
    else if (q.groupCode) units.push({ kind: 'group', group: groups.find((g) => g.code === q.groupCode), questions: [q] });
    else units.push({ kind: 'question', question: q });
  }
  return [withPartUnits(next, partNo, units), questions[0]?.id || null, partNo];
}

/** Bỏ một đánh dấu "cần xem lại" ('aiAnswer' | 'needsImage') của question */
export function clearReview(q, key) {
  if (!q.review?.[key]) return q;
  const { [key]: _removed, ...rest } = q.review; // eslint-disable-line no-unused-vars
  const { review: _old, ...base } = q; // eslint-disable-line no-unused-vars
  return Object.keys(rest).length ? { ...base, review: rest } : base;
}

/** Số question còn đánh dấu cần xem lại */
export const reviewCounts = (content) => ({
  aiAnswer: content.questions.filter((q) => q.review?.aiAnswer && q.answer).length,
  needsImage: content.questions.filter((q) => q.review?.needsImage && !q.image).length,
});

/** Giáo viên xác nhận mọi đáp án AI gợi ý (sau khi đã xem lại) */
export function confirmAllAiAnswers(content) {
  return { ...content, questions: content.questions.map((q) => clearReview(q, 'aiAnswer')) };
}
