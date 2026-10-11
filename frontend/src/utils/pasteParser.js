// Tách đề trắc nghiệm dán vào (copy từ trang web / Word / PDF) thành question + lựa chọn + đáp án.
// Không dùng AI: đọc theo mẫu thường gặp. AI (nếu có) chỉ kiểm tra lại kết quả (xem PasteImport.jsx).
//
// Nhận được các kiểu viết:
//   Số câu:      "1." "1)" "1:" "Câu 1:" "Question 1." "Q1"
//   Lựa chọn:    mỗi dòng một lựa chọn "A. ..." "(B) ..." "c) ..." — hoặc nhiều lựa chọn trên một dòng
//                "A. go  B. goes  C. going  D. gone" — hoặc ngay sau câu hỏi trên cùng dòng
//   Đáp án:      dòng "Đáp án: B" / "Answer: B"; lựa chọn đánh dấu "*B. ..." hoặc "B. ... *";
//                bảng đáp án ở cuối (sau dòng "Đáp án" / "Answer key") hoặc dòng "1A 2C 3B ..."
//   Giải thích:  dòng "Giải thích: ..." / "Explanation: ..."
//   Đoạn văn:    đoạn chữ dài nằm trước một nhóm question -> nhóm đọc hiểu. "Questions 5-8" thì nhóm dừng ở câu 8.
//   Ảnh:         ảnh không đi theo khi copy chữ. Khi dán, trang dán đề ghi dấu IMAGE_MARK vào chỗ có ảnh
//                (xem htmlToPasteText) -> question đó được đánh dấu "cần ảnh".

export const IMAGE_MARK = '[[ẢNH]]';
export const MAX_PASTE_QUESTIONS = 300;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------------- Chuyển nội dung HTML khi dán thành chữ (chạy trong trình duyệt) ----------------

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'FOOTER', 'FIGURE', 'DL', 'DT', 'DD']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
const IMAGE_TAGS = new Set(['IMG', 'SVG', 'PICTURE', 'CANVAS', 'OBJECT', 'EMBED', 'IMAGEDATA', 'V:IMAGEDATA', 'V:SHAPE']);

/**
 * Nội dung HTML trong bộ nhớ tạm (khi copy từ web / Word) -> chữ, có ghi dấu chỗ có ảnh.
 * Chỉ ĐỌC HTML để lấy chữ (DOMParser không chạy script, không hiển thị gì).
 * Danh sách đánh số (<ol>) được thêm lại số / chữ cái vì trình duyệt không copy số thứ tự dạng chữ.
 */
