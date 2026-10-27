// Chuyển các lịch "Lặp lại hằng tuần ... đến ngày" (cách cũ) đang chạy thành lịch hằng tuần lặp lại mãi (bảng class_weekly),
// để khi cập nhật web, owner KHÔNG phải xếp lại lịch cho từng lớp. Chạy một lần (như các file migration khác).
//
// - Chỉ chuyển lịch còn buổi từ hôm nay trở đi, của lớp chưa xóa / chưa khóa. Lịch đã hết thì coi như lớp đã kết thúc.
// - Thứ + giờ lấy theo các buổi trong 14 ngày cuối của lịch (lịch có thể đã bị sửa giờ giữa chừng: lấy giờ mới nhất).
// - Giáo viên, phòng học lấy theo buổi cuối cùng của lịch.
// - Một lớp có nhiều lịch cũ trùng thứ + giờ (ví dụ hết hạn rồi xếp tiếp bằng lịch mới) thì chỉ giữ lịch mới nhất.
// - Lớp xếp TỪNG BUỔI (không có lịch lặp lại): thứ + giờ nào có ít nhất 2 buổi trong 4 tuần cuối của lớp thì coi là lịch
//   cố định (buổi học bù lẻ chỉ có 1 lần nên không bị tính). Các buổi sắp tới khớp lịch đó được gom vào lịch mới.
// - Không tạo buổi nào ở đây: filled_until = ngày cuối của lịch cũ, server khởi động xong tự xếp nối từ ngày đó.
const crypto = require('crypto');
const { vnDate, addDays, weekdayOf, WEEKDAY_SHORT } = require('../../classes/time');

module.exports = function convertOldSeries(db, { log = () => {} } = {}) {
  const today = vnDate();
  const series = db
    .prepare(
      `SELECT s.series_id, s.class_id, MAX(s.date) AS last_date
         FROM class_sessions s JOIN classes c ON c.id = s.class_id
        WHERE s.series_id IS NOT NULL AND c.deleted_at IS NULL AND c.closed_at IS NULL
          AND s.series_id NOT IN (SELECT series_id FROM class_weekly)
        GROUP BY s.series_id
       HAVING MAX(s.date) >= ?
        ORDER BY MAX(s.date) DESC, MAX(s.id) DESC`
    )
    .all(today);

  const insert = db.prepare(
    `INSERT INTO class_weekly (class_id, series_id, slots, teacher_ids, teacher_name, room, filled_until, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const taken = new Map(); // id lớp -> các khung giờ đã chuyển
  const now = new Date().toISOString();
  let count = 0;
  for (const sr of series) {
    const recent = db
      .prepare('SELECT * FROM class_sessions WHERE series_id = ? AND date > ? ORDER BY starts_at, id')
      .all(sr.series_id, addDays(sr.last_date, -14));
    // Mỗi thứ: giờ của buổi gần nhất
    const byDay = new Map();
    for (const s of recent) byDay.set(weekdayOf(s.date), { weekday: weekdayOf(s.date), startTime: s.start_time, endTime: s.end_time });
    const used = taken.get(sr.class_id) || [];
    const slots = [...byDay.values()]
      .filter((x) => !used.some((u) => u.weekday === x.weekday && u.startTime < x.endTime && u.endTime > x.startTime))
      .sort((a, b) => a.weekday - b.weekday);
    if (slots.length === 0) continue;
    taken.set(sr.class_id, [...used, ...slots]);

    const last = recent.at(-1);
    const teacherIds = db.prepare('SELECT admin_id FROM session_teachers WHERE session_id = ? ORDER BY admin_id').all(last.id).map((r) => r.admin_id);
    insert.run(sr.class_id, sr.series_id, JSON.stringify(slots), JSON.stringify(teacherIds), last.teacher_name, last.room,
      sr.last_date, last.created_by, now, now);
    count += 1;
    log(`[migration] Lớp #${sr.class_id}: lịch ${slots.map((x) => `${WEEKDAY_SHORT[x.weekday]} ${x.startTime}–${x.endTime}`).join(', ')} -> lặp lại mãi`);
  }

  // Lớp xếp từng buổi: đoán lịch cố định từ 4 tuần cuối
  const loose = db
    .prepare(
      `SELECT c.id AS class_id, MAX(s.date) AS last_date FROM classes c JOIN class_sessions s ON s.class_id = c.id
        WHERE c.deleted_at IS NULL AND c.closed_at IS NULL
          AND c.id NOT IN (SELECT class_id FROM class_weekly WHERE stopped_at IS NULL)
        GROUP BY c.id HAVING MAX(s.date) >= ?`
    )
    .all(today);
  for (const cl of loose) {
    const recent = db
      .prepare('SELECT * FROM class_sessions WHERE class_id = ? AND date > ? ORDER BY starts_at, id')
      .all(cl.class_id, addDays(cl.last_date, -28));
    const groups = new Map(); // "thứ|giờ bắt đầu|giờ kết thúc" -> các buổi
    for (const s of recent) {
      const key = `${weekdayOf(s.date)}|${s.start_time}|${s.end_time}`;
      groups.set(key, [...(groups.get(key) || []), s]);
    }
    const slots = [];
    const members = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const [weekday, startTime, endTime] = key.split('|');
      const x = { weekday: Number(weekday), startTime, endTime };
      if (slots.some((u) => u.weekday === x.weekday && u.startTime < x.endTime && u.endTime > x.startTime)) continue;
      slots.push(x);
      members.push(...list);
    }
    if (slots.length === 0) continue;
    slots.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

    const last = members.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).at(-1);
    const seriesId = crypto.randomBytes(8).toString('hex');
    const teacherIds = db.prepare('SELECT admin_id FROM session_teachers WHERE session_id = ? ORDER BY admin_id').all(last.id).map((r) => r.admin_id);
    insert.run(cl.class_id, seriesId, JSON.stringify(slots), JSON.stringify(teacherIds), last.teacher_name, last.room,
      cl.last_date, last.created_by, now, now);
    // Gom các buổi sắp tới khớp lịch vào lịch mới (để sửa / xóa "buổi này và các buổi sau" được)
    const join = db.prepare('UPDATE class_sessions SET series_id = ? WHERE id = ?');
    const upcoming = db.prepare('SELECT * FROM class_sessions WHERE class_id = ? AND date >= ? AND series_id IS NULL').all(cl.class_id, today);
    for (const s of upcoming) {
      if (slots.some((x) => x.weekday === weekdayOf(s.date) && x.startTime === s.start_time && x.endTime === s.end_time)) join.run(seriesId, s.id);
    }
    count += 1;
    log(`[migration] Lớp #${cl.class_id} (xếp từng buổi): lịch ${slots.map((x) => `${WEEKDAY_SHORT[x.weekday]} ${x.startTime}–${x.endTime}`).join(', ')} -> lặp lại mãi`);
  }
  log(`[migration] Đã chuyển ${count} lịch lặp lại cũ thành lịch hằng tuần (lặp lại mãi).`);
};
