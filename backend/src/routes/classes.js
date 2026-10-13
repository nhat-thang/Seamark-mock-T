// API lớp học + học sinh + học phí — mọi admin (requireAdmin gắn ở app.js).
// Riêng xem / khôi phục lớp đã xóa: chỉ admin chính.
//   GET  /api/admin/classes                         danh sách lớp (?deleted=1: lớp đã xóa, chỉ admin chính)
//   POST /api/admin/classes                         tạo lớp
//   GET  /api/admin/classes/:id                     chi tiết lớp + học sinh
//   POST /api/admin/classes/:id/update              sửa thông tin lớp
//   POST /api/admin/classes/:id/delete              xóa lớp (xóa mềm)
//   POST /api/admin/classes/:id/restore             khôi phục lớp (chỉ admin chính)
//   GET  /api/admin/classes/:id/sessions            mọi buổi học của lớp
//   POST /api/admin/classes/:id/students            thêm một hoặc nhiều học sinh
//   GET  /api/admin/classes/:id/students/:sid       lịch sử đi học + học phí của một học sinh
//   POST /api/admin/classes/:id/students/:sid/update
//   POST /api/admin/classes/:id/students/:sid/remove   cho nghỉ học (chưa có lịch sử thì xóa hẳn)
//   POST /api/admin/classes/:id/students/:sid/restore  cho học lại
//   POST /api/admin/classes/:id/students/:sid/fee-paid đã thu học phí đợt này
//   POST /api/admin/classes/:id/students/:sid/fee-undo hoàn tác lần thu gần nhất
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const { vnDate, isValidDate, formatDate } = require('../classes/time');
const { loadStudents, loadStudent } = require('../classes/students');
const { SESSION_SELECT, toSession } = require('../classes/sessions');

const COLORS = ['blue', 'sky', 'teal', 'green', 'yellow', 'orange', 'pink', 'purple'];
const MAX_BATCH = 100;

const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const toInt = (v) => Number.parseInt(v, 10);

/** SĐT không bắt buộc. Bỏ dấu cách, chấm, gạch; còn 8–15 chữ số (có thể có + ở đầu). Trả về null nếu sai. */
function cleanPhone(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s.()-]/g, '');
  return /^\+?\d{8,15}$/.test(compact) ? compact : null;
}

function classFields(body, current = null) {
  const name = cleanText(body?.name ?? current?.name, 60);
  const color = COLORS.includes(body?.color) ? body.color : current?.color || 'blue';
  const note = cleanText(body?.note ?? current?.note, 300);
  const feeRaw = body?.feeEvery ?? current?.fee_every ?? 0;
  const feeEvery = feeRaw === '' || feeRaw === null ? 0 : toInt(feeRaw);
  if (!name) return { error: 'Vui lòng nhập tên lớp.' };
  if (!Number.isInteger(feeEvery) || feeEvery < 0 || feeEvery > 100) {
    return { error: 'Số buổi nhắc học phí phải từ 0 đến 100 (0 = không nhắc).' };
  }
  return { name, color, note, feeEvery };
}

/** Kiểm tra dữ liệu một học sinh. Trả { value } hoặc { error } */
function studentFields(body, current = null) {
  const fullName = cleanText(body?.fullName ?? current?.full_name, 80);
  if (!fullName) return { error: 'Vui lòng nhập họ tên học sinh.' };
  const phone = cleanPhone(body?.phone ?? current?.phone);
  if (phone === null) return { error: `Số điện thoại của "${fullName}" không đúng (để trống nếu không có).` };
  const note = cleanText(body?.note ?? current?.note, 200);
  const joinedOn = String(body?.joinedOn || current?.joined_on || vnDate());
  if (!isValidDate(joinedOn)) return { error: `Ngày vào học của "${fullName}" không đúng.` };
  const priorRaw = body?.priorSessions ?? current?.prior_sessions ?? 0;
  const priorSessions = priorRaw === '' || priorRaw === null ? 0 : toInt(priorRaw);
  if (!Number.isInteger(priorSessions) || priorSessions < 0 || priorSessions > 500) {
    return { error: 'Số buổi đã học trước đó phải từ 0 đến 500.' };
  }
  return { value: { fullName, phone, note, joinedOn, priorSessions } };
}

function classesRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  const isOwner = (req) => req.admin.role === 'owner';

  /** Lấy lớp theo :id. Lớp đã xóa chỉ admin chính thấy (khi allowDeleted). Gửi lỗi và trả null nếu không có. */
  function loadClass(req, res, { allowDeleted = false } = {}) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(toInt(req.params.id) || 0);
    if (!cls || (cls.deleted_at && !(allowDeleted && isOwner(req)))) {
      res.status(404).json({ error: 'Không tìm thấy lớp học (có thể lớp đã bị xóa).' });
      return null;
    }
    return cls;
  }

  function loadStudentRow(req, res, cls) {
    const st = db.prepare('SELECT * FROM class_students WHERE id = ? AND class_id = ?').get(toInt(req.params.sid) || 0, cls.id);
    if (!st) {
      res.status(404).json({ error: 'Không tìm thấy học sinh trong lớp này.' });
      return null;
    }
    return st;
  }

  const nameTaken = (name, exceptId = 0) =>
    db.prepare('SELECT 1 FROM classes WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE AND id <> ?').get(name, exceptId);

  const audit = (req, cls, action, detail) => logAudit(db, { adminId: req.admin.id, action, classId: cls.id, detail });

  function toClass(cls) {
    const now = nowIso();
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM class_students WHERE class_id = ? AND removed_at IS NULL) AS students,
                (SELECT COUNT(*) FROM class_sessions WHERE class_id = ? AND attendance_at IS NOT NULL) AS done,
                (SELECT COUNT(*) FROM class_sessions WHERE class_id = ? AND starts_at > ?) AS upcoming`
      )
      .get(cls.id, cls.id, cls.id, now);
    const next = db.prepare(`${SESSION_SELECT} WHERE s.class_id = ? AND s.ends_at > ? ORDER BY s.starts_at LIMIT 1`).get(cls.id, now);
    return {
      id: cls.id,
      name: cls.name,
      color: cls.color,
      note: cls.note,
      feeEvery: cls.fee_every,
      deletedAt: cls.deleted_at,
      createdAt: cls.created_at,
      studentCount: counts.students,
      doneSessions: counts.done,
      upcomingSessions: counts.upcoming,
      nextSession: next
        ? { id: next.id, date: next.date, startTime: next.start_time, endTime: next.end_time, teacherName: next.teacher_admin_id ? next.teacher_display : next.teacher_name }
        : null,
    };
  }

  // ----- Lớp học -----

  router.get('/', (req, res) => {
    const deleted = req.query.deleted === '1';
    if (deleted && !isOwner(req)) return res.status(403).json({ error: 'Chỉ admin chính mới xem được lớp đã xóa.' });
    const rows = db
      .prepare(`SELECT * FROM classes WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY name COLLATE NOCASE`)
      .all();
    const classes = rows.map((cls) => {
      const students = loadStudents(db, cls).filter((s) => s.isActive);
      return {
        ...toClass(cls),
        feeDue: students.filter((s) => s.fee.state === 'due').length,
        feeSoon: students.filter((s) => s.fee.state === 'soon').length,
      };
    });
    res.json({ classes });
  });

  router.post('/', (req, res) => {
    const f = classFields(req.body);
    if (f.error) return res.status(400).json({ error: f.error });
    if (nameTaken(f.name)) return res.status(409).json({ error: `Đã có lớp tên "${f.name}". Vui lòng đặt tên khác.` });
    const now = nowIso();
    const id = db
      .prepare(
        `INSERT INTO classes (name, color, note, fee_every, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(f.name, f.color, f.note, f.feeEvery, req.admin.id, now, now).lastInsertRowid;
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
    audit(req, cls, 'create_class', `Tạo lớp "${f.name}"${f.feeEvery ? ` (nhắc học phí mỗi ${f.feeEvery} buổi)` : ''}`);
    res.status(201).json({ class: toClass(cls) });
  });

  router.get('/:id', (req, res) => {
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    res.json({ class: toClass(cls), students: loadStudents(db, cls) });
  });

  router.post('/:id/update', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const f = classFields(req.body, cls);
    if (f.error) return res.status(400).json({ error: f.error });
    if (nameTaken(f.name, cls.id)) return res.status(409).json({ error: `Đã có lớp tên "${f.name}". Vui lòng đặt tên khác.` });
    db.prepare('UPDATE classes SET name = ?, color = ?, note = ?, fee_every = ?, updated_at = ? WHERE id = ?').run(
      f.name, f.color, f.note, f.feeEvery, nowIso(), cls.id
    );
    const changes = [];
    if (f.name !== cls.name) changes.push(`tên "${cls.name}" → "${f.name}"`);
    if (f.feeEvery !== cls.fee_every) {
      const label = (n) => (n ? `mỗi ${n} buổi` : 'không nhắc');
      changes.push(`nhắc học phí ${label(cls.fee_every)} → ${label(f.feeEvery)}`);
    }
    if (f.note !== cls.note) changes.push('ghi chú');
    if (f.color !== cls.color) changes.push('màu');
    if (changes.length) audit(req, cls, 'update_class', `Sửa lớp "${f.name}": ${changes.join('; ')}`);
    res.json({ class: toClass(db.prepare('SELECT * FROM classes WHERE id = ?').get(cls.id)) });
  });

  router.post('/:id/delete', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    db.prepare('UPDATE classes SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(nowIso(), req.admin.id, cls.id);
    audit(req, cls, 'delete_class', `Xóa lớp "${cls.name}" (admin chính khôi phục được)`);
    res.json({ ok: true });
  });

  router.post('/:id/restore', (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ error: 'Chỉ admin chính mới khôi phục được lớp đã xóa.' });
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    if (!cls.deleted_at) return res.json({ class: toClass(cls) });
    if (nameTaken(cls.name, cls.id)) {
      return res.status(409).json({ error: `Đang có một lớp khác tên "${cls.name}". Hãy đổi tên lớp đó trước rồi khôi phục.` });
    }
    db.prepare('UPDATE classes SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?').run(nowIso(), cls.id);
    audit(req, cls, 'restore_class', `Khôi phục lớp "${cls.name}"`);
    res.json({ class: toClass(db.prepare('SELECT * FROM classes WHERE id = ?').get(cls.id)) });
  });

  // Mọi buổi học của lớp (cũ nhất trước), kèm số học sinh có mặt
  router.get('/:id/sessions', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const rows = db.prepare(`${SESSION_SELECT} WHERE s.class_id = ? ORDER BY s.starts_at`).all(cls.id);
    const now = Date.now();
    res.json({ sessions: rows.map((r) => toSession(r, req.admin, now)) });
  });

  // ----- Học sinh -----

  // Thêm học sinh: { students: [{ fullName, phone?, note?, joinedOn?, priorSessions? }] } (tối đa 100 / lần)
  router.post('/:id/students', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const list = Array.isArray(req.body?.students) ? req.body.students : [];
    if (list.length === 0) return res.status(400).json({ error: 'Chưa có học sinh nào để thêm.' });
    if (list.length > MAX_BATCH) return res.status(400).json({ error: `Mỗi lần thêm tối đa ${MAX_BATCH} học sinh.` });
    const values = [];
    for (const item of list) {
      const f = studentFields(item);
      if (f.error) return res.status(400).json({ error: f.error });
      values.push(f.value);
    }
    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO class_students (class_id, full_name, phone, note, joined_on, prior_sessions, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ids = db.transaction(() =>
      values.map((v) => insert.run(cls.id, v.fullName, v.phone, v.note, v.joinedOn, v.priorSessions, req.admin.id, now, now).lastInsertRowid)
    )();
    const names = values.map((v) => v.fullName);
    const shown = names.length > 10 ? `${names.slice(0, 10).join(', ')} và ${names.length - 10} học sinh khác` : names.join(', ');
    audit(req, cls, 'add_students', `Thêm ${names.length} học sinh vào lớp "${cls.name}": ${shown}`);
    res.status(201).json({ ids, students: loadStudents(db, cls) });
  });

  // Lịch sử đi học của một học sinh (mới nhất trước) + các lần thu học phí
  router.get('/:id/students/:sid', (req, res) => {
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const history = db
      .prepare(
        `SELECT s.id, s.date, s.start_time, s.end_time, a.status, a.bonus
           FROM attendance a JOIN class_sessions s ON s.id = a.session_id
          WHERE a.student_id = ? ORDER BY s.starts_at DESC`
      )
      .all(st.id)
      .map((r) => ({ sessionId: r.id, date: r.date, startTime: r.start_time, endTime: r.end_time, status: r.status, bonus: r.bonus }));
    const payments = db
      .prepare(
        `SELECT p.*, a.display_name FROM fee_payments p LEFT JOIN admins a ON a.id = p.created_by
          WHERE p.student_id = ? ORDER BY p.cycle_no DESC`
      )
      .all(st.id)
      .map((p) => ({ cycleNo: p.cycle_no, sessionsAt: p.sessions_at, note: p.note, by: p.display_name, createdAt: p.created_at }));
    res.json({ student: loadStudent(db, cls, st.id), history, payments });
  });

  router.post('/:id/students/:sid/update', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const f = studentFields(req.body, st);
    if (f.error) return res.status(400).json({ error: f.error });
    const v = f.value;
    db.prepare(
      `UPDATE class_students SET full_name = ?, phone = ?, note = ?, joined_on = ?, prior_sessions = ?, updated_at = ? WHERE id = ?`
    ).run(v.fullName, v.phone, v.note, v.joinedOn, v.priorSessions, nowIso(), st.id);
    const changes = [];
    if (v.fullName !== st.full_name) changes.push(`tên "${st.full_name}" → "${v.fullName}"`);
    if (v.phone !== st.phone) changes.push(`SĐT "${st.phone || 'trống'}" → "${v.phone || 'trống'}"`);
    if (v.joinedOn !== st.joined_on) changes.push(`ngày vào học ${formatDate(st.joined_on)} → ${formatDate(v.joinedOn)}`);
    if (v.priorSessions !== st.prior_sessions) changes.push(`số buổi học trước đó ${st.prior_sessions} → ${v.priorSessions}`);
    if (v.note !== st.note) changes.push('ghi chú');
    if (changes.length) audit(req, cls, 'update_student', `Sửa học sinh "${v.fullName}" (lớp "${cls.name}"): ${changes.join('; ')}`);
    res.json({ student: loadStudent(db, cls, st.id) });
  });

  // Cho nghỉ học. Học sinh chưa có buổi học / lần thu học phí nào (ví dụ thêm nhầm) thì xóa hẳn.
  router.post('/:id/students/:sid/remove', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const hasHistory =
      db.prepare('SELECT 1 FROM attendance WHERE student_id = ?').get(st.id) ||
      db.prepare('SELECT 1 FROM fee_payments WHERE student_id = ?').get(st.id);
    if (!hasHistory) {
      db.prepare('DELETE FROM class_students WHERE id = ?').run(st.id);
      audit(req, cls, 'delete_student', `Xóa học sinh "${st.full_name}" khỏi lớp "${cls.name}" (chưa học buổi nào)`);
      return res.json({ deleted: true });
    }
    if (!st.removed_at) {
      db.prepare('UPDATE class_students SET removed_at = ?, removed_by = ?, updated_at = ? WHERE id = ?').run(nowIso(), req.admin.id, nowIso(), st.id);
      audit(req, cls, 'remove_student', `Cho học sinh "${st.full_name}" nghỉ học lớp "${cls.name}" (giữ lịch sử điểm danh)`);
    }
    res.json({ deleted: false, student: loadStudent(db, cls, st.id) });
  });

  router.post('/:id/students/:sid/restore', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    if (st.removed_at) {
      db.prepare('UPDATE class_students SET removed_at = NULL, removed_by = NULL, updated_at = ? WHERE id = ?').run(nowIso(), st.id);
      audit(req, cls, 'restore_student', `Cho học sinh "${st.full_name}" học lại lớp "${cls.name}"`);
    }
    res.json({ student: loadStudent(db, cls, st.id) });
  });

  // ----- Học phí -----

  // Đã thu học phí: xong đợt đang tới hạn (hoặc sắp tới hạn — còn 1 buổi — nếu phụ huynh đóng sớm)
  router.post('/:id/students/:sid/fee-paid', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const s = loadStudent(db, cls, st.id);
    if (s.fee.state !== 'due' && s.fee.state !== 'soon') {
      return res.status(400).json({ error: `Học phí của "${st.full_name}" chưa tới hạn nên chưa cần đánh dấu đã thu.` });
    }
    const note = cleanText(req.body?.note, 200);
    const cycle = s.fee.paidCycles + 1;
    db.prepare(
      `INSERT INTO fee_payments (student_id, cycle_no, sessions_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(st.id, cycle, s.stats.sessions, note, req.admin.id, nowIso());
    audit(
      req, cls, 'fee_paid',
      `Đã thu học phí đợt ${cycle} của "${st.full_name}" (lớp "${cls.name}", đã học ${s.stats.sessions} buổi)${note ? `: ${note}` : ''}`
    );
    res.json({ student: loadStudent(db, cls, st.id) });
  });

  router.post('/:id/students/:sid/fee-undo', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const last = db.prepare('SELECT * FROM fee_payments WHERE student_id = ? ORDER BY cycle_no DESC LIMIT 1').get(st.id);
    if (!last) return res.status(400).json({ error: 'Học sinh này chưa có lần thu học phí nào.' });
    db.prepare('DELETE FROM fee_payments WHERE id = ?').run(last.id);
    audit(req, cls, 'fee_undo', `Hoàn tác "Đã thu học phí" đợt ${last.cycle_no} của "${st.full_name}" (lớp "${cls.name}")`);
    res.json({ student: loadStudent(db, cls, st.id) });
  });

  return router;
}

module.exports = classesRouter;
