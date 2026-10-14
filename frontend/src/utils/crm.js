// Bảng chăm sóc khách hàng (CSKH): các cột, đọc chữ gõ vào ô (ngày, học phí), chép / dán kiểu Excel,
// lọc, sắp xếp, cảnh báo SĐT / CCCD. Hàm thuần (không gọi API) để test được: backend/tests/crm-utils.test.js
import { fold } from './rosterImport.js';

// 3 trạng thái cố định (đã chốt với người dùng). Đổi ở đây thì đổi cả backend/src/routes/crm.js
export const WON = 'Đã chốt';
export const PENDING = 'Đang chờ chốt';
export const FAIL = 'Fail';
export const FIXED_STATUSES = [
  { name: WON, color: 'won', fixed: true },
  { name: PENDING, color: 'pending', fixed: true },
  { name: FAIL, color: 'fail', fixed: true },
];
// Màu nhãn của trạng thái tự thêm (khớp crm.css và STATUS_COLORS ở server)
export const STATUS_COLORS = ['blue', 'purple', 'teal', 'pink', 'orange', 'sky', 'gray'];
export const NO_STATUS = '__none__'; // bộ lọc "Chưa có trạng thái"

// Các cột theo thứ tự trên bảng. letter = tên cột kiểu Excel (A, B, C...), width = độ rộng mặc định (px)
export const COLUMNS = [
  { key: 'studentName', label: 'Học sinh', type: 'text', width: 190 },
  { key: 'parentName', label: 'Phụ huynh', type: 'text', width: 180 },
  { key: 'phone', label: 'SĐT', type: 'phone', width: 132 },
  { key: 'idNumber', label: 'CCCD', type: 'idNumber', width: 142 },
  { key: 'contactDate', label: 'Ngày CSKH', type: 'date', width: 134 },
  { key: 'staff', label: 'Nhân viên CSKH', type: 'staff', width: 164 },
  { key: 'status', label: 'Trạng thái', type: 'status', width: 158 },
  { key: 'tuition', label: 'Học phí', type: 'money', width: 124 },
  { key: 'followUp', label: 'Hẹn gọi lại', type: 'date', width: 130 },
  { key: 'note', label: 'Ghi chú', type: 'note', width: 340 },
].map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }));
export const COLUMN_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]));

// ---------- Ngày ----------

const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 24 * 3600 * 1000;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Cùng ngày của n tháng sau (31/01 + 1 tháng = 28 hoặc 29/02) */
function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** Ngày có thật trong khoảng 1990–2100 -> "YYYY-MM-DD", không thì null */
function makeDate(y, m, d) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
}

const DATE_WORDS = { 'hom nay': 0, nay: 0, 'bay gio': 0, mai: 1, 'ngay mai': 1, 'hom qua': -1, qua: -1, 'ngay kia': 2, kia: 2, mot: 2 };
const DATE_ERROR = 'Ngày không đúng. Gõ ví dụ 13/10/2026, 13/10 hoặc "hôm nay", "mai", "+3".';

/**
 * Chữ gõ vào ô ngày -> "YYYY-MM-DD". Hiểu: 13/10/2026, 13-10-26, 13.10 (năm nay), 2026-10-13, 10/13/2026 (kiểu Mỹ, khi rõ ràng),
 * "hôm nay", "mai", "hôm qua", "ngày kia", "+3" (3 ngày nữa), "+1 tuần", "+1 tháng", số ngày kiểu Excel (46308).
 * today: ngày hôm nay "YYYY-MM-DD" (giờ VN). Trả { value } (null = để trống) hoặc { error }.
 */
