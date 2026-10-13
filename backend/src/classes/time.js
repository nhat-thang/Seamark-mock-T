// Ngày giờ theo giờ Việt Nam (UTC+7, không có giờ mùa hè) cho thời khóa biểu.
// Ngày dạng "YYYY-MM-DD", giờ dạng "HH:MM". Thời điểm lưu trong database dạng ISO (UTC).

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ngày hôm nay (hoặc của thời điểm `instant`) theo giờ Việt Nam */
function vnDate(instant = Date.now()) {
  return new Date(instant + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Giờ:phút theo giờ Việt Nam của một thời điểm */
function vnTime(instant = Date.now()) {
  return new Date(instant + VN_OFFSET_MS).toISOString().slice(11, 16);
}

function isValidDate(s) {
  if (!DATE_RE.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // Loại ngày không có thật như 2026-02-30 (Date tự chuyển thành 02/03)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isValidTime = (s) => TIME_RE.test(s || '');

/** "2026-10-13" + "18:00" (giờ VN) -> chuỗi ISO UTC */
function toInstant(date, time) {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Thứ trong tuần: 1 = Thứ 2 … 6 = Thứ 7, 7 = Chủ nhật */
function weekdayOf(date) {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Số ngày từ a tới b (b - a) */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

const WEEKDAY_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_LONG = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/** "2026-10-13" -> "13/10/2026" */
function formatDate(date) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = {
  DAY_MS,
  vnDate,
  vnTime,
  isValidDate,
  isValidTime,
  toInstant,
  addDays,
  weekdayOf,
  daysBetween,
  formatDate,
  WEEKDAY_SHORT,
  WEEKDAY_LONG,
};
