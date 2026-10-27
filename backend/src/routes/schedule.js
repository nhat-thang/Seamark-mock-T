// API thời khóa biểu + buổi học + điểm danh (requireAdmin gắn ở app.js).
//   GET  /api/admin/schedule/teachers        danh sách giáo viên (tài khoản đang hoạt động)
//   GET  /api/admin/schedule/overview        trang chính: hôm nay, lịch dạy của tôi, buổi chưa điểm danh, cảnh báo học phí
//   GET  /api/admin/schedule/alerts/export   tải danh sách cảnh báo học phí (owner có số tiền, giáo viên không)
//   GET  /api/admin/schedule?from&to         các buổi học trong khoảng ngày (lọc classId, teacherId, mine=1)
//   POST /api/admin/schedule                 xếp lịch (CHỈ admin chính): lịch hằng tuần (weekly) hoặc một buổi lẻ (date)
//   GET  /api/admin/schedule/:id             chi tiết buổi học + danh sách điểm danh
//   GET  /api/admin/schedule/:id/export      tải chi tiết một buổi học (điểm danh) về Excel
//   POST /api/admin/schedule/:id/update      sửa lịch (CHỈ admin chính): buổi này hoặc cả các buổi sau
//   POST /api/admin/schedule/:id/delete      xóa buổi (CHỈ admin chính): buổi này hoặc cả các buổi sau
//   POST /api/admin/schedule/:id/start       giáo viên bấm "Bắt đầu buổi học" (từ 30 phút trước giờ học)
//   POST /api/admin/schedule/:id/attendance  lưu điểm danh + điểm cộng
//
// Quy tắc thời khóa biểu (đã chốt, chặn ở đây chứ không chỉ ở giao diện):
// - Một buổi có thể nhiều giáo viên. Giáo viên được xếp dạy một buổi tự thành giáo viên phụ trách lớp đó.
// - Buổi ĐÃ điểm danh: không xóa được, không đổi được ngày giờ; chỉ đổi giáo viên / phòng / ghi chú.
// - Buổi chưa điểm danh: sửa / xóa được (giao diện hỏi lại trước).
// - Thêm buổi vào quá khứ được nhưng phải xác nhận ("buổi này sẽ được tính tiền").
// - Thêm / xóa / dời buổi làm đánh số lại các buổi -> chu kỳ học phí đã thu có thể bị lệch: server báo trước
//   (reason 'confirm') để hộp xác nhận nêu rõ; gửi lại với force: true mới lưu. Số tiền đã thu giữ nguyên.
// - Lịch hằng tuần không có ngày bắt đầu / kết thúc: bắt đầu từ buổi sắp tới gần nhất, lặp lại mãi
//   (classes/weekly.js tự xếp nối) cho tới khi lớp bị khóa hoặc xóa "buổi này và các buổi sau".
// - Sửa "buổi này và các buổi sau" mà đổi giờ: chỉ đổi các buổi CÙNG THỨ (mỗi thứ có giờ riêng).
const crypto = require('crypto');
const express = require('express');
const ExcelJS = require('exceljs');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const time = require('../classes/time');
const { sessionPermissions, describeSession, teacherIdsOf } = require('../classes/rules');
const { loadRoster, studentView } = require('../classes/students');
const { SESSION_SELECT, teacherName, teachersOf, toSession, findSession, notify } = require('../classes/sessions');
const { accessOf, addClassTeachers } = require('../classes/access');
const { classTuition, paidCyclesAffected } = require('../classes/tuitionData');
const { collectAlerts, LEVEL_LABELS } = require('../classes/alerts');
const { describeSlots, datesOf, horizon, insertSessions, weeklyOfSeries } = require('../classes/weekly');
const { styleHeader, fillRow, sendWorkbook, excelDate, MONEY_FMT } = require('../utils/excel');

const { vnDate, isValidDate, isValidTime, toInstant, addDays, weekdayOf, daysBetween, formatDate, WEEKDAY_LONG } = time;

