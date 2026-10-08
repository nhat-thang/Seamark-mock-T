// Hàm dùng chung cho các trang danh sách: lọc theo ngày (giờ Việt Nam) và phân trang.

const PAGE_SIZE = 30;

// Ngày lọc "YYYY-MM-DD" tính theo giờ Việt Nam -> thời điểm UTC để so sánh trong database
function vnDayStart(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
  const d = new Date(`${day}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function vnDayEnd(day) {
  const start = vnDayStart(day);
  return start ? new Date(Date.parse(start) + 24 * 3600 * 1000).toISOString() : null;
}

/** Chạy truy vấn có điều kiện WHERE + phân trang. */
function paginate(db, { select, from, where, params, orderBy, page }) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${whereSql}`).get(...params).n;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
  const rows = db
    .prepare(`${select} ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (current - 1) * PAGE_SIZE);
  return { rows, page: current, totalPages, total };
}

/** Thêm điều kiện lọc theo khoảng ngày (from, to) cho cột `column`. */
function addDateFilter(query, column, where, params) {
  const from = vnDayStart(query.from);
  const to = vnDayEnd(query.to);
  if (from) { where.push(`${column} >= ?`); params.push(from); }
  if (to) { where.push(`${column} < ?`); params.push(to); }
}

module.exports = { PAGE_SIZE, vnDayStart, vnDayEnd, paginate, addDateFilter };