export function parseDateInput(text, today) {
  const t = fold(text);
  if (!t) return { value: null };
  if (t in DATE_WORDS) return { value: addDays(today, DATE_WORDS[t]) };
  let m = /^([+-])\s*(\d{1,3})\s*(ngay|tuan|thang)?(?:\s*(?:nua|toi|sau))?$/.exec(t);
  if (m) {
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    return { value: m[3] === 'thang' ? addMonths(today, n) : addDays(today, m[3] === 'tuan' ? n * 7 : n) };
  }
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (m) {
    const v = makeDate(+m[1], +m[2], +m[3]);
    return v ? { value: v } : { error: DATE_ERROR };
  }
  m = /^(?:ngay\s*)?(\d{1,2})\s*(?:[/.\-\s]|thang)\s*(\d{1,2})(?:\s*(?:[/.\-\s]|nam)\s*(\d{4}|\d{2}))?$/.exec(t);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4);
    // Ngày kiểu Mỹ tháng/ngày (ví dụ 10/13/2026) — chỉ khi chắc chắn (số thứ hai > 12)
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const v = makeDate(y, mo, d);
    return v ? { value: v } : { error: DATE_ERROR };
  }
  // Excel đôi khi chép ra số ngày (đếm từ 30/12/1899)
  if (/^\d{5}$/.test(t) && +t > 32874 && +t < 73051) return { value: addDays('1899-12-30', +t) };
  return { error: DATE_ERROR };
}

// ---------- Tiền ----------

const MONEY_ERROR = 'Học phí phải là số tiền, ví dụ 1500000, 1.500.000, 1tr5 hoặc 800k.';
const money = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= 1e9 ? { value: n } : { error: 'Học phí không hợp lệ (tối đa 1 tỷ).' });

/**
 * Chữ gõ vào ô học phí -> số đồng. Hiểu: 1500000, 1.500.000, 1,500,000, 1.500.000đ, 1tr5, 2tr, 1.5tr, 1,5 triệu, 800k, 800 nghìn, 2 củ.
 * Trả { value } (null = để trống) hoặc { error }.
 */
export function parseMoneyInput(text) {
  const t = fold(text).replace(/\s+/g, '').replace(/(vnd|dong|d)$/, '');
  if (!t) return { value: null };
  let m = /^(\d+)(?:tr|trieu|m|cu)(\d{1,3})?$/.exec(t); // 1tr5 = 1.500.000; 2tr250 = 2.250.000
  if (m) return money(Number(m[1]) * 1e6 + (m[2] ? Math.round(Number(`0.${m[2]}`) * 1e6) : 0));
  m = /^(\d+(?:[.,]\d+)?)(tr|trieu|m|cu|k|nghin|ngan)$/.exec(t); // 1.5tr, 1,5trieu, 800k
  if (m) return money(Math.round(Number(m[1].replace(',', '.')) * (/^(tr|trieu|m|cu)$/.test(m[2]) ? 1e6 : 1e3)));
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return money(Number(t.replace(/[.,]/g, ''))); // 1.500.000
  if (/^\d+$/.test(t)) return money(Number(t));
  return { error: MONEY_ERROR };
}

// ---------- Hiển thị một ô ----------

export const formatDateCell = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const formatMoneyCell = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('vi-VN'));

/** Chữ hiện trong ô / khi bấm sửa ô */
export function cellText(contact, col) {
  const v = contact?.[col.key];
  if (v === null || v === undefined) return '';
  if (col.type === 'date') return formatDateCell(v);
  if (col.type === 'money') return formatMoneyCell(v);
  return String(v);
}

/** Chữ khi chép ra Excel: học phí là số trơn (Excel hiểu là số), ngày dd/mm/yyyy */
export function copyText(contact, col) {
  const v = contact?.[col.key];
  if (v === null || v === undefined) return '';
  if (col.type === 'money') return String(v);
  return cellText(contact, col);
}

/**
 * Chữ người dùng gõ / dán vào một ô -> giá trị gửi lên server. Trả { value } hoặc { error }.
 * Ngày, học phí đổi ở đây (cần biết "hôm nay"); SĐT, CCCD, trạng thái do server chuẩn hóa.
 */
