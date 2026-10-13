// Đọc file Excel danh sách lớp (file của trung tâm, KHÔNG bắt buộc theo mẫu).
//
// Mỗi nơi đặt tên cột một kiểu ("Họ và tên", "Họ tên", "Name", "Tên HS"...), nên web:
//  1. Tự tìm dòng tên cột (bỏ qua các dòng tiêu đề kiểu "DANH SÁCH LỚP K12" ở trên).
//  2. Đoán từng cột là gì: theo tên cột trước, không được thì theo nội dung (cột toàn tên người, cột toàn số điện thoại).
//  3. Trả về để giáo viên xem lại, đổi nếu đoán sai. Việc ghép cột + kiểm tra từng dòng làm ở trình duyệt
//     (frontend/src/utils/rosterImport.js); lưu thì đi qua API thêm học sinh như bình thường.
//
// Loại cột (field): fullName | lastName | firstName | phone | joinedOn | priorSessions | note
//                   | extra (cột lạ: gộp vào ghi chú, kèm tên cột) | skip (bỏ qua)
const ExcelJS = require('exceljs');
const { stripComments } = require('../exam/excelImport');

const MAX_ROWS = 1000;
const MAX_COLUMNS = 40;
const HEADER_SCAN_ROWS = 15;

/** Bỏ dấu, chữ thường: "Họ và Tên" -> "ho va ten" */
function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}
/** Các từ (không dấu) của tên cột */
const tokensOf = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// Tên cột (viết liền, không dấu) -> loại cột
const SKIP_EXACT = ['stt', 'tt', 'sott', 'sothutu', 'no', 'so', 'number', 'order',
  // các cột thống kê trong file "Tải danh sách lớp" của web -> nhập lại thì bỏ qua
  'trangthai', 'tongsobuoi', 'comat', 'dimuon', 'vangcophep', 'vangkhongphep', 'diemcong', 'hocphi'];
const PHONE_WORDS = ['sdt', 'sodienthoai', 'dienthoai', 'phone', 'mobile', 'tel', 'zalo', 'didong', 'lienhe', 'contact', 'sodt'];
const JOINED_WORDS = ['vaohoc', 'nhaphoc', 'batdauhoc', 'ngaybatdau', 'ngayvao', 'startdate', 'joindate', 'joined', 'enroll'];
const PRIOR_WORDS = ['buoidahoc', 'sobuoi', 'dahoc'];
const NOTE_WORDS = ['ghichu', 'note', 'notes', 'remark', 'remarks'];
// Cột về NGƯỜI KHÁC hoặc thứ khác có chữ "tên": tên phụ huynh, tên lớp, tên trường, tên giáo viên -> không phải họ tên học sinh
const OTHER_TOKENS = ['ph', 'phuhuynh', 'parent', 'parents', 'bo', 'me', 'cha', 'father', 'mother', 'guardian', 'giamho',
  'lop', 'class', 'truong', 'school', 'khoa', 'course', 'giaovien', 'gv', 'teacher'];
const LAST_NAME_EXACT = ['ho', 'hodem', 'holot', 'hovadem', 'hovatendem', 'hochulot', 'hovachulot', 'lastname', 'surname', 'familyname'];
const FIRST_NAME_EXACT = ['ten', 'firstname', 'givenname', 'tenrieng', 'tengoi'];
const FULL_NAME_EXACT = ['name', 'ten', 'tenhs', 'tenhv', 'tenhocsinh', 'tenhocvien', 'hocsinh', 'hocvien', 'hs', 'hv', 'student',
  'students', 'studentname', 'tenbe', 'be', 'tencon', 'hotenbe', 'tendaydu'];

/** Đoán loại cột chỉ từ tên cột. null = tên cột trống. */
function fieldFromHeader(header) {
  const tokens = tokensOf(header);
  const compact = tokens.join('');
  if (!compact) return null;
  if (SKIP_EXACT.includes(compact)) return 'skip';
  if (PHONE_WORDS.some((w) => compact.includes(w)) || tokens.includes('dt')) return 'phone';
  if (JOINED_WORDS.some((w) => compact.includes(w))) return 'joinedOn';
  if (PRIOR_WORDS.some((w) => compact.includes(w))) return 'priorSessions';
  if (NOTE_WORDS.some((w) => compact.includes(w))) return 'note';
  if (tokens.some((t) => OTHER_TOKENS.includes(t)) || compact.includes('phuhuynh')) return 'extra';
  if (LAST_NAME_EXACT.includes(compact)) return 'lastName';
  if (FIRST_NAME_EXACT.includes(compact)) return 'firstName';
  if (FULL_NAME_EXACT.includes(compact)) return 'fullName';
  if (['hoten', 'hovaten', 'fullname'].some((w) => compact.includes(w))) return 'fullName';
  if (tokens.includes('name')) return 'fullName'; // "Student name", "Name of student"
  if (compact.startsWith('ten') && /(hocsinh|hocvien|hs$|hv$|be$|con$)/.test(compact)) return 'fullName';
  return 'extra';
}