export function htmlToPasteText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const push = (s) => out.push(s);

  function walk(node) {
    if (node.nodeType === 3) {
      push(node.nodeValue.replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (IMAGE_TAGS.has(tag)) {
      push(`\n${IMAGE_MARK}\n`);
      return;
    }
    if (tag === 'BR') return push('\n');
    if (tag === 'TR') {
      // Hàng bảng -> "| ô 1 | ô 2" (đúng quy ước bảng của đoạn văn, xem PassageText.jsx)
      const cells = [...node.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      if (node.querySelector('img')) push(`\n${IMAGE_MARK}`);
      return push(`\n| ${cells.join(' | ')}\n`);
    }
    if (tag === 'LI' && node.parentElement?.tagName === 'OL') {
      const ol = node.parentElement;
      const index = [...ol.children].filter((c) => c.tagName === 'LI').indexOf(node) + (Number.parseInt(ol.getAttribute('start'), 10) || 1);
      const type = (ol.getAttribute('type') || '').trim();
      const label = type === 'A' ? LETTERS[index - 1] || index : type === 'a' ? (LETTERS[index - 1] || '').toLowerCase() || index : index;
      push(`\n${label}. `);
      node.childNodes.forEach(walk);
      return push('\n');
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) push('\n');
    node.childNodes.forEach(walk);
    if (block) push('\n');
  }

  walk(doc.body);
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML có chứa ảnh hoặc danh sách đánh số -> nên dùng bản chuyển từ HTML thay vì chữ thường */
export function htmlIsUseful(html) {
  return /<(img|svg|picture|canvas|v:imagedata|v:shape|ol)\b/i.test(html || '');
}

// ---------------- Nhận dạng từng dòng ----------------

// (?!...) : "Câu 5-8: ..." / "Questions 5 to 8" là lời dẫn của nhóm, không phải question 5
const NOT_RANGE = '(?!\\s*(?:-|–|—|~|to\\b|đến|den\\b)\\s*\\d)';
const Q_WORD = new RegExp(`^(?:câu|cau|question|q)\\s*\\.?\\s*(\\d{1,3})${NOT_RANGE}\\s*[:.)\\-–]?\\s*(.*)$`, 'i');
const Q_NUM = new RegExp(`^(\\d{1,3})${NOT_RANGE}\\s*[.):](?!\\d)\\s*(.*)$`);
// "Đáp án: B", "Answer - C. Vì...", hoặc "Đáp án B" (chữ cái đứng cuối dòng)
const ANSWER_LINE = /^(?:đáp án|dap an|đ\/a|answer|ans|key|correct answer|=>|→)\s*(?:[:\-–=]\s*\(?([A-Fa-f])\)?(?![A-Za-zÀ-ỹ])|\(?([A-Fa-f])\)?\s*[.)]?\s*$)/i;
// Dòng chỉ có các chữ cái lựa chọn, không có nội dung: "A B C D", "A. B. C." (nội dung nằm trong ảnh / audio)
const LETTERS_ONLY = /^\(?[Aa]\)?[.)]?(?:\s+\(?[B-Fb-f]\)?[.)]?)+$/;
const EXPLAIN_LINE = /^(?:giải thích|giai thich|lời giải|loi giai|explanation|explain)\s*[:.\-–]\s*(.*)$/i;
const KEY_HEADING = /^(?:bảng\s+)?(?:đáp án|dap an|answer key|answers|key|keys)\s*[:.]?\s*$/i;
const KEY_PAIR = /(\d{1,3})\s*[.):\-–]?\s*([A-Fa-f])(?![A-Za-zÀ-ỹ])/g;
// Dòng bảng đáp án: ít nhất 3 cặp "số + chữ" và không có chữ nào khác
const KEY_LINE = /^(?:\s*\d{1,3}\s*[.):\-–]?\s*[A-Fa-f][\s,;|]*){3,}$/;
// Từ cho thấy question cần nhìn ảnh / biểu đồ
const IMAGE_WORDS = /\b(pictures?|photos?|photographs?|images?|charts?|graphs?|diagrams?|maps?|figure \d+|look at the|shown (?:above|below))\b|(hình ảnh|bức ảnh|bức tranh|hình vẽ|biểu đồ|bản đồ|sơ đồ|nhìn hình|xem hình|xem ảnh)/i;
const MARK = /^[*✓✔]|[*✓✔]$|\((?:đúng|correct|true)\)$/i;

/**
 * Tìm các lựa chọn liền nhau A, B, C... (cùng kiểu chữ hoa / thường) trong một đoạn chữ.
 * @returns {{ before: string, options: {letter, text, marked}[] } | null}  null nếu không có ít nhất A + B
 *          (hoặc một lựa chọn ở đầu dòng khi atStart)
 */
