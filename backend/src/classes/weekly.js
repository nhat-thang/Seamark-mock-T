// Lịch học hằng tuần của lớp: lặp lại mãi cho tới khi admin chính khóa lớp.
// Mỗi lịch (bảng class_weekly) = các thứ trong tuần, mỗi thứ một khung giờ riêng, cùng giáo viên + phòng.
// Server xếp sẵn các buổi trong AHEAD_DAYS ngày tới (để tính học phí, hạn đóng) và mỗi ngày xếp nối thêm.
// Chỉ xếp buổi CHƯA diễn ra; buổi bị xóa lẻ (ví dụ nghỉ lễ) không bị xếp lại vì đã qua filled_until.
const { vnDate, toInstant, addDays, weekdayOf, WEEKDAY_SHORT } = require('./time');
const { addClassTeachers } = require('./access');

const AHEAD_DAYS = 183; // xếp sẵn khoảng 6 tháng tới

const parseJson = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

/** Dòng class_weekly -> { id, classId, seriesId, slots, teacherIds, teacherName, room, ... } */
function toWeekly(row) {
  return {
    id: row.id,
    classId: row.class_id,
    seriesId: row.series_id,
    slots: parseJson(row.slots, []),
    teacherIds: parseJson(row.teacher_ids, []),
    teacherName: row.teacher_name,
    room: row.room,
    filledUntil: row.filled_until,
    stoppedAt: row.stopped_at,
  };
}

/** "T3 17:00–18:30, T6 18:00–19:30" */
function describeSlots(slots) {
  return [...slots]
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}–${s.endTime}`)
    .join(', ');
}

/** Các buổi sẽ có của lịch trong khoảng ngày [from, until], bỏ buổi đã bắt đầu trước `now` */
function datesOf(slots, from, until, now) {
  const out = [];
  for (let d = from; d <= until; d = addDays(d, 1)) {
    for (const s of slots) {
      if (s.weekday !== weekdayOf(d)) continue;
      const startsAt = toInstant(d, s.startTime);
      if (Date.parse(startsAt) <= now) continue;
      out.push({ date: d, startTime: s.startTime, endTime: s.endTime, startsAt, endsAt: toInstant(d, s.endTime) });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Ngày cuối cùng cần xếp tới (tính từ hôm nay) */
const horizon = (now) => addDays(vnDate(now), AHEAD_DAYS);

/** Ghi các buổi của một lịch vào thời khóa biểu. Trả về id các buổi vừa tạo. */
function insertSessions(db, w, list, createdBy, now) {
  const insert = db.prepare(
    `INSERT INTO class_sessions (class_id, date, start_time, end_time, starts_at, ends_at, teacher_admin_id, teacher_name,
                                 room, note, series_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`
  );
  const addTeacher = db.prepare('INSERT OR IGNORE INTO session_teachers (session_id, admin_id) VALUES (?, ?)');
  const iso = new Date(now).toISOString();
  const ids = list.map((x) => {
    const id = insert.run(w.classId, x.date, x.startTime, x.endTime, x.startsAt, x.endsAt, w.teacherIds[0] ?? null, w.teacherName,
      w.room, w.seriesId, createdBy, iso, iso).lastInsertRowid;
    for (const t of w.teacherIds) addTeacher.run(id, t);
    return id;
  });
  addClassTeachers(db, w.classId, w.teacherIds);
  return ids;
}

/**
 * Xếp nối thêm buổi cho mọi lịch hằng tuần đang chạy (lớp chưa xóa, chưa khóa) tới AHEAD_DAYS ngày tới.
 * Gọi lúc server khởi động và định kỳ. Trả về số buổi đã tạo thêm.
 */
function fillWeekly(db, now = Date.now()) {
  const until = horizon(now);
  const rows = db
    .prepare(
      `SELECT w.* FROM class_weekly w JOIN classes c ON c.id = w.class_id
        WHERE w.stopped_at IS NULL AND c.deleted_at IS NULL AND c.closed_at IS NULL AND w.filled_until < ?`
    )
    .all(until);
  let count = 0;
  for (const row of rows) {
    const w = toWeekly(row);
    // Giáo viên đã bị vô hiệu hóa thì không xếp tiếp cho họ
    w.teacherIds = w.teacherIds.filter((id) => db.prepare('SELECT 1 FROM admins WHERE id = ? AND is_active = 1').get(id));
    // Lớp bị xóa / khóa rồi mở lại: không xếp bù các ngày đã qua
    const today = vnDate(now);
    const from = w.filledUntil >= today ? addDays(w.filledUntil, 1) : today;
    db.transaction(() => {
      count += insertSessions(db, w, datesOf(w.slots, from, until, now), row.created_by, now).length;
      db.prepare('UPDATE class_weekly SET filled_until = ?, updated_at = ? WHERE id = ?').run(until, new Date(now).toISOString(), w.id);
    })();
  }
  return count;
}

/** Lịch hằng tuần đang chạy của một lớp */
function activeWeekly(db, classId) {
  return db.prepare('SELECT * FROM class_weekly WHERE class_id = ? AND stopped_at IS NULL ORDER BY id').all(classId).map(toWeekly);
}

/** Lịch hằng tuần (đang chạy) mà buổi học thuộc về, hoặc null */
function weeklyOfSeries(db, seriesId) {
  if (!seriesId) return null;
  const row = db.prepare('SELECT * FROM class_weekly WHERE series_id = ? AND stopped_at IS NULL').get(seriesId);
  return row ? toWeekly(row) : null;
}

module.exports = { AHEAD_DAYS, toWeekly, describeSlots, datesOf, horizon, insertSessions, fillWeekly, activeWeekly, weeklyOfSeries };