// ----- Đoán theo nội dung (khi tên cột trống hoặc không có cột họ tên nào) -----
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const looksLikeName = (v) => {
  const words = v.trim().split(/\s+/);
  return NAME_RE.test(v.trim()) && words.length >= 2 && words.length <= 6 && v.length <= 60;
};
const looksLikePhone = (v) => {
  const digits = v.replace(/\D/g, '');
  return /^[+\d\s.()/-]+$/.test(v.trim()) && digits.length >= 9 && digits.length <= 12;
};
const isSingleWord = (v) => NAME_RE.test(v.trim()) && !/\s/.test(v.trim());

/** Tỉ lệ ô (khác trống) thỏa điều kiện; cột gần như trống -> 0 */
function ratio(values, test) {
  const filled = values.filter((v) => v !== '');
  if (filled.length === 0) return 0;
  return filled.filter(test).length / filled.length;
}

/**
 * Đoán loại của mọi cột.
 * headers: tên các cột ([] nếu file không có dòng tên cột); dataRows: mảng các dòng (mảng chữ).
 * Trả về [{ field, by: 'header' | 'content' | 'auto' }] theo thứ tự cột.
 */
function guessColumns(headers, dataRows) {
  const width = Math.max(headers.length, ...dataRows.map((r) => r.length), 0);
  const valuesOf = (i) => dataRows.map((r) => String(r[i] ?? '').trim());
  const out = [];
  for (let i = 0; i < width; i++) {
    const field = fieldFromHeader(headers[i]);
    out.push(field ? { field, by: 'header' } : { field: null, by: 'auto' });
  }
  const count = (f) => out.filter((c) => c.field === f).length;

  // Kiểu hay gặp ở Việt Nam: ô "Họ và tên" gộp qua 2 cột (họ đệm | tên), cột thứ hai không có tên cột
  out.forEach((c, i) => {
    const next = out[i + 1];
    if (c.field === 'fullName' && next && next.field === null && ratio(valuesOf(i + 1), isSingleWord) >= 0.7) {
      c.field = 'lastName';
      next.field = 'firstName';
      next.by = 'content';
    }
  });

  // Có "Tên" mà không có "Họ" -> "Tên" chính là họ tên (và ngược lại)
  if (count('firstName') && !count('lastName')) out.filter((c) => c.field === 'firstName').forEach((c) => { c.field = 'fullName'; });
  if (count('lastName') && !count('firstName')) out.filter((c) => c.field === 'lastName').forEach((c) => { c.field = 'fullName'; });
  // Đã có cột họ tên đầy đủ thì các cột họ / tên tách riêng chỉ là thừa (ví dụ cột "Tên" để sắp xếp)
  if (count('fullName')) out.filter((c) => c.field === 'lastName' || c.field === 'firstName').forEach((c) => { c.field = 'skip'; });

  // Mỗi loại chỉ một cột (trừ ghi chú / cột lạ): cột sau cùng loại -> gộp vào ghi chú
  for (const f of ['fullName', 'lastName', 'firstName', 'phone', 'joinedOn', 'priorSessions']) {
    out.filter((c) => c.field === f).slice(1).forEach((c) => { c.field = 'extra'; });
  }

  // Cột không có tên: đoán theo nội dung
  const hasName = () => count('fullName') || count('lastName');
  out.forEach((c, i) => {
    if (c.field !== null) return;
    const values = valuesOf(i);
    if (values.every((v) => v === '')) c.field = 'skip';
    else if (!hasName() && ratio(values, looksLikeName) >= 0.6) Object.assign(c, { field: 'fullName', by: 'content' });
    else if (!count('phone') && ratio(values, looksLikePhone) >= 0.6) Object.assign(c, { field: 'phone', by: 'content' });
    else if (ratio(values, (v) => /^\d{1,3}$/.test(v)) === 1 && i === 0) c.field = 'skip'; // cột số thứ tự không tên
    else c.field = 'extra';
  });

  // Vẫn chưa có cột họ tên (tên cột lạ): chọn cột "giống tên người" nhất trong các cột lạ
  if (!hasName()) {
    let best = -1;
    let bestScore = 0.6;
    out.forEach((c, i) => {
      if (c.field !== 'extra') return;
      const score = ratio(valuesOf(i), looksLikeName);
      if (score >= bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best >= 0) Object.assign(out[best], { field: 'fullName', by: 'content' });
  }
  return out;
}

// ----- Đọc file -----

const pad = (n) => String(n).padStart(2, '0');

/** Giá trị một ô -> chữ. Ô ngày -> "dd/mm/yyyy" (exceljs đọc ngày theo giờ UTC). */
function cellToText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return cellToText(value.text); // ô có link
    if (value.result !== undefined) return cellToText(value.result); // ô công thức
    return '';
  }
  return String(value);
}

