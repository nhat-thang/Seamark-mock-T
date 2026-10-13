// Nhập danh sách lớp từ Excel: ghép các cột (đã đoán ở server, giáo viên có thể đổi) thành danh sách học sinh,
// kiểm tra từng dòng trước khi lưu. Hàm thuần (không gọi API) để test được: backend/tests/class-import.test.js

// Các loại cột giáo viên chọn được (thứ tự hiện trong ô chọn)
export const FIELD_OPTIONS = [
  { key: 'fullName', label: 'Họ và tên' },
  { key: 'lastName', label: 'Họ (họ và tên đệm)' },
  { key: 'firstName', label: 'Tên' },
  { key: 'parentName', label: 'Tên phụ huynh' },
  { key: 'phone', label: 'SĐT phụ huynh' },
  { key: 'parentIdNumber', label: 'CCCD phụ huynh' },
  { key: 'joinedOn', label: 'Ngày vào học' },
  { key: 'note', label: 'Ghi chú' },
  { key: 'extra', label: 'Gộp vào ghi chú' },
  { key: 'skip', label: 'Bỏ qua cột này' },
];
// Mỗi loại này chỉ được một cột
const SINGLE = ['fullName', 'lastName', 'firstName', 'parentName', 'phone', 'parentIdNumber', 'joinedOn'];

const NOTE_MAX = 500;
const NAME_MAX = 80;

/** Bỏ dấu, chữ thường (so trùng tên) */
export const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/** "NGUYỄN VĂN AN" / "nguyễn văn an" -> "Nguyễn Văn An" (tên đã viết hoa đầu chữ thì giữ nguyên) */
export function tidyName(raw) {
  // Bỏ số thứ tự lẫn vào ô tên: "1. Nguyễn An"
  const s = String(raw ?? '').replace(/^\s*\d{1,3}\s*[.)\-–:]\s*/, '').replace(/\s+/g, ' ').trim();
  const allUpper = s === s.toLocaleUpperCase('vi') && s !== s.toLocaleLowerCase('vi');
  const allLower = s === s.toLocaleLowerCase('vi') && s !== s.toLocaleUpperCase('vi');
  if (!allUpper && !allLower) return s;
  return s
    .toLocaleLowerCase('vi')
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1))
    .join(' ');
}

/**
 * Chuẩn hóa số điện thoại Việt Nam.
 * - Excel làm mất số 0 ở đầu: "912345678" -> "0912345678"
 * - "+84 912 345 678" / "84912345678" -> "0912345678"
 * - Một ô có nhiều số ("0901234567 / 0912345678"): lấy số đầu, các số sau trả về trong `others`
 * Trả về { phone, others: [...], invalid } — invalid: chữ gốc khi không đọc được thành số điện thoại.
 */
