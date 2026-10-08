// Đọc file Excel đề thi theo mẫu docs/mau-de-toeic.xlsx.
//
// Đọc theo TÊN TRANG và TÊN CỘT (không theo vị trí), bỏ khoảng trắng thừa, không phân biệt hoa/thường.
// Kết quả:
//   errors   : lỗi làm sai dữ liệu -> KHÔNG cho áp dụng (ví dụ đáp án "E", số câu trùng, sai Part)
//   warnings : nhắc nhở (ví dụ bỏ qua dòng trống)
// Các thiếu sót "chưa đủ để xuất bản" (thiếu đáp án, thiếu đoạn văn...) do validate.js kiểm tra riêng.
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const { standardPart } = require('./validate');
const { KINDS, defaultKind, fileName, lettersForPart } = require('./contentSchema');

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

// "Loại" trong trang «Nhóm câu» -> kind trong dữ liệu
const KIND_BY_LABEL = {
  'hội thoại': 'conversation',
  'bài nói': 'talk',
  'đoạn văn điền từ': 'text',
  'đoạn văn đơn': 'single',
  'đoạn văn đôi': 'double',
  'đoạn văn ba': 'triple',
};

/** Chuẩn hóa chữ để so sánh tên trang / tên cột: bỏ khoảng trắng thừa, chữ thường, Unicode NFC */
const norm = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Lấy giá trị chữ của một ô (ô có định dạng, công thức, link...) */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value);
}

/**
 * Một số công cụ (ví dụ openpyxl tạo ra file mẫu) ghi phần ghi chú (comment) theo cách exceljs đọc bị lỗi.
 * Ta không cần ghi chú, nên bỏ chúng đi trước khi đọc.
 */
async function stripComments(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(name)) {
      const xml = await zip.file(name).async('string');
      zip.file(name, xml.replace(/<Relationship[^>]*(?:comments|vmlDrawing)[^>]*\/>/g, ''));
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const xml = await zip.file(name).async('string');
      zip.file(name, xml.replace(/<legacyDrawing[^>]*\/>/g, ''));
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Đọc một trang thành mảng { rowNumber, get(tênCột) }.
 * Trả về null nếu không có trang; missing = các cột bắt buộc bị thiếu.
 */
function readSheet(workbook, sheetName, requiredColumns) {
  const ws = workbook.worksheets.find((w) => norm(w.name) === norm(sheetName));
  if (!ws) return null;
  const header = ws.getRow(1);
  const colIndex = new Map();
  header.eachCell({ includeEmpty: false }, (cell, col) => colIndex.set(norm(cellText(cell.value)), col));
  const missing = requiredColumns.filter((c) => !colIndex.has(norm(c)));

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (col) => {
      const idx = colIndex.get(norm(col));
      return idx ? cellText(row.getCell(idx).value).replace(/\r\n?/g, '\n').trim() : '';
    };
    rows.push({ rowNumber, get });
  });
  return { rows, missing };
}

const toInt = (s) => (/^\d+$/.test(String(s).trim()) ? Number(s) : null);
const splitFiles = (s) => String(s || '').split(/[;,\n]/).map(fileName).filter(Boolean);

/**
 * @param {Buffer} buffer nội dung file .xlsx
 * @returns {Promise<{ settings, content, errors: string[], warnings: string[] }>}
 */
