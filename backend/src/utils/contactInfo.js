// Chuẩn hóa SĐT / số CCCD — dùng chung cho học sinh của lớp (routes/classes.js) và bảng CSKH (routes/crm.js).

/**
 * SĐT: di động 10 số bắt đầu bằng 0 (đã chốt); nhận thêm số máy bàn 11 số (02x…).
 * Chấp nhận dấu cách / chấm / gạch, đầu +84 hoặc 84, và số bị Excel làm mất số 0 ở đầu. '' nếu trống, null nếu sai.
 */
function cleanPhone(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  let d = raw.replace(/[\s.()-]/g, '');
  if (/^\+?84\d{9,10}$/.test(d)) d = `0${d.replace(/^\+?84/, '')}`;
  if (/^[1-9]\d{8}$/.test(d) || /^2\d{9}$/.test(d)) d = `0${d}`;
  return /^0\d{9}$/.test(d) || /^02\d{9}$/.test(d) ? d : null;
}

/** CCCD (12 số) hoặc CMND cũ (9 số); 11 số = CCCD bị Excel làm mất số 0 ở đầu. '' nếu trống, null nếu sai. */
function cleanIdNumber(v) {
  let raw = String(v ?? '').replace(/[\s.-]/g, '');
  if (!raw) return '';
  if (/^\d{11}$/.test(raw)) raw = `0${raw}`;
  return /^(\d{9}|\d{12})$/.test(raw) ? raw : null;
}

module.exports = { cleanPhone, cleanIdNumber };