export function normalizePhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { phone: '', others: [], invalid: '' };
  const parts = text.split(/\s*[/,;|]\s*|\s+-\s+|\s{2,}/).filter(Boolean);
  const out = [];
  for (const part of parts) {
    let d = part.replace(/[\s.()-]/g, '');
    if (!/^\+?\d+$/.test(d)) continue;
    d = d.replace(/^\+/, '');
    // Hai số di động viết liền nhau chỉ cách một dấu cách: "0901234567 0912345678"
    if (/^0\d{9}0\d{9}$/.test(d)) {
      out.push(d.slice(0, 10), d.slice(10));
      continue;
    }
    if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`; // 84 912 345 678
    if (/^[35789]\d{8}$/.test(d)) d = `0${d}`; // di động mất số 0
    if (/^2\d{9}$/.test(d)) d = `0${d}`; // số bàn (02x...) mất số 0
    // Di động 10 số, máy bàn 11 số (02x...) — giống kiểm tra ở server (routes/classes.js cleanPhone)
    if (/^0\d{9}$/.test(d) || /^02\d{9}$/.test(d)) out.push(d);
  }
  if (out.length === 0) return { phone: '', others: [], invalid: text };
  return { phone: out[0], others: out.slice(1), invalid: '' };
}

/** Số CCCD (12 số) / CMND cũ (9 số). Excel làm mất số 0 ở đầu CCCD (còn 11 số) thì thêm lại. { value, invalid } */
export function normalizeIdNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: '', invalid: '' };
  let d = text.replace(/[\s.-]/g, '');
  if (/^\d{11}$/.test(d)) d = `0${d}`;
  return /^(\d{9}|\d{12})$/.test(d) ? { value: d, invalid: '' } : { value: '', invalid: text };
}

const pad = (n) => String(n).padStart(2, '0');

/** Ngày gõ tay hoặc ô ngày của Excel -> "YYYY-MM-DD". Hiểu theo kiểu Việt Nam: ngày/tháng/năm. null nếu không đọc được. */
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let y;
  let m;
  let d;
  let match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (match) {
    [, d, m, y] = match.map(Number);
    if (y < 100) y += 2000;
  } else if ((match = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/))) {
    [, y, m, d] = match.map(Number);
  } else if (/^\d{5}$/.test(s)) {
    // Số ngày kiểu Excel (ô ngày bị đổi thành số)
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else {
    return null;
  }
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso || y < 2000 || y > 2100) return null;
  return iso;
}

/** Lỗi của cách ghép cột (chặn nhập). Trả về chuỗi rỗng nếu ổn. */
export function mappingError(fields) {
  const has = (f) => fields.includes(f);
  if (!has('fullName') && !has('lastName') && !has('firstName')) {
    return 'Chưa có cột "Họ và tên". Hãy chọn cột nào trong file là họ tên học sinh.';
  }
  for (const f of SINGLE) {
    if (fields.filter((x) => x === f).length > 1) {
      return `Có 2 cột cùng chọn là "${FIELD_OPTIONS.find((o) => o.key === f).label}". Mỗi loại chỉ chọn một cột.`;
    }
  }
  return '';
}

/**
 * Ghép các cột thành danh sách học sinh.
 * columns: [{ header, letter }]; fields: loại của từng cột; rows: [{ rowNumber, cells }]
 * existing: học sinh đang học trong lớp (để báo trùng); defaultJoinedOn: ngày vào học khi file không có
 * Trả về [{ rowNumber, fullName, parentName, parentPhone, parentIdNumber, joinedOn, note, problems: [], warnings: [], duplicate, include }]
 * Nhập từ Excel chỉ bắt buộc họ tên (đã chốt); thiếu thông tin phụ huynh thì bổ sung sau (lớp hiện nhãn "Thiếu thông tin").
 */
export function buildStudents({ columns, rows, fields, defaultJoinedOn, existing = [] }) {
  const idx = (f) => fields.indexOf(f);
  const existingKeys = existing.map((s) => ({ name: fold(s.fullName), phone: s.parentPhone ?? s.phone ?? '' }));
  const seen = new Map(); // tên + SĐT -> số dòng đầu tiên trong file
  const out = [];

  for (const row of rows) {
    const cell = (i) => (i >= 0 ? String(row.cells[i] ?? '').trim() : '');
    // Dòng không có gì ở các cột được dùng -> bỏ qua luôn (dòng trống, dòng kẻ...)
    if (fields.every((f, i) => f === 'skip' || !cell(i))) continue;

    const warnings = [];
    const problems = [];
    let fullName = idx('fullName') >= 0 ? cell(idx('fullName')) : `${cell(idx('lastName'))} ${cell(idx('firstName'))}`;
    fullName = tidyName(fullName);
    if (!fullName) problems.push('Thiếu họ tên');
    if (fullName.length > NAME_MAX) {
      fullName = fullName.slice(0, NAME_MAX).trim();
      warnings.push('Họ tên quá dài, đã cắt bớt');
    }

    const noteParts = [];
    fields.forEach((f, i) => {
      if (f === 'note' && cell(i)) noteParts.push(cell(i));
    });

    const p = normalizePhone(cell(idx('phone')));
    if (p.invalid) {
      warnings.push(`SĐT "${p.invalid}" không đúng, đã đưa vào ghi chú`);
      noteParts.push(`SĐT: ${p.invalid}`);
    }
    if (p.others.length) noteParts.push(`SĐT khác: ${p.others.join(', ')}`);

    let parentName = tidyName(cell(idx('parentName')));
    if (parentName.length > NAME_MAX) parentName = parentName.slice(0, NAME_MAX).trim();

    const id = normalizeIdNumber(cell(idx('parentIdNumber')));
    if (id.invalid) {
      warnings.push(`CCCD "${id.invalid}" không đúng (CCCD gồm 12 số), đã đưa vào ghi chú`);
      noteParts.push(`CCCD: ${id.invalid}`);
    }

    let joinedOn = defaultJoinedOn;
    const joinedRaw = cell(idx('joinedOn'));
    if (joinedRaw) {
      const parsed = parseDate(joinedRaw);
      if (parsed) joinedOn = parsed;
      else warnings.push(`Không hiểu ngày vào học "${joinedRaw}", dùng ngày mặc định`);
    }

    // Cột lạ: "Tên cột: giá trị"
    fields.forEach((f, i) => {
      if (f === 'extra' && cell(i)) noteParts.push(`${columns[i].header || `Cột ${columns[i].letter}`}: ${cell(i)}`);
    });
    let note = noteParts.join('; ');
    if (note.length > NOTE_MAX) {
      note = `${note.slice(0, NOTE_MAX - 1)}…`;
      warnings.push('Ghi chú quá dài, đã cắt bớt');
    }

    // Trùng: cùng tên (không phân biệt dấu / hoa thường) và cùng SĐT (hoặc một bên không có SĐT)
    let duplicate = '';
    if (fullName) {
      const key = fold(fullName);
      if (existingKeys.some((e) => e.name === key && (!e.phone || !p.phone || e.phone === p.phone))) {
        duplicate = 'Đã có trong lớp';
      } else {
        const sameKey = `${key}|${p.phone}`;
        if (seen.has(sameKey)) duplicate = `Trùng với dòng ${seen.get(sameKey)}`;
        else seen.set(sameKey, row.rowNumber);
      }
    }

    out.push({
      rowNumber: row.rowNumber,
      fullName,
      parentName,
      parentPhone: p.phone,
      parentIdNumber: id.value,
      joinedOn,
      note,
      problems,
      warnings,
      duplicate,
      include: problems.length === 0 && !duplicate,
    });
  }
  return out;
}