async function parseExamWorkbook(buffer) {
  const errors = [];
  const warnings = [];
  const settings = {};
  const content = { examType: 'TOEIC_LR', audio: { full: null, parts: { 1: null, 2: null, 3: null, 4: null } }, groups: [], questions: [] };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await stripComments(buffer));
  } catch {
    errors.push('Không đọc được file. Hãy chắc chắn đây là file Excel (.xlsx) theo mẫu, không phải file .xls cũ hay file đã bị hỏng.');
    return { settings, content, errors, warnings };
  }

  // ---------- Trang «Thông tin đề» ----------
  const info = readSheet(workbook, 'Thông tin đề', ['Mục', 'Giá trị']);
  if (!info) {
    warnings.push('Không có trang «Thông tin đề»: giữ nguyên mã đề, tên đề, thời gian hiện tại.');
  } else if (info.missing.length) {
    errors.push(`Trang «Thông tin đề» thiếu cột: ${info.missing.join(', ')}.`);
  } else {
    const items = new Map(info.rows.map((r) => [norm(r.get('Mục')), r.get('Giá trị')]));
    const code = (items.get(norm('Mã đề')) || '').toUpperCase();
    if (code) {
      if (CODE_RE.test(code)) settings.code = code;
      else errors.push(`Trang «Thông tin đề»: mã đề "${code}" không hợp lệ (chỉ chữ không dấu, số, dấu gạch; 2–30 ký tự).`);
    }
    const title = items.get(norm('Tên đề'));
    if (title) settings.title = title.slice(0, 200);
    const duration = items.get(norm('Thời gian (phút)'));
    if (duration) {
      const n = toInt(duration);
      if (n && n <= 600) settings.durationMinutes = n;
      else errors.push(`Trang «Thông tin đề»: thời gian "${duration}" không hợp lệ (phải là số phút từ 1 đến 600).`);
    }
    const note = items.get(norm('Ghi chú nội bộ'));
    if (note) settings.internalNote = note.slice(0, 5000);
    content.audio.full = fileName(items.get(norm('Audio cả bài Listening')));
    for (const p of [1, 2, 3, 4]) content.audio.parts[p] = fileName(items.get(norm(`Audio Part ${p}`)));
  }

  // ---------- Trang «Nhóm câu» ----------
  const groupSheet = readSheet(workbook, 'Nhóm câu', ['Mã nhóm', 'Part', 'Từ câu', 'Đến câu']);
  const groupCodes = new Set();
  if (!groupSheet) {
    warnings.push('Không có trang «Nhóm câu»: đề sẽ không có đoạn văn / nhóm câu.');
  } else if (groupSheet.missing.length) {
    errors.push(`Trang «Nhóm câu» thiếu cột: ${groupSheet.missing.join(', ')}.`);
  } else {
    for (const r of groupSheet.rows) {
      const where = `Trang «Nhóm câu», dòng ${r.rowNumber}`;
      const code = r.get('Mã nhóm').toUpperCase();
      if (!code) continue; // dòng trống
      if (groupCodes.has(code)) {
        errors.push(`${where}: mã nhóm "${code}" bị trùng.`);
        continue;
      }
      const part = toInt(r.get('Part'));
      const from = toInt(r.get('Từ câu'));
      const to = toInt(r.get('Đến câu'));
      if (!part || part < 1 || part > 7) errors.push(`${where} (nhóm ${code}): Part "${r.get('Part')}" không hợp lệ.`);
      if (!from || !to || from > to || to > 200) {
        errors.push(`${where} (nhóm ${code}): "Từ câu" / "Đến câu" không hợp lệ.`);
      }
      const kindLabel = norm(r.get('Loại'));
      let kind = KIND_BY_LABEL[kindLabel] || (KINDS.includes(kindLabel) ? kindLabel : null);
      if (!kind) {
        kind = defaultKind(code, part);
        if (kindLabel) warnings.push(`${where}: không hiểu loại "${r.get('Loại')}", tự chọn theo mã nhóm.`);
      }
      groupCodes.add(code);
      content.groups.push({
        code,
        part,
        kind,
        from,
        to,
        passage: r.get('Đoạn văn (chữ)'),
        passageImages: splitFiles(r.get('Ảnh đoạn văn')),
        image: fileName(r.get('Ảnh kèm')),
      });
    }
  }

  // ---------- Trang «Câu hỏi» ----------
  const qSheet = readSheet(workbook, 'Câu hỏi', ['Số câu', 'Đáp án']);
  if (!qSheet) {
    errors.push('Không tìm thấy trang «Câu hỏi». Hãy dùng đúng file mẫu (không đổi tên các trang).');
    return { settings, content, errors, warnings };
  }
  if (qSheet.missing.length) {
    errors.push(`Trang «Câu hỏi» thiếu cột: ${qSheet.missing.join(', ')}.`);
    return { settings, content, errors, warnings };
  }

  const seen = new Set();
  for (const r of qSheet.rows) {
    const rawNo = r.get('Số câu');
    const letters = ['A', 'B', 'C', 'D'];
    const fields = {
      question: r.get('Câu hỏi'),
      options: Object.fromEntries(letters.map((l) => [l, r.get(l)])),
      answer: r.get('Đáp án').toUpperCase(),
      image: fileName(r.get('Ảnh')),
      explanation: r.get('Giải thích'),
    };
    // Dòng chưa điền gì (file mẫu có sẵn số câu, Part, mã nhóm cho đủ 200 dòng) -> bỏ qua
    const filled = fields.question || fields.answer || fields.image || fields.explanation || letters.some((l) => fields.options[l]);
    if (!filled) continue;

    const where = `Trang «Câu hỏi», dòng ${r.rowNumber}`;
    const no = toInt(rawNo);
    if (!no || no < 1 || no > 200) {
      errors.push(`${where}: số câu "${rawNo}" không hợp lệ (phải từ 1 đến 200).`);
      continue;
    }
    const label = `${where} (câu ${no})`;
    if (seen.has(no)) {
      errors.push(`${label}: câu ${no} bị trùng.`);
      continue;
    }
    seen.add(no);

    const expected = standardPart(no);
    const part = r.get('Part') ? toInt(r.get('Part')) : expected;
    if (part !== expected) errors.push(`${label}: câu ${no} phải thuộc Part ${expected} (đang ghi "${r.get('Part')}").`);

    const allowed = lettersForPart(expected);
    if (fields.answer && !allowed.includes(fields.answer)) {
      errors.push(`${label}: đáp án "${fields.answer}" không hợp lệ (chỉ được ${allowed.join(', ')}).`);
    }
    if (expected === 2 && fields.options.D) warnings.push(`${label}: Part 2 chỉ có A, B, C — bỏ qua cột D.`);

    const groupCode = r.get('Mã nhóm').toUpperCase() || null;
    if (groupCode && !groupCodes.has(groupCode)) {
      errors.push(`${label}: mã nhóm "${groupCode}" không có trong trang «Nhóm câu».`);
    }

    const options = {};
    for (const l of allowed) options[l] = fields.options[l];
    content.questions.push({
      no,
      part: expected,
      type: 'mcq',
      groupCode,
      question: fields.question,
      options,
      answer: allowed.includes(fields.answer) ? fields.answer : null,
      image: fields.image,
      explanation: fields.explanation,
    });
  }
  content.questions.sort((a, b) => a.no - b.no);

  if (content.questions.length === 0 && errors.length === 0) {
    errors.push('Trang «Câu hỏi» chưa có câu nào được điền (cần ít nhất Đáp án hoặc nội dung câu hỏi).');
  }
  return { settings, content, errors, warnings };
}

module.exports = { parseExamWorkbook, stripComments, cellText };