const STATUSES = ['present', 'late', 'excused', 'absent'];
const STATUS_LABELS = { present: 'Có mặt', late: 'Đi muộn', excused: 'Vắng có phép', absent: 'Vắng không phép' };
const FEE_LABELS = { paid: 'Đã thu', unpaid: 'Chưa đóng', not_started: 'Chưa bắt đầu' };
const MAX_BONUS = 50;
const MAX_WEEKLY_SLOTS = 14; // lịch hằng tuần: tối đa 14 khung giờ / tuần
const MAX_RANGE_DAYS = 62; // xem tối đa 2 tháng một lần
const MAX_TEACHERS = 6;

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
  /** "Cô Lan, Thầy Nam" (+ "Cô Hà (giáo viên ngoài)") */
  const teacherLabel = (teachers, otherName) =>
    [...teachers.map((t) => t.display_name), ...(otherName ? [`${otherName} (giáo viên ngoài)`] : [])].join(', ');

  /**
   * Đọc giờ học + giáo viên từ dữ liệu gửi lên. Bắt buộc có ít nhất một giáo viên:
   * teacherIds = các tài khoản giáo viên, và / hoặc teacherName = giáo viên ngoài ("Khác").
   * (teacherId đơn lẻ vẫn nhận, cho bản giao diện cũ.) withTime = false: lịch hằng tuần, giờ nằm trong từng thứ.
   */
  function readSlot(body, { withTime = true } = {}) {
    const startTime = String(body?.startTime || '');
    const endTime = String(body?.endTime || '');
    if (withTime) {
      if (!isValidTime(startTime) || !isValidTime(endTime)) return { error: 'Vui lòng chọn giờ bắt đầu và giờ kết thúc.' };
      if (endTime <= startTime) return { error: 'Giờ kết thúc phải sau giờ bắt đầu (buổi học không kéo qua nửa đêm).' };
    }

    let rawIds = Array.isArray(body?.teacherIds) ? body.teacherIds : [];
    if (!rawIds.length && body?.teacherId !== undefined && body?.teacherId !== null && body?.teacherId !== '') rawIds = [body.teacherId];
    const ids = [...new Set(rawIds.map((v) => toInt(v)).filter(Boolean))];
    if (ids.length > MAX_TEACHERS) return { error: `Một buổi tối đa ${MAX_TEACHERS} giáo viên.` };
    const teachers = [];
    for (const id of ids) {
      const t = activeTeacher(id);
      if (!t) return { error: 'Giáo viên đã chọn không tồn tại hoặc tài khoản đã bị vô hiệu hóa.' };
      teachers.push(t);
    }
    const otherName = cleanText(body?.teacherName, 60);
    if (!teachers.length && !otherName) return { error: 'Vui lòng chọn giáo viên dạy buổi học (hoặc chọn "Khác" rồi gõ tên giáo viên).' };
    return {
      value: {
        startTime,
        endTime,
        teacherIds: teachers.map((t) => t.id),
        otherName,
        teacherLabel: teacherLabel(teachers, otherName),
        room: cleanText(body?.room, 40),
        note: cleanText(body?.note, 200),
      },
    };
  }

  /** Ghi các giáo viên của buổi + tự thêm họ vào giáo viên phụ trách lớp */
  function setSessionTeachers(sessionId, classId, teacherIds) {
    db.prepare('DELETE FROM session_teachers WHERE session_id = ?').run(sessionId);
    const add = db.prepare('INSERT OR IGNORE INTO session_teachers (session_id, admin_id) VALUES (?, ?)');
    for (const id of teacherIds) add.run(sessionId, id);
    addClassTeachers(db, classId, teacherIds);
  }

  /**
   * Các thứ + giờ của lịch hằng tuần: [{ weekday, startTime, endTime }]. Trả { slots } | { error }.
   */
  function readWeeklySlots(raw) {
    const slots = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const weekday = toInt(r?.weekday);
      if (!(weekday >= 1 && weekday <= 7)) return { error: 'Thứ trong tuần không hợp lệ.' };
      const day = WEEKDAY_LONG[weekday];
      const startTime = String(r?.startTime || '');
      const endTime = String(r?.endTime || '');
      if (!isValidTime(startTime) || !isValidTime(endTime)) return { error: `Vui lòng chọn giờ bắt đầu và giờ kết thúc của ${day}.` };
      if (endTime <= startTime) return { error: `${day}: giờ kết thúc phải sau giờ bắt đầu.` };
      if (slots.some((s) => s.weekday === weekday && s.startTime < endTime && s.endTime > startTime)) {
        return { error: `${day} có hai khung giờ bị chồng lên nhau.` };
      }
      slots.push({ weekday, startTime, endTime });
    }
    if (slots.length === 0) return { error: 'Vui lòng chọn ít nhất một thứ trong tuần.' };
    if (slots.length > MAX_WEEKLY_SLOTS) return { error: `Mỗi tuần tối đa ${MAX_WEEKLY_SLOTS} buổi.` };
    return { slots: slots.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)) };
  }

  /**
   * Tìm buổi học trùng giờ: cùng lớp, hoặc có cùng giáo viên (có tài khoản). Bỏ qua các buổi trong exceptIds.
   * slots: [{ date, startTime, endTime }]. Trả về danh sách câu mô tả để admin chính đọc và quyết định "Vẫn xếp".
   */
  function findConflicts({ classId, teacherIds, slots, exceptIds = [] }) {
    const inIds = teacherIds.length ? teacherIds.map(() => '?').join(',') : 'NULL';
    const q = db.prepare(
      `${SESSION_SELECT}
        WHERE c.deleted_at IS NULL AND s.date = ? AND s.start_time < ? AND s.end_time > ?
          AND (s.class_id = ? OR EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id AND x.admin_id IN (${inIds})))`
    );
    const out = [];
    for (const { date, startTime, endTime } of slots) {
      for (const r of q.all(date, endTime, startTime, classId, ...teacherIds)) {
        if (exceptIds.includes(r.id)) continue;
        const busy = teachersOf(r).filter((t) => teacherIds.includes(t.id)).map((t) => t.name).join(', ');
        const who = r.class_id === classId ? `lớp "${r.class_name}" đã có buổi học` : `${busy} đang dạy lớp "${r.class_name}"`;
        out.push(`${describeSession(r)}: ${who}`);
      }
    }
    return out;
  }

  /**
   * Hỏi lại trước khi lưu (trùng giờ, buổi đã qua sẽ được tính tiền, chu kỳ đã thu bị lệch).
   * Trả true nếu đã gửi 409 cho trình duyệt.
   */
  function needsConfirm(req, res, { conflicts = [], past = 0, cycles = [] }) {
    if (req.body?.force) return false;
    if (!conflicts.length && !past && !cycles.length) return false;
    res.status(409).json({
      reason: 'confirm',
      error: conflicts.length ? 'Lịch bị trùng giờ với buổi học khác.' : 'Vui lòng xác nhận thay đổi này.',
      conflicts: conflicts.slice(0, 8),
      more: Math.max(0, conflicts.length - 8),
      past, // số buổi đã qua giờ học: sẽ được tính tiền
      cycles: cycles.slice(0, 20).map((c) => ({ fullName: c.fullName, cycleNo: c.cycleNo })),
      moreCycles: Math.max(0, cycles.length - 20),
    });
    return true;
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

  /** Học sinh của buổi (để điểm danh) kèm điểm danh đã lưu, số buổi đã học, nhãn học phí — đã lọc theo vai trò */
  function rosterOf(req, s, cls, access) {
    const marks = new Map(
      db.prepare('SELECT student_id, status, bonus FROM attendance WHERE session_id = ?').all(s.id).map((a) => [a.student_id, a])
    );
    const roster = loadRoster(db, cls, s);
    const { tl, map } = classTuition(db, cls, roster);
    const students = roster.map((st) => {
      const a = marks.get(st.id);
      return { ...studentView(st, access.isOwner, map.get(st.id)), attendance: a ? { status: a.status, bonus: a.bonus } : null };
    });
    return { tl, students };
  }

  /** Chi tiết buổi học + danh sách học sinh (kèm điểm danh đã lưu) */
  function sessionDetail(req, s) {
    const now = Date.now();
    const access = accessOf(db, req.admin);
    const p = sessionPermissions(req.admin, s, now, access);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const { tl, students } = rosterOf(req, s, cls, access);
    const info = tl.sessions.find((x) => x.id === s.id);
    const following = s.series_id
      ? db.prepare('SELECT COUNT(*) AS n FROM class_sessions WHERE series_id = ? AND date >= ?').get(s.series_id, s.date).n
      : 1;
    const by = (id) => (id ? db.prepare('SELECT display_name FROM admins WHERE id = ?').get(id)?.display_name ?? null : null);
    return {
      session: {
        ...toSession(s, req.admin, now, access),
        no: info?.no ?? null, // buổi thứ mấy của lớp trên thời khóa biểu
        totalSessions: tl.total,
        cycleNo: info?.cycle ?? null,
        startedBy: by(s.started_by),
        attendanceBy: by(s.attendance_by),
        followingCount: following,
        weekly: Boolean(weeklyOfSeries(db, s.series_id)), // thuộc lịch hằng tuần đang chạy (lặp lại mãi)
      },
      class: { id: cls.id, name: cls.name, color: cls.color },
      permissions: {
        isOwner: p.isOwner, canStart: p.canStart, canEdit: p.canEdit, reason: p.reason,
        // Buổi đã điểm danh: không xóa, không đổi ngày giờ (đã chốt)
        locked: Boolean(s.attendance_at),
      },
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
    const access = accessOf(db, req.admin);
    const owner = access.isOwner;
    const list = (sql, ...params) =>
      db.prepare(`${SESSION_SELECT} WHERE c.deleted_at IS NULL AND ${sql} ORDER BY s.starts_at`).all(...params).map((r) => toSession(r, req.admin, now, access));
    const mine = 'EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id AND x.admin_id = ?)';

    // Lịch dạy của tôi: từ đầu hôm nay tới hết 7 ngày tới
    const mySessions = list(`${mine} AND s.starts_at >= ? AND s.starts_at < ?`, me, toInstant(today, '00:00'), toInstant(addDays(today, 7), '00:00'));
    // Buổi đã kết thúc mà chưa điểm danh (14 ngày gần đây). Admin chính thấy của mọi giáo viên (để nhắc);
    // giáo viên thấy buổi mình dạy + buổi của lớp mình phụ trách (cũng điểm danh được).
    const since = new Date(now - 14 * time.DAY_MS).toISOString();
    const endedSql = 's.attendance_at IS NULL AND s.ends_at <= ? AND s.starts_at >= ?';
    const pending = owner
      ? list(endedSql, new Date(now).toISOString(), since)
      : list(`${endedSql} AND (${mine} OR s.class_id IN (SELECT class_id FROM class_teachers WHERE admin_id = ?))`, new Date(now).toISOString(), since, me, me);
    // Admin chính: toàn bộ lịch hôm nay của trung tâm
    const todayAll = owner ? list('s.date = ?', today) : [];

    res.json({
      today,
      todayLabel: `${WEEKDAY_LONG[weekdayOf(today)]}, ${formatDate(today)}`,
      mySessions,
      pending: pending.reverse(),
      todayAll,
      tuition: collectAlerts(db, access, now), // giáo viên: lớp mình phụ trách, không có số tiền
    });
  });

  // Tải danh sách cảnh báo học phí về Excel (owner có số tiền, giáo viên không)
  router.get('/alerts/export', async (req, res) => {
    const access = accessOf(db, req.admin);
    const { items, gaps } = collectAlerts(db, access);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    const ws = wb.addWorksheet('Cảnh báo học phí', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Mức', key: 'level', width: 8 },
      { header: 'Cảnh báo', key: 'text', width: 26 },
      { header: 'Lớp', key: 'className', width: 20 },
      { header: 'Học sinh', key: 'fullName', width: 26 },
      { header: 'Kì học phí', key: 'cycleNo', width: 10 },
      { header: 'Hạn đóng', key: 'dueDate', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      ...(access.isOwner ? [{ header: 'Số tiền', key: 'amount', width: 14, style: { numFmt: MONEY_FMT } }] : []),
    ];
    const FILL = { red: 'FFFDE2E2', orange: 'FFFFE8D1', yellow: 'FFFFF6CC' };
    items.forEach((a, i) => {
      const row = ws.addRow({ ...a, stt: i + 1, level: LEVEL_LABELS[a.level], dueDate: a.dueDate ? excelDate(a.dueDate) : null });
      row.getCell('level').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[a.level] } };
    });
    styleHeader(ws.getRow(1));
    if (access.isOwner && items.length) {
      const total = ws.addRow({ fullName: 'Tổng', amount: items.reduce((n, a) => n + (a.amount || 0), 0) });
      fillRow(total, 'FFF1F5F9', true);
    }
    if (access.isOwner && gaps?.length) {
      ws.addRow([]);
      ws.addRow(['', 'Lớp chưa xếp đủ lịch:']).font = { bold: true };
      for (const g of gaps) ws.addRow(['', '', `Lớp ${g.className} mới xếp ${g.scheduled}/${g.needed} buổi của kì ${g.cycleNo}`]);
    }
    logAudit(db, { adminId: req.admin.id, action: 'export_alerts', detail: `Tải danh sách cảnh báo học phí về Excel (${items.length} học sinh)` });
    await sendWorkbook(res, wb, `Canh bao hoc phi ${vnDate().split('-').reverse().join('-')}.xlsx`);
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
    const teaches = 'EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id AND x.admin_id = ?)';
    if (req.query.mine === '1') {
      where.push(teaches);
      params.push(req.admin.id);
    } else if (req.query.teacherId === 'other') {
      where.push('NOT EXISTS (SELECT 1 FROM session_teachers x WHERE x.session_id = s.id)');
    } else if (toInt(req.query.teacherId)) {
      where.push(teaches);
      params.push(toInt(req.query.teacherId));
    }
    const rows = db.prepare(`${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.starts_at, c.name`).all(...params);
    const now = Date.now();
    const access = accessOf(db, req.admin);
    res.json({ sessions: rows.map((r) => toSession(r, req.admin, now, access)) });
  });

  // ----- Xếp lịch (admin chính) -----

  router.post('/', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const body = req.body || {};
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND deleted_at IS NULL').get(toInt(body.classId) || 0);
    if (!cls) return res.status(400).json({ error: 'Vui lòng chọn lớp học.' });
    if (cls.closed_at) return res.status(400).json({ error: `Lớp "${cls.name}" đã khóa (đã kết thúc). Mở lại lớp rồi mới xếp lịch được.` });
    // Trang web cũ (chưa tải lại sau khi cập nhật) còn gửi "lặp lại đến ngày": báo tải lại, không lặng lẽ xếp 1 buổi
    if (body.repeat) return res.status(400).json({ error: 'Trang web vừa được cập nhật. Hãy tải lại trang (bấm F5) rồi xếp lịch lại.' });
    if (body.weekly) return createWeekly(req, res, cls);

    // Một buổi lẻ (học bù, học thêm)
    const date = String(body.date || '');
    if (!isValidDate(date)) return res.status(400).json({ error: 'Vui lòng chọn ngày học.' });
    const slot = readSlot(body);
    if (slot.error) return res.status(400).json({ error: slot.error });
    const v = slot.value;

    const nowMs = Date.now();
    const one = { id: -1, date, startsAt: toInstant(date, v.startTime), endsAt: toInstant(date, v.endTime) };
    const past = Date.parse(one.endsAt) <= nowMs ? 1 : 0;
    const confirm = {
      conflicts: findConflicts({ classId: cls.id, teacherIds: v.teacherIds, slots: [{ date, startTime: v.startTime, endTime: v.endTime }] }),
      past,
      cycles: paidCyclesAffected(db, cls, (rows) => rows.concat([one]), nowMs),
    };
    if (needsConfirm(req, res, confirm)) return;

    const now = nowIso();
    const id = db.transaction(() => {
      const newId = db.prepare(
        `INSERT INTO class_sessions (class_id, date, start_time, end_time, starts_at, ends_at, teacher_admin_id, teacher_name,
                                     room, note, series_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
      ).run(cls.id, date, v.startTime, v.endTime, one.startsAt, one.endsAt, v.teacherIds[0] ?? null, v.otherName,
        v.room, v.note, req.admin.id, now, now).lastInsertRowid;
      setSessionTeachers(newId, cls.id, v.teacherIds);
      return newId;
    })();

    const what = `buổi học lớp "${cls.name}": ${describeSession({ date, start_time: v.startTime, end_time: v.endTime })}`;
    const extra = [
      past ? 'buổi đã qua (được tính học phí)' : '',
      confirm.cycles.length ? `làm lệch ${confirm.cycles.length} kì học phí đã thu` : '',
    ].filter(Boolean).join('; ');
    logAudit(db, {
      adminId: req.admin.id, action: 'create_sessions', classId: cls.id,
      detail: `Xếp ${what}, giáo viên ${v.teacherLabel}${extra ? ` (${extra})` : ''}`,
    });
    for (const teacherId of v.teacherIds) {
      notify(db, { adminId: teacherId, actorId: req.admin.id, text: `${req.admin.displayName} đã xếp cho bạn ${what}`, link: `/admin/buoi-hoc/${id}` });
    }
    res.status(201).json({ ids: [id], count: 1 });
  });

  /**
   * Lịch hằng tuần: { classId, weekly: { slots: [{ weekday, startTime, endTime }] }, teacherIds, teacherName, room }.
   * Không có ngày bắt đầu / kết thúc: xếp từ buổi sắp tới gần nhất, server tự xếp nối mãi cho tới khi khóa lớp.
   */
  function createWeekly(req, res, cls) {
    const body = req.body;
    const read = readWeeklySlots(body.weekly.slots);
    if (read.error) return res.status(400).json({ error: read.error });
    const slot = readSlot(body, { withTime: false });
    if (slot.error) return res.status(400).json({ error: slot.error });
    const v = slot.value;

    const nowMs = Date.now();
    const list = datesOf(read.slots, vnDate(nowMs), horizon(nowMs), nowMs);
    const confirm = {
      conflicts: findConflicts({ classId: cls.id, teacherIds: v.teacherIds, slots: list }),
      cycles: paidCyclesAffected(db, cls, (rows) => rows.concat(list.map((x, i) => ({ id: -1 - i, ...x }))), nowMs),
    };
    if (needsConfirm(req, res, confirm)) return;

    const now = nowIso();
    const w = {
      classId: cls.id,
      seriesId: crypto.randomBytes(8).toString('hex'),
      slots: read.slots,
      teacherIds: v.teacherIds,
      teacherName: v.otherName,
      room: v.room,
    };
    const ids = db.transaction(() => {
      db.prepare(
        `INSERT INTO class_weekly (class_id, series_id, slots, teacher_ids, teacher_name, room, filled_until, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(cls.id, w.seriesId, JSON.stringify(w.slots), JSON.stringify(w.teacherIds), w.teacherName, w.room, horizon(nowMs), req.admin.id, now, now);
      return insertSessions(db, w, list, req.admin.id, nowMs);
    })();

    const first = list[0];
    const what = `lịch học hằng tuần lớp "${cls.name}": ${describeSlots(w.slots)}, bắt đầu ${describeSession({ date: first.date, start_time: first.startTime, end_time: first.endTime })}`;
    logAudit(db, {
      adminId: req.admin.id, action: 'create_sessions', classId: cls.id,
      detail: `Xếp ${what} (lặp lại cho tới khi khóa lớp), giáo viên ${v.teacherLabel}${confirm.cycles.length ? ` (làm lệch ${confirm.cycles.length} kì học phí đã thu)` : ''}`,
    });
    for (const teacherId of v.teacherIds) {
      notify(db, { adminId: teacherId, actorId: req.admin.id, text: `${req.admin.displayName} đã xếp cho bạn ${what}`, link: `/admin/thoi-khoa-bieu?ngay=${first.date}` });
    }
    res.status(201).json({ ids, count: ids.length, weekly: true, firstDate: first.date });
  }

  // ----- Một buổi học -----

  router.get('/:id', (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const p = sessionPermissions(req.admin, s, Date.now(), accessOf(db, req.admin));
    if (!p.canOpen) return res.status(403).json({ error: p.reason });
    res.json(sessionDetail(req, s));
  });

  // Tải chi tiết một buổi học (danh sách học sinh + điểm danh) về Excel. Không có thông tin riêng tư.
  router.get('/:id/export', async (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const access = accessOf(db, req.admin);
    const p = sessionPermissions(req.admin, s, Date.now(), access);
    if (!p.canOpen) return res.status(403).json({ error: p.reason });
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const { tl, students } = rosterOf(req, s, cls, access);
    const info = tl.sessions.find((x) => x.id === s.id);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    const ws = wb.addWorksheet('Buổi học');
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 28;
    [3, 4, 5, 6, 7].forEach((c) => (ws.getColumn(c).width = 16));
    ws.addRow([`Lớp ${cls.name} — buổi ${info?.no ?? '?'}: ${describeSession(s)}`]).font = { bold: true, size: 13 };
    ws.addRow([`Giáo viên: ${teacherName(s) || '—'}${s.room ? ` · Phòng: ${s.room}` : ''}${s.note ? ` · Ghi chú: ${s.note}` : ''}`]);
    ws.addRow([s.attendance_at ? `Đã điểm danh: ${students.filter((x) => x.attendance && ['present', 'late'].includes(x.attendance.status)).length}/${students.length} có mặt` : 'Chưa điểm danh']);
    ws.addRow([]);
    const head = ws.addRow(['STT', 'Họ và tên', 'Điểm danh', 'Điểm cộng', 'Số buổi đã học', 'Học phí kì này', 'Cảnh báo học phí']);
    styleHeader(head);
    students.forEach((st, i) => {
      const t = st.tuition;
      ws.addRow([
        i + 1,
        st.fullName,
        st.attendance ? STATUS_LABELS[st.attendance.status] : '',
        st.attendance?.bonus || '',
        t?.sessionsDone ?? '',
        t?.labels?.current ? FEE_LABELS[t.labels.current] : '',
        t?.alert ? LEVEL_LABELS[t.alert.level] : '',
      ]);
    });
    logAudit(db, { adminId: req.admin.id, action: 'export_session', classId: cls.id, detail: `Tải chi tiết buổi học lớp "${cls.name}" ${describeSession(s)} về Excel` });
    await sendWorkbook(res, wb, `Buoi hoc ${cls.name} ${s.date.split('-').reverse().join('-')}.xlsx`);
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
    // Mỗi thứ trong tuần có giờ riêng: sửa nhiều buổi thì giờ mới chỉ áp cho các buổi cùng thứ với buổi đang sửa
    const sameDay = (t) => targets.length === 1 || weekdayOf(t.date) === weekdayOf(s.date);
    const startOf = (t) => (sameDay(t) ? v.startTime : t.start_time);
    const endOf = (t) => (sameDay(t) ? v.endTime : t.end_time);
    const movesTime = (t) => dateOf(t) !== t.date || t.start_time !== startOf(t) || t.end_time !== endOf(t);

    // Buổi đã điểm danh: không đổi ngày giờ (đã chốt) — chỉ đổi giáo viên / phòng / ghi chú
    const lockedMoved = targets.filter((t) => t.attendance_at && movesTime(t));
    if (lockedMoved.length) {
      return res.status(400).json({
        reason: 'locked',
        error: lockedMoved.length === 1 && targets.length === 1
          ? 'Buổi này đã điểm danh nên không đổi được ngày giờ. Bạn chỉ đổi được giáo viên, phòng học, ghi chú.'
          : `Có ${lockedMoved.length} buổi đã điểm danh nên không đổi được ngày giờ. Hãy sửa riêng từng buổi chưa điểm danh.`,
      });
    }

    const nowMs = Date.now();
    const moved = new Map(
      targets.filter(movesTime).map((t) => [t.id, { date: dateOf(t), startsAt: toInstant(dateOf(t), startOf(t)), endsAt: toInstant(dateOf(t), endOf(t)) }])
    );
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const confirm = {
      conflicts: findConflicts({
        classId: s.class_id, teacherIds: v.teacherIds, exceptIds: targets.map((t) => t.id),
        slots: targets.map((t) => ({ date: dateOf(t), startTime: startOf(t), endTime: endOf(t) })),
      }),
      // Dời buổi sắp tới vào thời gian đã qua -> buổi đó được tính là đã học
      past: targets.filter((t) => moved.has(t.id) && Date.parse(t.ends_at) > nowMs && Date.parse(moved.get(t.id).endsAt) <= nowMs).length,
      cycles: moved.size ? paidCyclesAffected(db, cls, (rows) => rows.map((r) => (moved.has(r.id) ? { ...r, ...moved.get(r.id) } : r)), nowMs) : [],
    };
    if (needsConfirm(req, res, confirm)) return;

    const update = db.prepare(
      `UPDATE class_sessions SET date = ?, start_time = ?, end_time = ?, starts_at = ?, ends_at = ?, teacher_admin_id = ?,
              teacher_name = ?, room = ?, note = ?, updated_at = ? WHERE id = ?`
    );
    const now = nowIso();
    db.transaction(() => {
      for (const t of targets) {
        const d = dateOf(t);
        // Buổi đã điểm danh giữ nguyên giờ (ở trên đã chặn đổi); các buổi khác theo giờ mới
        const st = t.attendance_at ? t.start_time : startOf(t);
        const et = t.attendance_at ? t.end_time : endOf(t);
        update.run(d, st, et, toInstant(d, st), toInstant(d, et), v.teacherIds[0] ?? null, v.otherName, v.room, v.note, now, t.id);
        setSessionTeachers(t.id, t.class_id, v.teacherIds);
      }
      // Lịch hằng tuần: các buổi xếp nối về sau cũng theo giáo viên / phòng / giờ mới
      const w = targets.length > 1 ? weeklyOfSeries(db, s.series_id) : null;
      if (w) {
        const slots = w.slots.map((x) =>
          x.weekday === weekdayOf(s.date) && x.startTime === s.start_time ? { ...x, startTime: v.startTime, endTime: v.endTime } : x
        );
        db.prepare('UPDATE class_weekly SET slots = ?, teacher_ids = ?, teacher_name = ?, room = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(slots), JSON.stringify(v.teacherIds), v.otherName, v.room, now, w.id);
      }
    })();

    // Mô tả thay đổi cho lịch sử + thông báo
    const oldIds = teacherIdsOf(s);
    const changes = [];
    if (newDate !== s.date) changes.push(`ngày ${formatDate(s.date)} → ${formatDate(newDate)}`);
    if (s.start_time !== v.startTime || s.end_time !== v.endTime) {
      const days = targets.length > 1 ? ` các buổi ${WEEKDAY_LONG[weekdayOf(s.date)]}` : '';
      changes.push(`giờ${days} ${s.start_time}–${s.end_time} → ${v.startTime}–${v.endTime}`);
    }
    const sameTeachers = oldIds.length === v.teacherIds.length && oldIds.every((id) => v.teacherIds.includes(id)) && (s.teacher_name || '') === v.otherName;
    if (!sameTeachers) changes.push(`giáo viên ${teacherName(s) || 'chưa có'} → ${v.teacherLabel}`);
    if (s.room !== v.room) changes.push(`phòng "${s.room || 'trống'}" → "${v.room || 'trống'}"`);
    if (s.note !== v.note) changes.push('ghi chú');
    const which = targets.length > 1
      ? `${targets.length} buổi học lớp "${s.class_name}" (từ ${describeSession(s)} trở về sau)`
      : `buổi học lớp "${s.class_name}" ${describeSession(s)}`;
    if (changes.length) {
      const extra = [
        confirm.past ? `${confirm.past} buổi dời vào thời gian đã qua` : '',
        confirm.cycles.length ? `làm lệch ${confirm.cycles.length} kì học phí đã thu` : '',
      ].filter(Boolean).join('; ');
      logAudit(db, {
        adminId: req.admin.id, action: 'update_session', classId: s.class_id,
        detail: `Sửa ${which}: ${changes.join('; ')}${extra ? ` (${extra})` : ''}`,
      });
      const link = `/admin/buoi-hoc/${s.id}`;
      for (const id of oldIds.filter((x) => !v.teacherIds.includes(x))) {
        notify(db, { adminId: id, actorId: req.admin.id, text: `${req.admin.displayName} đã chuyển ${which} sang giáo viên ${v.teacherLabel}. Bạn không còn dạy buổi này.` });
      }
      for (const id of v.teacherIds) {
        const text = oldIds.includes(id)
          ? `${req.admin.displayName} đã sửa lịch ${which}: ${changes.join('; ')}`
          : `${req.admin.displayName} đã xếp cho bạn ${which}${changes.length ? ` (${changes.join('; ')})` : ''}`;
        notify(db, { adminId: id, actorId: req.admin.id, text, link });
      }
    }
    res.json(sessionDetail(req, findSession(db, s.id)));
  });

  router.post('/:id/delete', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const s = loadSession(req, res);
    if (!s) return;
    const targets = targetsOf(s, req.body?.scope);
    // Buổi đã điểm danh: không xóa được (đã chốt) — giữ đúng số buổi đã học và học phí
    const withAttendance = targets.filter((t) => t.attendance_at).length;
    if (withAttendance) {
      return res.status(400).json({
        reason: 'locked',
        count: withAttendance,
        error: targets.length === 1
          ? 'Buổi này đã điểm danh nên không xóa được. Bạn chỉ đổi được giáo viên, phòng học, ghi chú.'
          : `Có ${withAttendance} buổi đã điểm danh nên không xóa được. Hãy xóa riêng từng buổi chưa điểm danh.`,
      });
    }
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(s.class_id);
    const removing = new Set(targets.map((t) => t.id));
    const cycles = paidCyclesAffected(db, cls, (rows) => rows.filter((r) => !removing.has(r.id)));
    if (needsConfirm(req, res, { cycles })) return;

    // Xóa "buổi này và các buổi sau" của lịch hằng tuần = dừng lịch đó (không xếp nối nữa)
    const weekly = req.body?.scope === 'following' ? weeklyOfSeries(db, s.series_id) : null;
    const del = db.prepare('DELETE FROM class_sessions WHERE id = ?');
    db.transaction(() => {
      targets.forEach((t) => del.run(t.id));
      if (weekly) db.prepare('UPDATE class_weekly SET stopped_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), weekly.id);
    })();

    const which = targets.length > 1
      ? `${targets.length} buổi học lớp "${s.class_name}" (từ ${describeSession(s)} trở về sau)`
      : `buổi học lớp "${s.class_name}" ${describeSession(s)}`;
    const extra = [weekly ? 'dừng lịch học hằng tuần' : '', cycles.length ? `làm lệch ${cycles.length} kì học phí đã thu` : ''].filter(Boolean).join('; ');
    logAudit(db, {
      adminId: req.admin.id, action: 'delete_session', classId: s.class_id,
      detail: `Xóa ${which}${extra ? ` (${extra})` : ''}`,
    });
    // Báo cho các giáo viên có buổi chưa diễn ra bị xóa
    const nowMs = Date.now();
    const teachers = new Set(targets.filter((t) => Date.parse(t.ends_at) > nowMs).flatMap((t) => teacherIdsOf(t)));
    for (const id of teachers) notify(db, { adminId: id, actorId: req.admin.id, text: `${req.admin.displayName} đã xóa ${which} khỏi thời khóa biểu.` });
    res.json({ deleted: targets.length });
  });

  // ----- Dạy học: bắt đầu + điểm danh -----

  router.post('/:id/start', (req, res) => {
    const s = loadSession(req, res);
    if (!s) return;
    const p = sessionPermissions(req.admin, s, Date.now(), accessOf(db, req.admin));
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
    const p = sessionPermissions(req.admin, s, Date.now(), accessOf(db, req.admin));
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
