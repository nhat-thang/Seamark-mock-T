// API thời khóa biểu + buổi học + điểm danh (requireAdmin gắn ở app.js).
//   GET  /api/admin/schedule/teachers        danh sách giáo viên (tài khoản đang hoạt động)
//   GET  /api/admin/schedule/overview        dữ liệu trang chính: lịch dạy của tôi, buổi chưa điểm danh, nhắc học phí
//   GET  /api/admin/schedule?from&to         các buổi học trong khoảng ngày (lọc classId, teacherId, mine=1)
//   POST /api/admin/schedule                 xếp lịch (CHỈ admin chính), có "lặp lại hằng tuần"
//   GET  /api/admin/schedule/:id             chi tiết buổi học + danh sách điểm danh (giáo viên của buổi / admin chính)
//   POST /api/admin/schedule/:id/update      sửa lịch (CHỈ admin chính): buổi này hoặc cả các buổi sau
//   POST /api/admin/schedule/:id/delete      xóa buổi (CHỈ admin chính): buổi này hoặc cả các buổi sau
//   POST /api/admin/schedule/:id/start       giáo viên bấm "Bắt đầu buổi học" (từ 30 phút trước giờ học)
//   POST /api/admin/schedule/:id/attendance  lưu điểm danh + điểm cộng
const crypto = require('crypto');
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const time = require('../classes/time');
const { sessionPermissions, describeSession } = require('../classes/rules');
const { loadRoster, feeReminders } = require('../classes/students');
const { SESSION_SELECT, teacherName, toSession, findSession, notify } = require('../classes/sessions');

const { vnDate, isValidDate, isValidTime, toInstant, addDays, weekdayOf, daysBetween, formatDate, WEEKDAY_SHORT } = time;

const STATUSES = ['present', 'late', 'excused', 'absent'];
const STATUS_LABELS = { present: 'Có mặt', late: 'Đi muộn', excused: 'Vắng có phép', absent: 'Vắng không phép' };
const MAX_BONUS = 50;
const MAX_SESSIONS_PER_REQUEST = 300; // "lặp lại hằng tuần" tối đa ~ 1 năm, 6 buổi / tuần
const MAX_RANGE_DAYS = 62; // xem tối đa 2 tháng một lần