export function parseCellInput(col, text, today) {
  if (col.type === 'date') return parseDateInput(text, today);
  if (col.type === 'money') return parseMoneyInput(text);
  if (col.type === 'note') return { value: String(text ?? '').replace(/\r\n?/g, '\n').trim() };
  return { value: String(text ?? '').replace(/\s+/g, ' ').trim() };
}

export const isBlank = (v) => v === null || v === undefined || v === '';

// ---------- Kiểm tra SĐT / CCCD ----------

const PHONE_RE = /^(0\d{9}|02\d{9})$/;
/** Tách ô SĐT (có thể nhiều số "0901234567 / 0912345678") */
export const phoneParts = (v) => String(v || '').split(/\s*\/\s*/).filter(Boolean);
export function phoneProblem(v) {
  if (!v) return '';
  return phoneParts(v).every((p) => PHONE_RE.test(p)) ? '' : 'SĐT chưa đúng: di động gồm 10 số, ví dụ 0901234567.';
}
export function idProblem(v) {
  if (!v) return '';
  return /^(\d{9}|\d{12})$/.test(v) ? '' : 'Số CCCD chưa đúng: CCCD gồm 12 số (CMND cũ 9 số).';
}

const nameOf = (c) => c.studentName || c.parentName || 'khách hàng chưa có tên';
const listNames = (list) => (list.length > 3 ? `${list.slice(0, 3).map(nameOf).join(', ')} và ${list.length - 3} khách khác` : list.map(nameOf).join(', '));

/**
 * Cảnh báo cho ô SĐT / CCCD của từng khách hàng: viết sai mẫu (đỏ), trùng với khách hàng khác (cam),
 * SĐT đã là phụ huynh của học sinh đang học (xanh).
 * knownPhones: { sđt: [{ studentId, studentName, className }] } từ server.
 * Trả Map(id -> { phone?: { text, tone }, idNumber?: { text, tone } })
 */
export function computeWarnings(contacts, knownPhones = {}) {
  const byPhone = new Map();
  const byId = new Map();
  for (const c of contacts) {
    for (const p of phoneParts(c.phone)) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(c);
    }
    if (c.idNumber) {
      if (!byId.has(c.idNumber)) byId.set(c.idNumber, []);
      byId.get(c.idNumber).push(c);
    }
  }
  const out = new Map();
  for (const c of contacts) {
    const w = {};
    const bad = phoneProblem(c.phone);
    if (bad) w.phone = { text: bad, tone: 'error' };
    else if (c.phone) {
      const parts = phoneParts(c.phone);
      const dups = [...new Set(parts.flatMap((p) => byPhone.get(p) || []))].filter((x) => x.id !== c.id);
      const known = parts.flatMap((p) => knownPhones[p] || []).filter((k) => k.studentId !== c.enrolled?.studentId);
      if (dups.length) w.phone = { text: `SĐT trùng với: ${listNames(dups)}.`, tone: 'dup' };
      else if (known.length) {
        w.phone = { text: `SĐT này là phụ huynh của học sinh đang học: ${known.map((k) => `${k.studentName} (lớp ${k.className})`).join(', ')}.`, tone: 'known' };
      }
    }
    const badId = idProblem(c.idNumber);
    if (badId) w.idNumber = { text: badId, tone: 'error' };
    else if (c.idNumber) {
      const dups = (byId.get(c.idNumber) || []).filter((x) => x.id !== c.id);
      if (dups.length) w.idNumber = { text: `CCCD trùng với: ${listNames(dups)}.`, tone: 'dup' };
    }
    if (w.phone || w.idNumber) out.set(c.id, w);
  }
  return out;
}

// ---------- Trạng thái ----------

/** Tất cả trạng thái (cố định + tự thêm) */
export const allStatuses = (custom = []) => [...FIXED_STATUSES, ...custom.map((s) => ({ ...s, fixed: false }))];