function findOptions(s, atStart = false) {
  const re = /(^|[\s(])([*✓✔]?)\(?([A-Fa-f])([*]?)[.)]\s*/g;
  const hits = [];
  let m;
  while ((m = re.exec(s))) {
    hits.push({ index: m.index + m[1].length, end: m.index + m[0].length, letter: m[3], marked: !!(m[2] || m[4]) });
  }
  // Chọn dãy dài nhất bắt đầu bằng A (hoặc bằng lựa chọn ở đầu dòng khi atStart), chữ cái liên tiếp, cùng hoa / thường
  let best = null;
  for (let i = 0; i < hits.length; i++) {
    const first = hits[i];
    if (atStart ? first.index !== 0 : first.letter.toUpperCase() !== 'A') continue;
    const upper = first.letter === first.letter.toUpperCase();
    const seq = [first];
    for (let j = i + 1; j < hits.length; j++) {
      const want = LETTERS[LETTERS.indexOf(seq[seq.length - 1].letter.toUpperCase()) + 1];
      const h = hits[j];
      if (!want) break;
      if (h.letter.toUpperCase() === want && (h.letter === h.letter.toUpperCase()) === upper) seq.push(h);
    }
    if (!best || seq.length > best.length) best = seq;
    if (atStart) break;
  }
  if (!best || (!atStart && best.length < 2)) return null;
  const options = best.map((h, k) => {
    const raw = s.slice(h.end, k + 1 < best.length ? best[k + 1].index : s.length).trim();
    const marked = h.marked || MARK.test(raw);
    const text = raw.replace(/^[*✓✔]\s*/, '').replace(/\s*(?:[*✓✔]|\((?:đúng|correct|true)\))$/i, '').trim();
    return { letter: h.letter.toUpperCase(), text, marked };
  });
  return { before: s.slice(0, best[0].index).trim(), options };
}

/** "A B C D" -> 4 lựa chọn không có chữ */
function emptyOptions(s) {
  return (s.match(/[A-Fa-f]/g) || []).map((l) => ({ letter: l.toUpperCase(), text: '', marked: false }));
}

function parseKeyText(keyText) {
  const map = new Map();
  const t = String(keyText || '');
  let m;
  KEY_PAIR.lastIndex = 0;
  while ((m = KEY_PAIR.exec(t))) map.set(Number(m[1]), m[2].toUpperCase());
  if (map.size) return { pairs: map, sequence: null };
  // Chỉ có dãy chữ cái: "ACBD..." hoặc "A C B D"
  const letters = t.replace(/[\s,;.|]/g, '');
  if (letters && /^[A-Fa-f]+$/.test(letters)) return { pairs: null, sequence: letters.toUpperCase().split('') };
  return { pairs: null, sequence: null };
}

const isTableText = (s) => /^\s*\|/m.test(s || '');

// ---------------- Ngắt dòng bị mất ----------------
// Copy từ PDF / một số trang web hay mất xuống dòng, nhiều câu dính thành một dòng:
//   "D. Các quan điểm mỹ học Câu 2: Điểm chung ... A. ... B. ..."
// -> ngắt dòng trước "Câu N:" / "Question N." (viết hoa chữ đầu, để không nhầm "câu 3:" trong câu văn),
//    trước "Đáp án:" / "Giải thích:", và trước số câu trần "N." đúng bằng số câu kế tiếp khi phía trước đã có lựa chọn A–F.
const INLINE_BREAK = new RegExp(
  `\\s(?=(?:Câu|CÂU|Cau|CAU|Question|QUESTION)\\s*\\d{1,3}${NOT_RANGE}\\s*[:.)]|(?:Đáp án|ĐÁP ÁN|Dap an|Answer|ANSWER|Giải thích|GIẢI THÍCH|Lời giải|Explanation)\\s*[:\\-–])`,
  'g'
);
// Phía trước số câu trần đã có lựa chọn ("... D. gone 2. ...") hoặc là dòng đáp án ("Đáp án: B 2. ...")
const HAS_OPTION = /(?:^|\s)\(?[A-Fa-f][.)]\s|^(?:Đáp án|ĐÁP ÁN|Dap an|Answer|ANSWER)\s*[:\-–]/;

function splitRunOnLines(lines) {
  const out = [];
  let next = null; // số câu kế tiếp đang chờ
  for (const line of lines) {
    if (!line || KEY_LINE.test(line)) {
      out.push(line);
      continue;
    }
    let rest = line;
    for (;;) {
      const head = rest.match(Q_WORD) || rest.match(Q_NUM);
      if (head) next = Number(head[1]) + 1;
      const cuts = [];
      INLINE_BREAK.lastIndex = 0;
      let m;
      while ((m = INLINE_BREAK.exec(rest))) {
        if (m.index > 0) {
          cuts.push(m.index);
          break;
        }
      }
      if (next !== null) {
        const bare = new RegExp(`\\s${next}[.)]\\s+(?=\\S)`).exec(rest);
        if (bare && HAS_OPTION.test(rest.slice(0, bare.index))) cuts.push(bare.index);
      }
      if (!cuts.length) break;
      const at = Math.min(...cuts);
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    out.push(rest);
  }
  return out;
}

// ---------------- Tách đề ----------------

/**
 * @param {string} text        chữ đã dán
 * @param {object} [opts]
 * @param {string} [opts.answerKey]  bảng đáp án dán riêng (nếu có)
 * @returns {{
 *   questions: { srcNo, question, options: {A..}, answer, answerFrom: 'text'|'key'|null, explanation, group: number|null, imageMark, flags: {level, text}[] }[],
 *   groups: { passage, imageMark }[],
 *   ignored: string[],
 *   errors: string[],
 * }}
 */
export function parsePastedExam(text, { answerKey = '' } = {}) {
  const lines = splitRunOnLines(String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   \t]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim()));

  const questions = [];
  const groups = [];
  const ignored = [];
  let keyText = '';
  let inKey = false; // đang ở phần bảng đáp án cuối đề
  let cur = null; // question đang đọc
  let phase = 'stem'; // 'stem' (chưa có lựa chọn) | 'options' | 'after' (đã có đáp án / giải thích)
  let inExplain = false;
  let pending = []; // các dòng chữ chưa thuộc question nào (đoạn văn / tiêu đề)
  let pendingImage = false;
  let group = null; // { index, endNo }

  function finishQuestion() {
    if (cur) questions.push(cur);
    cur = null;
    inExplain = false;
  }

  /** Các dòng chữ đứng trước một question: đoạn văn dài -> nhóm đọc hiểu; dòng ngắn -> tiêu đề (bỏ qua) */
  function resolvePending(no) {
    const textLines = pending.filter((l) => l && l !== IMAGE_MARK);
    const hadImage = pending.includes(IMAGE_MARK);
    pending = [];
    if (textLines.length === 0) {
      if (group && group.endNo !== null && no > group.endNo) group = null;
      return hadImage;
    }
    const joined = textLines.join('\n');
    const range = joined.match(/(?:questions?|câu|cau)\s*(\d{1,3})\s*(?:-|–|—|to|đến|den|~)\s*(\d{1,3})/i);
    const isPassage = joined.length >= 150 || textLines.length >= 3;
    if (isPassage) {
      groups.push({ passage: joined, imageMark: hadImage });
      const endNo = range && Number(range[1]) <= no + 1 && Number(range[2]) >= no ? Number(range[2]) : null;
      group = { index: groups.length - 1, endNo };
      return false; // ảnh nằm trong đoạn văn -> đánh dấu ở nhóm, không ở question
    }
    // Dòng ngắn (tiêu đề, lời dặn "Choose the correct answer") -> kết thúc nhóm đọc hiểu đang mở
    ignored.push(...textLines);
    group = null;
    return hadImage;
  }

  function startQuestion(no, rest) {
    finishQuestion();
    const imageBefore = resolvePending(no);
    cur = {
      srcNo: no,
      question: '',
      options: [],
      answer: null,
      answerFrom: null,
      explanation: '',
      group: group && (group.endNo === null || no <= group.endNo) ? group.index : null,
      imageMark: imageBefore || pendingImage,
      flags: [],
    };
    pendingImage = false;
    phase = 'stem';
    const inline = findOptions(rest);
    if (LETTERS_ONLY.test(rest)) {
      addOptions(emptyOptions(rest));
    } else if (inline) {
      cur.question = inline.before;
      addOptions(inline.options);
    } else {
      cur.question = rest;
    }
  }

  function addOptions(opts) {
    for (const o of opts) {
      if (cur.options.some((x) => x.letter === o.letter)) cur.duplicateOptions = true;
      cur.options.push(o);
      if (o.marked && !cur.answer) {
        cur.answer = o.letter;
        cur.answerFrom = 'text';
      }
    }
    phase = 'options';
  }

  const lastNo = () => (cur ? cur.srcNo : questions.length ? questions[questions.length - 1].srcNo : null);

  /** Trong vài dòng tới (hoặc ngay trên dòng này) có lựa chọn A, B... không -> đúng là một question */
  function optionsFollow(i, rest) {
    if (findOptions(rest) || LETTERS_ONLY.test(rest)) return true;
    for (let k = i + 1; k < Math.min(lines.length, i + 8); k++) {
      const l = lines[k];
      if (!l) continue;
      if (findOptions(l, true) || LETTERS_ONLY.test(l)) return true;
      if (Q_NUM.test(l) || Q_WORD.test(l)) return false;
    }
    return false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inKey) {
      keyText += `${line}\n`;
      continue;
    }
    if (!line) {
      if (cur && phase === 'stem' && cur.question) cur.question += '\n';
      if (!cur || phase !== 'stem') pending.push('');
      continue;
    }
    if (line === IMAGE_MARK) {
      if (cur && phase === 'stem') cur.imageMark = true;
      else pending.push(IMAGE_MARK);
      continue;
    }
    if (KEY_HEADING.test(line) && questions.length + (cur ? 1 : 0) > 0) {
      finishQuestion();
      inKey = true;
      continue;
    }
    if (KEY_LINE.test(line)) {
      keyText += `${line}\n`;
      continue;
    }

    // Số câu
    const qw = line.match(Q_WORD);
    const qn = qw ? null : line.match(Q_NUM);
    if (qw || qn) {
      const no = Number((qw || qn)[1]);
      const prev = lastNo();
      // Số trần ("5.") là câu mới khi nối tiếp câu trước. Câu đầu tiên / đánh lại từ 1 thì phải có lựa chọn
      // ngay sau, tránh nhầm danh sách "1. 2." bên trong đoạn văn hay "2019. Sales rose..." là question.
      const ok = qw || (prev !== null && no === prev + 1) || ((prev === null || no === 1) && optionsFollow(i, (qw || qn)[2]));
      if (ok) {
        startQuestion(no, (qw || qn)[2]);
        continue;
      }
    }

    if (cur) {
      // Đáp án / giải thích
      const ans = line.match(ANSWER_LINE);
      if (ans && phase !== 'stem') {
        const letter = (ans[1] || ans[2]).toUpperCase();
        cur.answer = letter;
        cur.answerFrom = 'text';
        phase = 'after';
        inExplain = false;
        continue;
      }
      const ex = line.match(EXPLAIN_LINE);
      if (ex) {
        cur.explanation = ex[1];
        inExplain = true;
        phase = phase === 'stem' ? 'stem' : 'after';
        continue;
      }
      // Lựa chọn
      if (phase !== 'after' && LETTERS_ONLY.test(line)) {
        addOptions(emptyOptions(line));
        continue;
      }
      const opt = phase !== 'after' ? findOptions(line, true) : null;
      if (opt) {
        // "A." mới khi đã đủ lựa chọn -> có thể là question không đánh số dính vào
        if (phase === 'options' && opt.options[0].letter === 'A' && cur.options.length) cur.mergedSuspect = true;
        addOptions(opt.options);
        continue;
      }
      if (inExplain) {
        cur.explanation += `\n${line}`;
        continue;
      }
      if (phase === 'stem') {
        cur.question += (cur.question && !cur.question.endsWith('\n') ? '\n' : '') + line;
        continue;
      }
      // Dòng ngắn viết thường ngay sau lựa chọn cuối -> phần còn lại của lựa chọn đó (bị xuống dòng)
      if (phase === 'options' && pending.length === 0 && line.length < 80 && /^[a-zà-ỹ]/.test(line)) {
        const last = cur.options[cur.options.length - 1];
        last.text = `${last.text} ${line}`.trim();
        continue;
      }
    }
    pending.push(line);
  }
  finishQuestion();
  const tail = pending.filter((l) => l && l !== IMAGE_MARK);
  if (tail.length) ignored.push(...tail);

  // ----- Bảng đáp án (cuối đề hoặc dán riêng) -----
  const key = parseKeyText(`${keyText}\n${answerKey}`);
  if (key.pairs || key.sequence) {
    questions.forEach((q, i) => {
      const letter = key.pairs ? key.pairs.get(q.srcNo) : key.sequence[i];
      if (!letter) return;
      if (q.answer && q.answer !== letter) {
        q.flags.push({ level: 'warn', text: `Đáp án trong đề (${q.answer}) khác bảng đáp án (${letter}). Đang dùng ${q.answer}.` });
      } else if (!q.answer) {
        q.answer = letter;
        q.answerFrom = 'key';
      }
    });
  }

  // ----- Kiểm tra từng question -----
  const errors = [];
  if (questions.length === 0) errors.push('Không tìm thấy question nào. Mỗi question cần bắt đầu bằng số câu, ví dụ "1." hoặc "Câu 1:".');
  if (questions.length > MAX_PASTE_QUESTIONS) errors.push(`Mỗi lần dán tối đa ${MAX_PASTE_QUESTIONS} question. Hãy chia đề thành nhiều lần.`);

  const seen = new Map();
  for (const q of questions) {
    q.question = q.question.replace(/\n{2,}/g, '\n').trim();
    q.explanation = q.explanation.trim();
    const letters = q.options.map((o) => o.letter);
    const passage = q.group !== null ? groups[q.group].passage : '';

    if (letters.length === 0) q.flags.push({ level: 'error', text: 'Không tìm thấy các lựa chọn A, B, C…' });
    else if (letters.length === 1) q.flags.push({ level: 'error', text: 'Chỉ tìm thấy 1 lựa chọn.' });
    if (q.duplicateOptions || letters.some((l, i) => l !== LETTERS[i])) {
      q.flags.push({ level: 'error', text: `Các lựa chọn bị lặp hoặc sai thứ tự (${letters.join(', ')}).` });
    }
    if (q.mergedSuspect) q.flags.push({ level: 'warn', text: 'Có thể có 2 question bị dính vào nhau (lựa chọn A xuất hiện 2 lần).' });
    if (q.answer && !letters.includes(q.answer)) {
      q.flags.push({ level: 'error', text: `Đáp án ${q.answer} không có trong các lựa chọn.` });
      q.answer = null;
      q.answerFrom = null;
    }

    // Dấu hiệu cần ảnh
    if (q.imageMark) q.flags.push({ level: 'image', text: 'Bản gốc có ảnh ở chỗ này (ảnh không đi theo khi copy chữ).' });
    if (letters.length && q.options.some((o) => !o.text)) {
      q.flags.push({ level: 'image', text: 'Có lựa chọn không có chữ — nội dung có thể nằm trong ảnh.' });
    }
    const word = `${q.question}\n${q.options.map((o) => o.text).join('\n')}`.match(IMAGE_WORDS);
    if (word && !isTableText(q.question) && !isTableText(passage)) {
      // "weak": chỉ đoán theo từ khóa -> AI kiểm tra mà thấy không cần ảnh thì bỏ đánh dấu này
      q.flags.push({ level: 'image', weak: true, text: `Question nhắc tới "${(word[1] || word[2]).toLowerCase()}".` });
    }
    if (!q.question && q.group === null && !q.flags.some((f) => f.level === 'image')) {
      q.flags.push({ level: 'image', text: 'Question không có chữ — có thể nội dung nằm trong ảnh hoặc audio.' });
    }
    if (!q.answer) q.flags.push({ level: 'info', text: 'Chưa có đáp án.' });

    const sig = `${q.question}|${letters.map((l, i) => q.options[i].text).join('|')}`.toLowerCase();
    if (q.question && seen.has(sig)) q.flags.push({ level: 'warn', text: `Trùng với question số ${seen.get(sig)} ở trên.` });
    else seen.set(sig, q.srcNo);

    // Chuyển lựa chọn thành dạng { A: '...', B: '...' } (tối đa 6)
    q.options = Object.fromEntries(q.options.filter((o, i) => o.letter === LETTERS[i]).slice(0, 6).map((o) => [o.letter, o.text]));
    delete q.duplicateOptions;
    delete q.mergedSuspect;
  }
  groups.forEach((g, i) => {
    if (!questions.some((q) => q.group === i)) ignored.push(...g.passage.split('\n'));
  });

  return { questions, groups, ignored, errors };
}

/**
 * Lý do "cần ảnh" gộp lại thành một câu (lưu vào question.review.needsImage), '' nếu không cần.
 * ai: kết quả AI của question (nếu đã kiểm tra) — AI nói không cần ảnh thì bỏ các dấu hiệu yếu (từ khóa).
 */
export function imageReasonOf(q, ai = null) {
  const reasons = q.flags
    .filter((f) => f.level === 'image' && !(f.weak && ai && !ai.needsImage))
    .map((f) => f.text.replace(/\.$/, ''));
  if (ai?.needsImage) reasons.push(`AI: ${ai.imageReason.replace(/\.$/, '')}`);
  return reasons.join('; ');
}