const nowIso = () => new Date().toISOString();
const toInt = (v) => Number.parseInt(v, 10);
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function scheduleRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  const isOwner = (req) => req.admin.role === 'owner';
  function ownerOnly(req, res) {
    if (isOwner(req)) return true;
    res.status(403).json({ error: 'Chỉ admin chính mới xếp và sửa thời khóa biểu được.' });
    return false;
  }

  const activeTeacher = (id) => db.prepare('SELECT id, display_name FROM admins WHERE id = ? AND is_active = 1').get(id);

  /**
   * Đọc giờ học + giáo viên từ dữ liệu gửi lên. Bắt buộc chọn giáo viên:
   * teacherId = id tài khoản, hoặc để trống teacherId và gõ teacherName ("Khác").
   */
  function readSlot(body) {
    const startTime = String(body?.startTime || '');
    const endTime = String(body?.endTime || '');
    if (!isValidTime(startTime) || !isValidTime(endTime)) return { error: 'Vui lòng chọn giờ bắt đầu và giờ kết thúc.' };
    if (endTime <= startTime) return { error: 'Giờ kết thúc phải sau giờ bắt đầu (buổi học không kéo qua nửa đêm).' };

    let teacher = null;
    let otherName = '';
    if (body?.teacherId !== undefined && body?.teacherId !== null && body?.teacherId !== '') {
      teacher = activeTeacher(toInt(body.teacherId) || 0);
      if (!teacher) return { error: 'Giáo viên đã chọn không tồn tại hoặc tài khoản đã bị vô hiệu hóa.' };
    } else {
      otherName = cleanText(body?.teacherName, 60);
      if (!otherName) return { error: 'Vui lòng chọn giáo viên dạy buổi học (hoặc chọn "Khác" rồi gõ tên giáo viên).' };
    }
    return {
      value: {
        startTime,
        endTime,
        teacherId: teacher ? teacher.id : null,
        otherName,
        teacherName: teacher ? teacher.display_name : otherName,
        teacherLabel: teacher ? teacher.display_name : `${otherName} (giáo viên ngoài)`,
        room: cleanText(body?.room, 40),
        note: cleanText(body?.note, 200),
      },
    };
  }

  /**
   * Tìm buổi học trùng giờ: cùng lớp, hoặc cùng giáo viên (có tài khoản). Bỏ qua các buổi trong exceptIds.
   * Trả về danh sách câu mô tả để admin chính đọc và quyết định "Vẫn xếp".
   */
  function findConflicts({ classId, teacherId, dates, startTime, endTime, exceptIds = [] }) {
    const q = db.prepare(
      `${SESSION_SELECT}
        WHERE c.deleted_at IS NULL AND s.date = ? AND s.start_time < ? AND s.end_time > ?
          AND (s.class_id = ? OR (? IS NOT NULL AND s.teacher_admin_id = ?))`
    );
    const out = [];
    for (const date of dates) {
      for (const r of q.all(date, endTime, startTime, classId, teacherId, teacherId)) {
        if (exceptIds.includes(r.id)) continue;
        const who = r.class_id === classId ? `lớp "${r.class_name}" đã có buổi học` : `${teacherName(r)} đang dạy lớp "${r.class_name}"`;
        out.push(`${describeSession(r)}: ${who}`);
      }
    }
    return out;
  }

  function conflictResponse(res, conflicts) {
    return res.status(409).json({
      reason: 'conflict',
      error: 'Lịch bị trùng giờ với buổi học khác.',
      conflicts: conflicts.slice(0, 8),
      more: Math.max(0, conflicts.length - 8),
    });
  }

  /** Buổi học theo :id. Gửi lỗi 404 và trả null nếu không có. */
  function loadSession(req, res) {
    const s = findSession(db, toInt(req.params.id) || 0);
    if (!s) res.status(404).json({ error: 'Không tìm thấy buổi học (có thể đã bị xóa).' });
    return s;
  }

  /** Các buổi bị ảnh hưởng: chỉ buổi này, hoặc buổi này + các buổi sau trong cùng lịch lặp lại */
  function targetsOf(s, scope) {
    if (scope !== 'following' || !s.series_id) return [s];
    return db.prepare(`${SESSION_SELECT} WHERE s.series_id = ? AND s.date >= ? ORDER BY s.starts_at`).all(s.series_id, s.date);
  }

  /** Chi tiết buổi học + danh sách học sinh (kèm điểm danh đã lưu) */
  function sessionDetail(req, s) {
    const now = Date.now();
    const p = sessionPermissions(req.admin, s, now);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const marks = new Map(
      db.prepare('SELECT student_id, status, bonus FROM attendance WHERE session_id = ?').all(s.id).map((a) => [a.student_id, a])
    );
    const students = loadRoster(db, cls, s).map((st) => {
      const a = marks.get(st.id);
      return { ...st, attendance: a ? { status: a.status, bonus: a.bonus } : null };
    });
    const following = s.series_id
      ? db.prepare('SELECT COUNT(*) AS n FROM class_sessions WHERE series_id = ? AND date >= ?').get(s.series_id, s.date).n
      : 1;
    const by = (id) => (id ? db.prepare('SELECT display_name FROM admins WHERE id = ?').get(id)?.display_name ?? null : null);
    return {
      session: { ...toSession(s, req.admin, now), startedBy: by(s.started_by), attendanceBy: by(s.attendance_by), followingCount: following },
      class: { id: cls.id, name: cls.name, color: cls.color, feeEvery: cls.fee_every },
      permissions: { isOwner: p.isOwner, canStart: p.canStart, canEdit: p.canEdit, reason: p.reason },
      students,
    };
  }

  // ----- Danh sách -----

  router.get('/teachers', (req, res) => {
    const rows = db
      .prepare(`SELECT id, display_name, role FROM admins WHERE is_active = 1 ORDER BY (role = 'owner') DESC, display_name COLLATE NOCASE`)
      .all();
    res.json({ teachers: rows.map((r) => ({ id: r.id, displayName: r.display_name, role: r.role })) });
  });

  router.get('/overview', (req, res) => {
    const now = Date.now();
    const today = vnDate(now);
    const me = req.admin.id;
    const owner = isOwner(req);
    const list = (sql, ...params) => db.prepare(`${SESSION_SELECT} WHERE c.deleted_at IS NULL AND ${sql} ORDER BY s.starts_at`).all(...params).map((r) => toSession(r, req.admin, now));

    // Lịch dạy của tôi: từ đầu hôm nay tới hết 7 ngày tới
    const mySessions = list(
      's.teacher_admin_id = ? AND s.starts_at >= ? AND s.starts_at < ?',
      me, toInstant(today, '00:00'), toInstant(addDays(today, 7), '00:00')
    );
    // Buổi đã kết thúc mà chưa điểm danh (14 ngày gần đây).
    // Admin chính thấy của mọi giáo viên (để nhắc), admin thấy của mình.
    const since = new Date(now - 14 * time.DAY_MS).toISOString();
    const pending = owner
      ? list('s.attendance_at IS NULL AND s.ends_at <= ? AND s.starts_at >= ?', new Date(now).toISOString(), since)
      : list('s.teacher_admin_id = ? AND s.attendance_at IS NULL AND s.ends_at <= ? AND s.starts_at >= ?', me, new Date(now).toISOString(), since);
    // Admin chính: toàn bộ lịch hôm nay của trung tâm
    const todayAll = owner ? list('s.date = ?', today) : [];

    res.json({ today, mySessions, pending: pending.reverse(), todayAll, feeReminders: feeReminders(db).slice(0, 60) });
  });

  router.get('/', (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!isValidDate(from) || !isValidDate(to) || to < from) return res.status(400).json({ error: 'Khoảng ngày không hợp lệ.' });
    if (daysBetween(from, to) > MAX_RANGE_DAYS) return res.status(400).json({ error: `Mỗi lần chỉ xem tối đa ${MAX_RANGE_DAYS} ngày.` });

    const where = ['c.deleted_at IS NULL', 's.date >= ?', 's.date <= ?'];
    const params = [from, to];
    const classId = toInt(req.query.classId);
    if (classId) { where.push('s.class_id = ?'); params.push(classId); }
    if (req.query.mine === '1') {
      where.push('s.teacher_admin_id = ?');
      params.push(req.admin.id);
    } else if (req.query.teacherId === 'other') {
      where.push('s.teacher_admin_id IS NULL');
    } else if (toInt(req.query.teacherId)) {
      where.push('s.teacher_admin_id = ?');
      params.push(toInt(req.query.teacherId));
    }
    const rows = db.prepare(`${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.starts_at, c.name`).all(...params);
    const now = Date.now();
    res.json({ sessions: rows.map((r) => toSession(r, req.admin, now)) });
  });

  // ----- Xếp lịch (admin chính) -----

  router.post('/', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const body = req.body || {};
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND deleted_at IS NULL').get(toInt(body.classId) || 0);
    if (!cls) return res.status(400).json({ error: 'Vui lòng chọn lớp học.' });
    const date = String(body.date || '');
    if (!isValidDate(date)) return res.status(400).json({ error: 'Vui lòng chọn ngày học.' });
    const slot = readSlot(body);
    if (slot.error) return res.status(400).json({ error: slot.error });
    const v = slot.value;

    // Các ngày học: một ngày, hoặc lặp lại vào các thứ đã chọn tới ngày "until"
    let dates = [date];
    let repeatText = '';
    if (body.repeat) {
      const weekdays = [...new Set((Array.isArray(body.repeat.weekdays) ? body.repeat.weekdays : []).map(Number))].filter((d) => d >= 1 && d <= 7);
      const until = String(body.repeat.until || '');
      if (weekdays.length === 0) return res.status(400).json({ error: 'Vui lòng chọn ít nhất một thứ trong tuần để lặp lại.' });
      if (!isValidDate(until) || until < date) return res.status(400).json({ error: 'Ngày kết thúc lặp lại phải từ ngày bắt đầu trở về sau.' });
      if (daysBetween(date, until) > 370) return res.status(400).json({ error: 'Chỉ lặp lại được tối đa 1 năm. Hết năm thì xếp tiếp.' });
      dates = [];
      for (let d = date; d <= until; d = addDays(d, 1)) if (weekdays.includes(weekdayOf(d))) dates.push(d);
      if (dates.length === 0) return res.status(400).json({ error: 'Không có ngày nào khớp các thứ đã chọn trong khoảng ngày này.' });
      if (dates.length > MAX_SESSIONS_PER_REQUEST) return res.status(400).json({ error: `Mỗi lần xếp tối đa ${MAX_SESSIONS_PER_REQUEST} buổi.` });
      repeatText = `${weekdays.sort().map((d) => WEEKDAY_SHORT[d]).join(', ')} ${v.startTime}–${v.endTime}, từ ${formatDate(dates[0])} đến ${formatDate(dates.at(-1))}`;
    }

    if (!body.force) {
      const conflicts = findConflicts({ classId: cls.id, teacherId: v.teacherId, dates, startTime: v.startTime, endTime: v.endTime });
      if (conflicts.length) return conflictResponse(res, conflicts);
    }

    const now = nowIso();
    const seriesId = dates.length > 1 ? crypto.randomBytes(8).toString('hex') : null;
    const insert = db.prepare(
      `INSERT INTO class_sessions (class_id, date, start_time, end_time, starts_at, ends_at, teacher_admin_id, teacher_name,
                                   room, note, series_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ids = db.transaction(() =>
      dates.map((d) =>
        insert.run(cls.id, d, v.startTime, v.endTime, toInstant(d, v.startTime), toInstant(d, v.endTime), v.teacherId, v.otherName,
          v.room, v.note, seriesId, req.admin.id, now, now).lastInsertRowid
      )
    )();

    const what = dates.length > 1
      ? `${dates.length} buổi học lớp "${cls.name}": ${repeatText}`
      : `buổi học lớp "${cls.name}": ${describeSession({ date, start_time: v.startTime, end_time: v.endTime })}`;
    logAudit(db, { adminId: req.admin.id, action: 'create_sessions', classId: cls.id, detail: `Xếp ${what}, giáo viên ${v.teacherLabel}` });
    notify(db, {
      adminId: v.teacherId,
      actorId: req.admin.id,
      text: `${req.admin.displayName} đã xếp cho bạn ${what}`,
      link: dates.length > 1 ? `/admin/thoi-khoa-bieu?ngay=${dates[0]}` : `/admin/buoi-hoc/${ids[0]}`,
    });
    res.status(201).json({ ids, count: ids.length });
  });

  // ----- Một buổi học -----

  router.get('/:id', (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const p = sessionPermissions(req.admin, s);
    if (!p.canOpen) return res.status(403).json({ error: p.reason });
    res.json(sessionDetail(req, s));
  });

  router.post('/:id/update', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = loadSession(req, res);
    if (!s) return;
    const slot = readSlot(req.body);
    if (slot.error) return res.status(400).json({ error: slot.error });
    const v = slot.value;
    const targets = targetsOf(s, req.body?.scope);
    // Đổi ngày chỉ khi sửa riêng một buổi
    let newDate = s.date;
    if (targets.length === 1 && req.body?.date !== undefined) {
      newDate = String(req.body.date);
      if (!isValidDate(newDate)) return res.status(400).json({ error: 'Ngày học không hợp lệ.' });
    }
    const dateOf = (t) => (targets.length === 1 ? newDate : t.date);

    if (!req.body?.force) {
      const conflicts = findConflicts({
        classId: s.class_id, teacherId: v.teacherId, dates: [...new Set(targets.map(dateOf))],
        startTime: v.startTime, endTime: v.endTime, exceptIds: targets.map((t) => t.id),
      });
      if (conflicts.length) return conflictResponse(res, conflicts);
    }

    const update = db.prepare(
      `UPDATE class_sessions SET date = ?, start_time = ?, end_time = ?, starts_at = ?, ends_at = ?, teacher_admin_id = ?,
              teacher_name = ?, room = ?, note = ?, updated_at = ? WHERE id = ?`
    );
    const now = nowIso();
    db.transaction(() => {
      for (const t of targets) {
        const d = dateOf(t);
        update.run(d, v.startTime, v.endTime, toInstant(d, v.startTime), toInstant(d, v.endTime), v.teacherId, v.otherName, v.room, v.note, now, t.id);
      }
    })();

    // Mô tả thay đổi cho lịch sử + thông báo
    const changes = [];
    if (newDate !== s.date) changes.push(`ngày ${formatDate(s.date)} → ${formatDate(newDate)}`);
    if (s.start_time !== v.startTime || s.end_time !== v.endTime) changes.push(`giờ ${s.start_time}–${s.end_time} → ${v.startTime}–${v.endTime}`);
    const oldTeacher = teacherName(s);
    const newTeacher = v.teacherName;
    if (s.teacher_admin_id !== v.teacherId || (!v.teacherId && s.teacher_name !== v.otherName)) changes.push(`giáo viên ${oldTeacher} → ${newTeacher}`);
    if (s.room !== v.room) changes.push(`phòng "${s.room || 'trống'}" → "${v.room || 'trống'}"`);
    if (s.note !== v.note) changes.push('ghi chú');
    const which = targets.length > 1
      ? `${targets.length} buổi học lớp "${s.class_name}" (từ ${describeSession(s)} trở về sau)`
      : `buổi học lớp "${s.class_name}" ${describeSession(s)}`;
    if (changes.length) {
      logAudit(db, { adminId: req.admin.id, action: 'update_session', classId: s.class_id, detail: `Sửa ${which}: ${changes.join('; ')}` });
      const link = `/admin/buoi-hoc/${s.id}`;
      if (s.teacher_admin_id && s.teacher_admin_id !== v.teacherId) {
        notify(db, { adminId: s.teacher_admin_id, actorId: req.admin.id, text: `${req.admin.displayName} đã chuyển ${which} sang giáo viên ${newTeacher}. Bạn không còn dạy buổi này.`, link: '' });
      }
      if (v.teacherId) {
        const text = s.teacher_admin_id === v.teacherId
          ? `${req.admin.displayName} đã sửa lịch ${which}: ${changes.join('; ')}`
          : `${req.admin.displayName} đã xếp cho bạn ${which}${changes.length ? ` (${changes.join('; ')})` : ''}`;
        notify(db, { adminId: v.teacherId, actorId: req.admin.id, text, link });
      }
    }
    res.json(sessionDetail(req, findSession(db, s.id)));
  });

  router.post('/:id/delete', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = loadSession(req, res);
    if (!s) return;
    const targets = targetsOf(s, req.body?.scope);
    const withAttendance = targets.filter((t) => t.attendance_at).length;
    // Xóa buổi đã điểm danh làm mất điểm danh và thay đổi số buổi tính học phí -> phải xác nhận thêm
    if (withAttendance && !req.body?.confirmAttendance) {
      return res.status(409).json({
        reason: 'has_attendance',
        count: withAttendance,
        error: `Có ${withAttendance} buổi đã điểm danh. Xóa thì mất điểm danh của các buổi đó và số buổi tính học phí của học sinh sẽ giảm.`,
      });
    }
    const del = db.prepare('DELETE FROM class_sessions WHERE id = ?');
    db.transaction(() => targets.forEach((t) => del.run(t.id)))();

    const which = targets.length > 1
      ? `${targets.length} buổi học lớp "${s.class_name}" (từ ${describeSession(s)} trở về sau)`
      : `buổi học lớp "${s.class_name}" ${describeSession(s)}`;
    logAudit(db, {
      adminId: req.admin.id, action: 'delete_session', classId: s.class_id,
      detail: `Xóa ${which}${withAttendance ? ` (gồm ${withAttendance} buổi đã điểm danh)` : ''}`,
    });
    // Báo cho các giáo viên có buổi chưa diễn ra bị xóa
    const nowMs = Date.now();
    const teachers = new Set(targets.filter((t) => t.teacher_admin_id && Date.parse(t.ends_at) > nowMs).map((t) => t.teacher_admin_id));
    for (const id of teachers) notify(db, { adminId: id, actorId: req.admin.id, text: `${req.admin.displayName} đã xóa ${which} khỏi thời khóa biểu.` });
    res.json({ deleted: targets.length });
  });

  // ----- Dạy học: bắt đầu + điểm danh -----

  router.post('/:id/start', (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const p = sessionPermissions(req.admin, s);
    if (!p.canStart) return res.status(p.canOpen ? 400 : 403).json({ error: p.reason });
    if (!s.started_at) {
      db.prepare('UPDATE class_sessions SET started_at = ?, started_by = ? WHERE id = ?').run(nowIso(), req.admin.id, s.id);
      logAudit(db, {
        adminId: req.admin.id, action: 'start_session', classId: s.class_id,
        detail: `Bắt đầu buổi học lớp "${s.class_name}" ${describeSession(s)} lúc ${time.vnTime()}`,
      });
    }
    res.json(sessionDetail(req, findSession(db, s.id)));
  });

  // records: [{ studentId, status: present|late|excused|absent, bonus: 0..50 }]
  router.post('/:id/attendance', (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const p = sessionPermissions(req.admin, s);
    if (!p.canEdit) return res.status(p.canOpen ? 400 : 403).json({ error: p.reason });

    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    if (records.length === 0) return res.status(400).json({ error: 'Chưa có học sinh nào được điểm danh.' });
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const roster = new Map(loadRoster(db, cls, s).map((st) => [st.id, st]));
    const clean = [];
    const seen = new Set();
    for (const r of records) {
      const st = roster.get(toInt(r?.studentId));
      if (!st) return res.status(400).json({ error: 'Danh sách học sinh đã thay đổi. Vui lòng tải lại trang rồi điểm danh lại.' });
      if (seen.has(st.id)) continue;
      seen.add(st.id);
      if (!STATUSES.includes(r.status)) return res.status(400).json({ error: `Chưa chọn trạng thái điểm danh cho "${st.fullName}".` });
      const bonus = r.bonus === undefined || r.bonus === null || r.bonus === '' ? 0 : toInt(r.bonus);
      if (!Number.isInteger(bonus) || bonus < 0 || bonus > MAX_BONUS) {
        return res.status(400).json({ error: `Điểm cộng của "${st.fullName}" phải từ 0 đến ${MAX_BONUS}.` });
      }
      clean.push({ st, status: r.status, bonus });
    }

    const old = new Map(db.prepare('SELECT student_id, status, bonus FROM attendance WHERE session_id = ?').all(s.id).map((a) => [a.student_id, a]));
    const now = nowIso();
    const upsert = db.prepare(
      `INSERT INTO attendance (session_id, student_id, status, bonus, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id, student_id) DO UPDATE SET status = excluded.status, bonus = excluded.bonus,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    );
    const first = !s.attendance_at;
    db.transaction(() => {
      for (const c of clean) upsert.run(s.id, c.st.id, c.status, c.bonus, req.admin.id, now);
      db.prepare(
        `UPDATE class_sessions SET attendance_at = COALESCE(attendance_at, ?), attendance_by = COALESCE(attendance_by, ?),
                started_at = COALESCE(started_at, ?), started_by = COALESCE(started_by, ?) WHERE id = ?`
      ).run(now, req.admin.id, now, req.admin.id, s.id);
    })();

    // Lịch sử chỉnh sửa: lần đầu ghi tóm tắt, các lần sau ghi đúng những gì thay đổi
    const where = `buổi học lớp "${s.class_name}" ${describeSession(s)}`;
    if (first) {
      const parts = STATUSES.map((st) => {
        const names = clean.filter((c) => c.status === st).map((c) => c.st.fullName);
        if (!names.length) return null;
        return st === 'present' ? `${names.length} có mặt` : `${names.length} ${STATUS_LABELS[st].toLowerCase()} (${names.join(', ')})`;
      }).filter(Boolean);
      const bonus = clean.filter((c) => c.bonus > 0).map((c) => `${c.st.fullName} +${c.bonus}`);
      logAudit(db, {
        adminId: req.admin.id, action: 'save_attendance', classId: s.class_id,
        detail: `Điểm danh ${where}: ${parts.join(', ')}${bonus.length ? `. Điểm cộng: ${bonus.join(', ')}` : ''}`,
      });
    } else {
      const changes = [];
      for (const c of clean) {
        const o = old.get(c.st.id);
        if (!o) changes.push(`thêm ${c.st.fullName}: ${STATUS_LABELS[c.status]}${c.bonus ? `, +${c.bonus} điểm` : ''}`);
        else {
          if (o.status !== c.status) changes.push(`${c.st.fullName}: ${STATUS_LABELS[o.status]} → ${STATUS_LABELS[c.status]}`);
          if (o.bonus !== c.bonus) changes.push(`${c.st.fullName}: điểm cộng ${o.bonus} → ${c.bonus}`);
        }
      }
      if (changes.length) {
        logAudit(db, { adminId: req.admin.id, action: 'update_attendance', classId: s.class_id, detail: `Sửa điểm danh ${where}: ${changes.join('; ')}` });
      }
    }
    res.json(sessionDetail(req, findSession(db, s.id)));
  });

  return router;
}

module.exports = scheduleRouter;