/** Màu nhãn của một trạng thái ('' = không có trạng thái) */
export function statusColor(name, statuses) {
  if (!name) return '';
  return statuses.find((s) => s.name === name)?.color || 'gray';
}

/**
 * Các lựa chọn trong ô trạng thái khi đang gõ: trạng thái khớp chữ đã gõ, rồi "Thêm trạng thái mới" nếu chưa có.
 * Trả [{ kind: 'status' | 'new' | 'clear', name, color? }]
 */
export function statusOptions(statuses, text) {
  const t = fold(text);
  const exactText = String(text ?? '').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
  /**
   * Khớp càng sát càng lên trước (số nhỏ): đúng cả dấu trước, rồi mới tới bỏ dấu; đầu tên > cả một từ > đầu một từ > giữa từ.
   * Ví dụ gõ "chờ" thì "Đang chờ chốt" (đúng dấu) đứng trước "Đã chốt" ("chốt" chỉ giống khi bỏ dấu).
   */
  const rank = (name) => {
    const score = (n, q, base) => {
      if (!q || !n.includes(q)) return null;
      const words = n.split(' ');
      if (n.startsWith(q)) return base;
      if (words.includes(q)) return base + 1;
      if (words.some((w) => w.startsWith(q))) return base + 2;
      return base + 3;
    };
    return score(name.toLocaleLowerCase('vi'), exactText, 0) ?? score(fold(name), t, 4) ?? 8;
  };
  // sort của JS giữ nguyên thứ tự các mục khớp ngang nhau
  const list = statuses
    .filter((s) => !t || fold(s.name).includes(t))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((s) => ({ kind: 'status', name: s.name, color: s.color }));
  const exact = statuses.some((s) => fold(s.name) === t);
  if (t && !exact) list.push({ kind: 'new', name: String(text).replace(/\s+/g, ' ').trim().slice(0, 30) });
  if (!t) list.push({ kind: 'clear', name: '' });
  return list;
}

// ---------- Lọc, tìm, sắp xếp ----------

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

/** Khách hàng có khớp ô tìm kiếm không (không phân biệt dấu; gõ số thì tìm theo SĐT / CCCD) */
export function matchesSearch(c, query) {
  const q = fold(query);
  if (!q) return true;
  const qDigits = digitsOf(query);
  if (qDigits.length >= 3 && qDigits.length === q.replace(/[\s.\-+]/g, '').length) {
    return digitsOf(c.phone).includes(qDigits) || digitsOf(c.idNumber).includes(qDigits);
  }
  return [c.studentName, c.parentName, c.staff, c.status, c.note, c.phone, c.idNumber, c.enrolled?.className]
    .some((v) => fold(v).includes(q));
}

/** Hẹn gọi lại đã tới (hôm nay hoặc đã quá hẹn) */
export const followUpDue = (c, today) => Boolean(c.followUp) && c.followUp <= today;

/** Tên tiếng Việt xếp theo chữ cuối (tên) rồi tới cả họ tên — như sổ điểm danh */
const nameKey = (s) => {
  const words = String(s || '').trim().split(/\s+/);
  return `${words.at(-1)} ${words.join(' ')}`;
};
const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

/**
 * So sánh 2 khách hàng theo cột `key`, dir: 'asc' | 'desc'. Ô trống luôn xếp cuối.
 * Mặc định (Ngày CSKH): cùng ngày thì khách thêm sau lên trước.
 */
export function compareContacts(a, b, key, dir) {
  const col = COLUMNS.find((c) => c.key === key) || COLUMNS[4];
  const va = a[col.key];
  const vb = b[col.key];
  const ea = isBlank(va);
  const eb = isBlank(vb);
  if (ea !== eb) return ea ? 1 : -1;
  let r = 0;
  if (!ea) {
    if (col.type === 'money') r = va - vb;
    else if (col.type === 'date') r = va < vb ? -1 : va > vb ? 1 : 0;
    else if (key === 'studentName' || key === 'parentName') r = collator.compare(nameKey(va), nameKey(vb));
    else r = collator.compare(String(va), String(vb));
  }
  if (r === 0) r = (a.id > 0 ? a.id : 1e12 - a.id) - (b.id > 0 ? b.id : 1e12 - b.id);
  return dir === 'desc' ? -r : r;
}