/** Tên cột kiểu Excel: 0 -> A, 26 -> AA */
function columnLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Một trang -> các dòng có dữ liệu: [{ rowNumber, cells: [chữ...] }] */
function readGrid(ws) {
  const grid = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > MAX_COLUMNS) return;
      // Ô gộp: chỉ lấy chữ ở ô đầu, các ô còn lại coi như trống (tránh lặp tiêu đề)
      const slave = cell.isMerged && cell.master && cell.master.address !== cell.address;
      cells[col - 1] = slave ? '' : cellToText(cell.value).replace(/\s+/g, ' ').trim();
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    if (cells.some(Boolean)) grid.push({ rowNumber, cells });
  });
  return grid;
}

/** Dòng tên cột = dòng (trong ~15 dòng đầu) có nhiều tên cột nhận ra được nhất. -1 = file không có dòng tên cột. */
function findHeaderRow(grid) {
  let best = -1;
  let bestScore = 0;
  grid.slice(0, HEADER_SCAN_ROWS).forEach((row, i) => {
    const fields = row.cells.map(fieldFromHeader).filter((f) => f && f !== 'extra');
    // Dòng tiêu đề kiểu "DANH SÁCH HỌC SINH" chỉ có 1 ô chữ -> cần thêm một cột nhận ra được nữa
    const filled = row.cells.filter(Boolean).length;
    const score = fields.length + (fields.some((f) => ['fullName', 'lastName', 'firstName'].includes(f)) ? 1 : 0);
    if (score > bestScore && (filled > 1 || fields.length > 0)) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

class RosterFileError extends Error {}

/**
 * Đọc file Excel danh sách lớp.
 * sheetIndex: trang muốn đọc (mặc định: trang đầu tiên có dữ liệu).
 */
async function readRosterWorkbook(buffer, { sheetIndex } = {}) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await stripComments(buffer));
  } catch {
    throw new RosterFileError('Không đọc được file Excel. Hãy mở file bằng Excel, bấm Lưu (Save) rồi chọn lại.');
  }
  const sheets = wb.worksheets.map((ws, i) => ({ index: i, name: ws.name, grid: readGrid(ws) }));
  if (sheets.length === 0 || sheets.every((s) => s.grid.length === 0)) throw new RosterFileError('File Excel không có dữ liệu.');

  const chosen = sheets.find((s) => s.index === sheetIndex) || sheets.find((s) => s.grid.length > 0);
  const headerIdx = findHeaderRow(chosen.grid);
  const headers = headerIdx >= 0 ? [...chosen.grid[headerIdx].cells] : [];
  let dataStart = headerIdx + 1;
  // Tên cột 2 tầng: "Họ và tên" gộp ô, dòng dưới là "Họ đệm | Tên" -> dùng tên cột ở dòng dưới
  const sub = headerIdx >= 0 ? chosen.grid[dataStart] : null;
  const isHeaderText = (c) => !c || ((f) => f && f !== 'extra')(fieldFromHeader(c));
  if (sub && sub.cells.some(Boolean) && sub.cells.every(isHeaderText)) {
    sub.cells.forEach((c, i) => {
      if (c) headers[i] = c;
    });
    dataStart += 1;
  }
  const data = chosen.grid.slice(dataStart);
  if (data.length > MAX_ROWS) throw new RosterFileError(`File có ${data.length} dòng, quá nhiều. Mỗi lần nhập tối đa ${MAX_ROWS} dòng.`);

  const guesses = guessColumns(headers, data.map((r) => r.cells));
  const columns = guesses.map((g, i) => ({
    index: i,
    letter: columnLetter(i),
    header: headers[i] || '',
    field: g.field,
    guessedBy: g.by,
    samples: data.map((r) => r.cells[i] || '').filter(Boolean).slice(0, 3),
  }));
  return {
    sheets: sheets.map((s) => ({ index: s.index, name: s.name, rows: s.grid.length })),
    sheetIndex: chosen.index,
    headerRowNumber: headerIdx >= 0 ? chosen.grid[headerIdx].rowNumber : null,
    columns,
    rows: data.map((r) => ({ rowNumber: r.rowNumber, cells: columns.map((c) => r.cells[c.index] || '') })),
  };
}

module.exports = { readRosterWorkbook, guessColumns, fieldFromHeader, RosterFileError, fold };