/**
 * Danh sách id khách hàng hiện trên bảng theo bộ lọc + sắp xếp.
 * filter: { status: '' (tất cả) | tên trạng thái | NO_STATUS, followUp: bool, search }, sort: { key, dir }
 */
export function computeView(contacts, filter, sort, today) {
  return contacts
    .filter((c) => {
      if (filter.status === NO_STATUS ? c.status : filter.status && c.status !== filter.status) return false;
      if (filter.followUp && !followUpDue(c, today)) return false;
      return matchesSearch(c, filter.search);
    })
    .sort((a, b) => compareContacts(a, b, sort.key, sort.dir))
    .map((c) => c.id);
}

// ---------- Chép / dán kiểu Excel ----------

/** Các ô -> chữ chép ra bộ nhớ tạm: cột cách nhau Tab, dòng cách nhau xuống dòng; ô có Tab / xuống dòng / " thì bọc "" */
export function toTsv(rows) {
  return rows
    .map((cells) => cells.map((v) => {
      const s = String(v ?? '');
      return /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join('\t'))
    .join('\r\n');
}

/** Chữ dán vào (từ Excel / Google Trang tính / Word...) -> mảng các dòng, mỗi dòng là mảng ô */
export function parseTsv(text) {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let i = 0;
  const readPlain = (from) => {
    let k = from;
    while (k < s.length && s[k] !== '\t' && s[k] !== '\n') k += 1;
    return [s.slice(from, k), k];
  };
  while (i <= s.length) {
    let cell;
    if (s[i] === '"') {
      // Ô bọc trong "" (Excel làm vậy khi ô có xuống dòng): "" bên trong = một dấu "
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        buf += s[j];
        j += 1;
      }
      if (closed && (j >= s.length || s[j] === '\t' || s[j] === '\n')) [cell, i] = [buf, j];
      else [cell, i] = readPlain(i); // chữ tình cờ bắt đầu bằng dấu " -> đọc như chữ thường
    } else {
      [cell, i] = readPlain(i);
    }
    row.push(cell);
    if (i >= s.length) {
      rows.push(row);
      break;
    }
    if (s[i] === '\t') {
      i += 1;
      continue;
    }
    rows.push(row); // xuống dòng
    row = [];
    i += 1;
    if (i === s.length) break;
  }
  while (rows.length && rows.at(-1).every((c) => c.trim() === '')) rows.pop();
  return rows;
}

// Tên cột hay gặp trong file Excel CSKH (đã bỏ dấu, chữ thường) -> cột của bảng
const HEADER_EXACT = {
  studentName: ['hoc sinh', 'ten hoc sinh', 'ho ten', 'ho va ten', 'ho ten hoc sinh', 'ten hs', 'hs', 'ho ten hs', 'hoc vien', 'ten hoc vien', 'ten be', 'ten con', 'student', 'name', 'khach hang', 'ten khach hang'],
  parentName: ['phu huynh', 'ten phu huynh', 'ho ten phu huynh', 'ph', 'ten ph', 'bo me', 'ten bo me', 'parent', 'nguoi lien he'],
  phone: ['sdt', 'so dien thoai', 'dien thoai', 'sdt phu huynh', 'so dt', 'dt', 'phone', 'zalo'],
  idNumber: ['cccd', 'cmnd', 'can cuoc', 'cccd phu huynh', 'so cccd', 'cccd/cmnd', 'cmnd/cccd'],
  contactDate: ['ngay cskh', 'ngay', 'ngay lien he', 'ngay goi', 'ngay tu van', 'ngay cham soc', 'date', 'thoi gian'],
  staff: ['nhan vien cskh', 'nhan vien', 'nv', 'nv cskh', 'nguoi cham soc', 'nguoi phu trach', 'sale', 'tu van vien', 'nguoi tu van'],
  status: ['trang thai', 'tinh trang', 'ket qua', 'status'],
  tuition: ['hoc phi', 'so tien', 'gia', 'phi', 'tien', 'hoc phi du kien'],
  followUp: ['hen goi lai', 'ngay hen', 'hen', 'goi lai', 'lich hen', 'follow up'],
  note: ['ghi chu', 'note', 'nhan xet', 'noi dung', 'mo ta', 'chi tiet'],
};
// Không khớp hẳn thì đoán theo từ có trong tên cột (theo thứ tự)
const HEADER_GUESS = [
  ['idNumber', /cccd|cmnd|can cuoc/],
  ['phone', /sdt|dien thoai|so dt|zalo/],
  ['followUp', /\bhen\b|goi lai/],
  ['contactDate', /\bngay\b/],
  ['status', /trang thai|tinh trang|ket qua/],
  ['tuition', /hoc phi|\btien\b/],
  ['staff', /nhan vien|cham soc|tu van/],
  ['note', /ghi chu|\bnote\b/],
  ['parentName', /phu huynh|bo me|\bme\b|\bbo\b/],
  ['studentName', /hoc sinh|ho ten|hoc vien|\bten\b/],
];

/** Tên cột -> cột của bảng (null = không biết) */
export function guessField(header) {
  const h = fold(header).replace(/[:*]/g, '').trim();
  if (!h) return null;
  for (const [key, names] of Object.entries(HEADER_EXACT)) if (names.includes(h)) return key;
  for (const [key, re] of HEADER_GUESS) if (re.test(h)) return key;
  return null;
}

/**
 * Dòng đầu tiên dán vào có phải dòng tên cột không (ví dụ chép cả bảng Excel kèm dòng tiêu đề).
 * Trả mảng cột của bảng cho từng cột dán vào (null = bỏ qua), hoặc null nếu không phải dòng tên cột.
 */
export function detectHeader(rows) {
  const first = rows[0];
  if (!first || rows.length < 1) return null;
  // Dòng tên cột không có số điện thoại / ngày tháng
  if (first.some((c) => /\d{6,}|\d{1,2}\/\d{1,2}/.test(c))) return null;
  const used = new Set();
  const mapping = first.map((h) => {
    const key = guessField(h);
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
  return used.size >= 2 ? mapping : null;
}

/**
 * Một dòng dán vào -> dữ liệu khách hàng gửi lên server.
 * mapping: cột của bảng cho từng ô (null = bỏ qua). Ngày / học phí không đọc được thì ghi vào Ghi chú (không mất dữ liệu).
 * Trả { contact, warnings: [chữ] }
 */
export function rowToContact(cells, mapping, today) {
  const contact = {};
  const extra = [];
  const warnings = [];
  mapping.forEach((key, i) => {
    const raw = String(cells[i] ?? '').trim();
    if (!key || !raw) return;
    const col = COLUMNS.find((c) => c.key === key);
    const r = parseCellInput(col, raw, today);
    if (r.error) {
      extra.push(`${col.label}: ${raw}`);
      warnings.push(`${col.label} "${raw}" không đọc được, đã ghi vào Ghi chú`);
    } else if (key === 'note' && contact.note) contact.note += `\n${r.value}`;
    else contact[key] = r.value;
  });
  if (extra.length) contact.note = [contact.note, ...extra].filter(Boolean).join('\n');
  return { contact, warnings };
}

/** "Dòng 5" -> chỉ số cột kiểu Excel: 0 -> "A" */
export const cellAddress = (r, c) => `${COLUMNS[c]?.letter || ''}${r}`;
