// API lớp học + học sinh (requireAdmin gắn ở app.js).
// Phân quyền (đã chốt):
//   - owner: mọi lớp; tạo / sửa / xóa lớp, cài học phí, giáo viên phụ trách; thêm / sửa / cho nghỉ học sinh; nhập Excel.
//   - admin (giáo viên): chỉ XEM các lớp mình phụ trách; dữ liệu học sinh đã lọc ở server (classes/students.js studentView):
//     không có tên phụ huynh, SĐT, CCCD, ghi chú, số tiền. Xuất Excel chỉ có tên học sinh + số buổi (+ điểm danh).
//
//   GET  /api/admin/classes                        danh sách lớp (?deleted=1: lớp đã xóa, chỉ owner)
//   POST /api/admin/classes                        tạo lớp (owner)
//   GET  /api/admin/classes/:id                    chi tiết lớp + học sinh
//   POST /api/admin/classes/:id/update             sửa lớp (owner)
//   POST /api/admin/classes/:id/delete             xóa lớp (owner, xóa mềm)
//   POST /api/admin/classes/:id/restore            khôi phục lớp (owner)
//   GET  /api/admin/classes/:id/sessions           mọi buổi học của lớp (đánh số theo thời khóa biểu)
//   POST /api/admin/classes/:id/students           thêm học sinh (owner; thêm tay bắt buộc đủ thông tin, nhập Excel có fileName)
//   GET  /api/admin/classes/:id/students/:sid      lịch sử đi học / bài làm của một học sinh
//   POST /api/admin/classes/:id/students/:sid/update | remove | restore   (owner)
//   GET  /api/admin/classes/import-template        file Excel mẫu (owner)
//   POST /api/admin/classes/:id/import/preview     đọc file Excel danh sách lớp, CHƯA lưu (owner)
//   GET  /api/admin/classes/:id/export             tải danh sách lớp (owner đủ cột; admin tên + số buổi)
// Học phí (thu tiền, tắt cảnh báo, trang theo tháng): routes/tuition.js (chỉ owner).
const express = require('express');
const ExcelJS = require('exceljs');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const { excelUpload, uploadErrorMessage, requireSameOrigin, signatureMatches, originalName } = require('../upload');
const { vnDate, isValidDate, toInstant, formatDate, weekdayOf, WEEKDAY_SHORT } = require('../classes/time');
const { loadStudents, loadStudent, studentView } = require('../classes/students');
const { SESSION_SELECT, toSession, teachersOf } = require('../classes/sessions');
const { readRosterWorkbook, RosterFileError } = require('../classes/rosterExcel');
const { accessOf, addClassTeachers } = require('../classes/access');
const { classTuition, loadTimeline } = require('../classes/tuitionData');
const { styleHeader, sendWorkbook } = require('../utils/excel');
// SĐT phụ huynh: di động 10 số / máy bàn 11 số; CCCD 12 số (CMND cũ 9 số)
const { cleanPhone, cleanIdNumber } = require('../utils/contactInfo');

const COLORS = ['blue', 'sky', 'teal', 'green', 'yellow', 'orange', 'pink', 'purple'];
const MAX_BATCH = 300; // nhập từ Excel tối đa 300 học sinh / lần
const STATUS_LABELS = { paid: 'Đã thu', unpaid: 'Chưa đóng', not_started: 'Chưa bắt đầu' };
const ALERT_LABELS = { red: 'Đỏ', orange: 'Cam', yellow: 'Vàng' };

const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const toInt = (v) => Number.parseInt(v, 10);

/** "150.000" / "150000" / 150000 -> 150000. '' / null -> null (chưa cài). NaN nếu sai. */
function parseMoney(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[.,\s]/g, ''));
  return Number.isInteger(n) && n >= 0 && n <= 100000000 ? n : NaN;
}

function classFields(body, current = null) {
  const name = cleanText(body?.name ?? current?.name, 60);
  const color = COLORS.includes(body?.color) ? body.color : current?.color || 'blue';
  const note = cleanText(body?.note ?? current?.note, 300);
  if (!name) return { error: 'Vui lòng nhập tên lớp.' };
  const f = { name, color, note };
  // Học phí: chỉ owner gửi lên (route chỉ cho owner); để trống = chưa cài
  if (body && ('cycleSessions' in body || !current)) {
    const raw = body?.cycleSessions;
    const x = raw === '' || raw === null || raw === undefined ? null : toInt(raw);
    if (x !== null && (!Number.isInteger(x) || x < 1 || x > 200)) return { error: 'Số buổi mỗi chu kỳ học phí phải từ 1 đến 200.' };
    f.cycleSessions = x;
  } else f.cycleSessions = current.cycle_sessions;
  if (body && ('pricePerSession' in body || !current)) {
    const p = parseMoney(body?.pricePerSession);
    if (Number.isNaN(p)) return { error: 'Học phí mỗi buổi phải là số tiền (VNĐ), ví dụ 150000.' };
    f.pricePerSession = p;
  } else f.pricePerSession = current.price_per_session;
  return f;
}

/**
 * Kiểm tra dữ liệu một học sinh. Trả { value } hoặc { error }.
 * requireAll: thêm TAY thì bắt buộc đủ tên học sinh, tên phụ huynh, SĐT phụ huynh, CCCD phụ huynh (đã chốt);
 * nhập Excel và sửa thì chỉ bắt buộc tên học sinh.
 */
function studentFields(body, current = null, { requireAll = false } = {}) {
  const pick = (key, col) => (body && key in body ? body[key] : current?.[col]);
  const fullName = cleanText(pick('fullName', 'full_name'), 80);
  if (!fullName) return { error: 'Vui lòng nhập họ tên học sinh.' };
  const parentName = cleanText(pick('parentName', 'parent_name'), 80);
  // Dữ liệu cũ có thể chưa đúng mẫu: không gửi lại thì giữ nguyên, không chặn việc sửa trường khác
  const phoneIn = body && ('parentPhone' in body || 'phone' in body) ? body.parentPhone ?? body.phone : undefined;
  const parentPhone = phoneIn === undefined ? current?.phone || '' : cleanPhone(phoneIn);
  if (parentPhone === null) return { error: `SĐT phụ huynh của "${fullName}" không đúng (gồm 10 số, ví dụ 0901234567).` };
  const idIn = body && 'parentIdNumber' in body ? body.parentIdNumber : undefined;
  const parentIdNumber = idIn === undefined ? current?.parent_id_number || '' : cleanIdNumber(idIn);
  if (parentIdNumber === null) return { error: `Số CCCD phụ huynh của "${fullName}" không đúng (CCCD gồm 12 số).` };
  if (requireAll) {
    const missing = [!parentName && 'tên phụ huynh', !parentPhone && 'SĐT phụ huynh', !parentIdNumber && 'CCCD phụ huynh'].filter(Boolean);
    if (missing.length) return { error: `Vui lòng nhập ${missing.join(', ')} cho "${fullName}".` };
  }
  // Ghi chú dài vì khi nhập Excel, các cột lạ (ngày sinh, trường...) được gộp vào đây
  const note = cleanText(pick('note', 'note'), 500);
  const discountRaw = pick('discountPercent', 'discount_percent') ?? 0;
  const discountPercent = discountRaw === '' || discountRaw === null ? 0 : toInt(discountRaw);
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: 'Giảm giá phải từ 0 đến 100 (%).' };
  }
  const discountNote = cleanText(pick('discountNote', 'discount_note'), 200);
  return { value: { fullName, parentName, parentPhone, parentIdNumber, note, discountPercent, discountNote } };
}

/** Lời nhắc dễ hiểu khi chọn file Excel đời cũ (.xls) hoặc .csv thay vì .xlsx */
function importUploadError(err, config) {
  const ext = (/File "(.+)"/.exec(err.message || '')?.[1] || '').split('.').pop().toLowerCase();
  if (ext === 'xls') {
    return 'File .xls (Excel đời cũ) chưa đọc được. Hãy mở file bằng Excel → "Lưu thành" (Save As) → chọn "Excel Workbook (.xlsx)" rồi chọn lại file mới.';
  }
  if (ext === 'csv') {
    return 'File .csv chưa đọc được. Hãy mở file bằng Excel rồi "Lưu thành" dạng .xlsx (Google Trang tính: Tệp → Tải xuống → Microsoft Excel).';
  }
  return uploadErrorMessage(err, config);
}

function classesRouter(db, config) {
  const router = express.Router();
  // Tải file lên (multipart) kiểm tra Origin; mọi request khác phải là JSON
  router.use((req, res, next) => (req.is('multipart/form-data') ? requireSameOrigin(req, res, next) : requireJson(req, res, next)));
  const uploadExcel = excelUpload(config).single('file');

  const isOwner = (req) => req.admin.role === 'owner';
  function ownerOnly(req, res) {
    if (isOwner(req)) return true;
    res.status(403).json({ error: 'Chỉ admin chính mới làm được việc này.' });
    return false;
  }

  /**
   * Lấy lớp theo :id và kiểm tra quyền: admin chỉ lớp mình phụ trách; lớp đã xóa chỉ owner thấy (allowDeleted).
   * Gửi lỗi và trả null nếu không được.
   */
  function loadClass(req, res, { allowDeleted = false } = {}) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(toInt(req.params.id) || 0);
    const access = accessOf(db, req.admin);
    if (!cls || (cls.deleted_at && !(allowDeleted && access.isOwner))) {
      res.status(404).json({ error: 'Không tìm thấy lớp học (có thể lớp đã bị xóa).' });
      return null;
    }
    if (!access.canSeeClass(cls.id)) {
      res.status(403).json({ error: 'Bạn không phụ trách lớp này.' });
      return null;
    }
    req.access = access;
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
  const teachersOfClass = (classId) =>
    db.prepare(
      `SELECT a.id, a.display_name AS name FROM class_teachers ct JOIN admins a ON a.id = ct.admin_id
        WHERE ct.class_id = ? ORDER BY a.display_name COLLATE NOCASE`
    ).all(classId);

  /** Buổi bắt đầu học mặc định: buổi sắp tới gần nhất của lớp (đang học cũng tính); chưa có lịch thì từ bây giờ */
  function defaultStartAt(classId) {
    const next = db.prepare('SELECT starts_at FROM class_sessions WHERE class_id = ? AND ends_at > ? ORDER BY starts_at LIMIT 1').get(classId, nowIso());
    return next ? next.starts_at : nowIso();
  }

  /**
   * Buổi bắt đầu học từ dữ liệu gửi lên: startSessionId (chọn một buổi của lớp), hoặc joinedOn (ngày, khi nhập Excel).
   * Trả { startAt } | { error } | {} (không gửi gì).
   */
  function readStart(body, classId) {
    if (body?.startSessionId) {
      const s = db.prepare('SELECT starts_at FROM class_sessions WHERE id = ? AND class_id = ?').get(toInt(body.startSessionId) || 0, classId);
      if (!s) return { error: 'Buổi bắt đầu học không có trong lịch của lớp.' };
      return { startAt: s.starts_at };
    }
    if (body?.joinedOn) {
      if (!isValidDate(String(body.joinedOn))) return { error: 'Ngày vào học không đúng.' };
      return { startAt: toInstant(String(body.joinedOn), '00:00') };
    }
    return {};
  }

  /** Lớp gửi cho trình duyệt. Học phí (X, giá) chỉ owner thấy. */
  function toClass(cls, access) {
    const now = nowIso();
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM class_students WHERE class_id = ? AND removed_at IS NULL) AS students,
                (SELECT COUNT(*) FROM class_sessions WHERE class_id = ? AND ends_at <= ?) AS done,
                (SELECT COUNT(*) FROM class_sessions WHERE class_id = ? AND starts_at > ?) AS upcoming`
      )
      .get(cls.id, cls.id, now, cls.id, now);
    const next = db.prepare(`${SESSION_SELECT} WHERE s.class_id = ? AND s.ends_at > ? ORDER BY s.starts_at LIMIT 1`).get(cls.id, now);
    const view = {
      id: cls.id,
      name: cls.name,
      color: cls.color,
      note: cls.note,
      deletedAt: cls.deleted_at,
      createdAt: cls.created_at,
      teachers: teachersOfClass(cls.id),
      studentCount: counts.students,
      doneSessions: counts.done, // buổi đã qua trên thời khóa biểu
      upcomingSessions: counts.upcoming,
      nextSession: next
        ? { id: next.id, date: next.date, startTime: next.start_time, endTime: next.end_time, teacherName: teachersOf(next).map((t) => t.name).concat(next.teacher_name || []).join(', ') }
        : null,
      tuitionConfigured: Boolean(cls.cycle_sessions && cls.price_per_session !== null),
    };
    if (access.isOwner) {
      view.cycleSessions = cls.cycle_sessions;
      view.pricePerSession = cls.price_per_session;
    }
    return view;
  }

  /** Học sinh của lớp kèm học phí, đã lọc theo vai trò */
  function studentsOf(cls, access) {
    const students = loadStudents(db, cls);
    const { map } = classTuition(db, cls, students);
    return students.map((s) => studentView(s, access.isOwner, map.get(s.id)));
  }

  // ----- Lớp học -----

  // File Excel mẫu danh sách lớp (owner — vì có cột thông tin phụ huynh)
  router.get('/import-template', async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    const ws = wb.addWorksheet('Danh sách lớp', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Họ và tên', width: 28 },
      { header: 'Tên phụ huynh', width: 24 },
      { header: 'SĐT phụ huynh', width: 15, style: { numFmt: '@' } }, // kiểu chữ: không mất số 0 ở đầu
      { header: 'CCCD phụ huynh', width: 16, style: { numFmt: '@' } },
      { header: 'Ngày vào học', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Ghi chú', width: 40 },
    ];
    styleHeader(ws.getRow(1));
    const guide = wb.addWorksheet('Hướng dẫn');
    guide.getColumn(1).width = 110;
    [
      'Cách điền danh sách lớp',
      '1. Mỗi dòng ở trang «Danh sách lớp» là một học sinh. Khi nhập từ Excel chỉ cột "Họ và tên" là bắt buộc.',
      '2. SĐT phụ huynh: gõ đủ 10 số, ví dụ 0901234567. CCCD: 12 số. Hai cột này đã để kiểu chữ nên không mất số 0.',
      '3. Ngày vào học: ví dụ 13/10/2026 -> học sinh bắt đầu từ buổi đầu tiên của lớp từ ngày đó. Để trống thì web dùng ngày bạn chọn lúc nhập.',
      '4. Muốn thêm cột khác (ngày sinh, trường...) cứ thêm: web sẽ gộp vào phần Ghi chú.',
      '5. Không dùng file mẫu này cũng được: file danh sách có sẵn của bạn (tên cột khác) web vẫn tự nhận cột.',
    ].forEach((t, i) => {
      const row = guide.addRow([t]);
      if (i === 0) row.font = { bold: true, size: 14 };
    });
    await sendWorkbook(res, wb, 'mau-danh-sach-lop.xlsx');
  });

  router.get('/', (req, res) => {
    const access = accessOf(db, req.admin);
    const deleted = req.query.deleted === '1';
    if (deleted && !access.isOwner) return res.status(403).json({ error: 'Chỉ admin chính mới xem được lớp đã xóa.' });
    const rows = db
      .prepare(`SELECT * FROM classes WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY name COLLATE NOCASE`)
      .all()
      .filter((cls) => access.canSeeClass(cls.id));
    const classes = rows.map((cls) => {
      const students = loadStudents(db, cls).filter((s) => s.isActive);
      const { map } = classTuition(db, cls, students);
      const alerts = { red: 0, orange: 0, yellow: 0 };
      for (const t of map.values()) if (t.alert) alerts[t.alert.level] += 1;
      return { ...toClass(cls, access), alerts };
    });
    res.json({ classes });
  });

  // Tạo lớp (owner): tên, màu, ghi chú, giáo viên phụ trách, học phí (X buổi / chu kỳ, giá mỗi buổi)
  router.post('/', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const f = classFields(req.body);
    if (f.error) return res.status(400).json({ error: f.error });
    if (nameTaken(f.name)) return res.status(409).json({ error: `Đã có lớp tên "${f.name}". Vui lòng đặt tên khác.` });
    const teacherIds = readTeacherIds(req.body);
    if (teacherIds.error) return res.status(400).json({ error: teacherIds.error });
    const now = nowIso();
    const id = db.transaction(() => {
      const newId = db
        .prepare(
          `INSERT INTO classes (name, color, note, cycle_sessions, price_per_session, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(f.name, f.color, f.note, f.cycleSessions, f.pricePerSession, req.admin.id, now, now).lastInsertRowid;
      addClassTeachers(db, newId, teacherIds.ids);
      return newId;
    })();
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
    const fee = f.cycleSessions && f.pricePerSession !== null ? ` (học phí ${f.pricePerSession.toLocaleString('vi-VN')}đ/buổi, chu kỳ ${f.cycleSessions} buổi)` : '';
    audit(req, cls, 'create_class', `Tạo lớp "${f.name}"${fee}`);
    res.status(201).json({ class: toClass(cls, accessOf(db, req.admin)) });
  });

  /** Giáo viên phụ trách gửi lên: { teacherIds: [...] } -> { ids } | { error } */
  function readTeacherIds(body) {
    const ids = [...new Set((Array.isArray(body?.teacherIds) ? body.teacherIds : []).map((v) => toInt(v)).filter(Boolean))];
    for (const id of ids) {
      if (!db.prepare('SELECT 1 FROM admins WHERE id = ?').get(id)) return { error: 'Giáo viên đã chọn không tồn tại.' };
    }
    return { ids };
  }

  router.get('/:id', (req, res) => {
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    res.json({ class: toClass(cls, req.access), students: studentsOf(cls, req.access) });
  });

  router.post('/:id/update', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    const f = classFields(req.body, cls);
    if (f.error) return res.status(400).json({ error: f.error });
    if (nameTaken(f.name, cls.id)) return res.status(409).json({ error: `Đã có lớp tên "${f.name}". Vui lòng đặt tên khác.` });
    const before = teachersOfClass(cls.id);
    let teacherIds = null;
    if (Array.isArray(req.body?.teacherIds)) {
      teacherIds = readTeacherIds(req.body);
      if (teacherIds.error) return res.status(400).json({ error: teacherIds.error });
    }
    db.transaction(() => {
      db.prepare('UPDATE classes SET name = ?, color = ?, note = ?, cycle_sessions = ?, price_per_session = ?, updated_at = ? WHERE id = ?').run(
        f.name, f.color, f.note, f.cycleSessions, f.pricePerSession, nowIso(), cls.id
      );
      if (teacherIds) {
        db.prepare('DELETE FROM class_teachers WHERE class_id = ?').run(cls.id);
        addClassTeachers(db, cls.id, teacherIds.ids);
      }
    })();
    const changes = [];
    if (f.name !== cls.name) changes.push(`tên "${cls.name}" → "${f.name}"`);
    if (f.cycleSessions !== cls.cycle_sessions) changes.push(`số buổi mỗi chu kỳ học phí ${cls.cycle_sessions ?? 'chưa cài'} → ${f.cycleSessions ?? 'chưa cài'}`);
    if (f.pricePerSession !== cls.price_per_session) {
      const money = (n) => (n === null ? 'chưa cài' : `${n.toLocaleString('vi-VN')}đ`);
      changes.push(`học phí mỗi buổi ${money(cls.price_per_session)} → ${money(f.pricePerSession)}`);
    }
    if (teacherIds) {
      const after = teachersOfClass(cls.id);
      const b = before.map((t) => t.name).join(', ');
      const a = after.map((t) => t.name).join(', ');
      if (a !== b) changes.push(`giáo viên phụ trách: ${b || 'chưa có'} → ${a || 'chưa có'}`);
    }
    if (f.note !== cls.note) changes.push('ghi chú');
    if (f.color !== cls.color) changes.push('màu');
    if (changes.length) audit(req, cls, 'update_class', `Sửa lớp "${f.name}": ${changes.join('; ')}`);
    res.json({ class: toClass(db.prepare('SELECT * FROM classes WHERE id = ?').get(cls.id), req.access) });
  });

  router.post('/:id/delete', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    db.prepare('UPDATE classes SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(nowIso(), req.admin.id, cls.id);
    audit(req, cls, 'delete_class', `Xóa lớp "${cls.name}" (admin chính khôi phục được)`);
    res.json({ ok: true });
  });

  router.post('/:id/restore', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    if (!cls.deleted_at) return res.json({ class: toClass(cls, req.access) });
    if (nameTaken(cls.name, cls.id)) {
      return res.status(409).json({ error: `Đang có một lớp khác tên "${cls.name}". Hãy đổi tên lớp đó trước rồi khôi phục.` });
    }
    db.prepare('UPDATE classes SET deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?').run(nowIso(), cls.id);
    audit(req, cls, 'restore_class', `Khôi phục lớp "${cls.name}"`);
    res.json({ class: toClass(db.prepare('SELECT * FROM classes WHERE id = ?').get(cls.id), req.access) });
  });

  // Mọi buổi học của lớp (cũ nhất trước), đánh số theo thời khóa biểu, kèm số học sinh có mặt
  router.get('/:id/sessions', (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const rows = db.prepare(`${SESSION_SELECT} WHERE s.class_id = ? ORDER BY s.starts_at, s.id`).all(cls.id);
    const now = Date.now();
    const tl = loadTimeline(db, cls, now);
    const info = new Map(tl.sessions.map((s) => [s.id, s]));
    res.json({
      sessions: rows.map((r) => ({ ...toSession(r, req.admin, now, req.access), no: info.get(r.id)?.no, cycle: info.get(r.id)?.cycle ?? null })),
    });
  });

  // ----- Học sinh (owner) -----

  // Thêm học sinh: { students: [{ fullName, parentName, parentPhone, parentIdNumber, note?, discountPercent?, startSessionId? | joinedOn? }],
  //                  fileName? (nhập từ Excel: chỉ bắt buộc họ tên) }
  router.post('/:id/students', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    const list = Array.isArray(req.body?.students) ? req.body.students : [];
    if (list.length === 0) return res.status(400).json({ error: 'Chưa có học sinh nào để thêm.' });
    if (list.length > MAX_BATCH) return res.status(400).json({ error: `Mỗi lần thêm tối đa ${MAX_BATCH} học sinh.` });
    const fileName = cleanText(req.body?.fileName, 120);
    const fallbackStart = defaultStartAt(cls.id);
    const values = [];
    for (const item of list) {
      const f = studentFields(item, null, { requireAll: !fileName });
      if (f.error) return res.status(400).json({ error: f.error });
      const start = readStart(item, cls.id);
      if (start.error) return res.status(400).json({ error: start.error });
      values.push({ ...f.value, startAt: start.startAt || fallbackStart });
    }
    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO class_students (class_id, full_name, parent_name, phone, parent_id_number, note, discount_percent, discount_note,
                                   start_at, joined_on, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ids = db.transaction(() =>
      values.map((v) =>
        insert.run(cls.id, v.fullName, v.parentName, v.parentPhone, v.parentIdNumber, v.note, v.discountPercent, v.discountNote,
          v.startAt, vnDate(Date.parse(v.startAt)), req.admin.id, now, now).lastInsertRowid
      )
    )();
    const names = values.map((v) => v.fullName);
    const shown = names.length > 10 ? `${names.slice(0, 10).join(', ')} và ${names.length - 10} học sinh khác` : names.join(', ');
    audit(
      req, cls, fileName ? 'import_students' : 'add_students',
      `${fileName ? `Nhập từ file Excel "${fileName}"` : 'Thêm'} ${names.length} học sinh vào lớp "${cls.name}": ${shown}`
    );
    res.status(201).json({ ids, students: studentsOf(cls, req.access) });
  });

  // ----- Nhập / xuất Excel -----

  // Đọc file Excel danh sách lớp (owner): trả về các cột (đã đoán loại) + các dòng để xem lại. KHÔNG lưu gì.
  router.post(
    '/:id/import/preview',
    (req, res, next) => {
      if (!ownerOnly(req, res)) return;
      uploadExcel(req, res, (err) => (err ? res.status(400).json({ error: importUploadError(err, config) }) : next()));
    },
    async (req, res) => {
      const cls = loadClass(req, res);
      if (!cls) return;
      if (!req.file) return res.status(400).json({ error: 'Chưa chọn file Excel.' });
      if (!signatureMatches('xlsx', req.file.buffer)) {
        return res.status(400).json({ error: 'File không phải file Excel (.xlsx) hợp lệ.' });
      }
      try {
        const sheet = Number.parseInt(req.query.sheet, 10);
        const result = await readRosterWorkbook(req.file.buffer, { sheetIndex: Number.isInteger(sheet) ? sheet : undefined });
        res.json({ fileName: originalName(req.file), ...result });
      } catch (err) {
        if (err instanceof RosterFileError) return res.status(400).json({ error: err.message });
        throw err;
      }
    }
  );

  // Tải danh sách lớp về Excel. Owner: đủ cột (phụ huynh, CCCD, SĐT, học phí). Admin: chỉ tên + số buổi.
  // Trang 2: điểm danh từng buổi.
  router.get('/:id/export', async (req, res) => {
    const cls = loadClass(req, res);
    if (!cls) return;
    const owner = req.access.isOwner;
    const students = loadStudents(db, cls);
    const { tl, map } = classTuition(db, cls, students);
    const sessions = db
      .prepare('SELECT * FROM class_sessions WHERE class_id = ? AND attendance_at IS NOT NULL ORDER BY starts_at')
      .all(cls.id);
    const marks = new Map(
      db.prepare(
        `SELECT a.session_id, a.student_id, a.status, a.bonus FROM attendance a
           JOIN class_sessions s ON s.id = a.session_id WHERE s.class_id = ?`
      ).all(cls.id).map((a) => [`${a.session_id}:${a.student_id}`, a])
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    // Trang 1: tên cột trùng với lúc nhập (Họ và tên, Tên phụ huynh, SĐT phụ huynh, CCCD phụ huynh, Ghi chú) để nhập lại được;
    // các cột thống kê được bỏ qua khi nhập lại (classes/rosterExcel.js SKIP_EXACT)
    const ws = wb.addWorksheet('Danh sách lớp', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = owner
      ? [
          { header: 'STT', key: 'stt', width: 6 },
          { header: 'Họ và tên', key: 'name', width: 26 },
          { header: 'Tên phụ huynh', key: 'parent', width: 22 },
          { header: 'SĐT phụ huynh', key: 'phone', width: 14, style: { numFmt: '@' } },
          { header: 'CCCD phụ huynh', key: 'idNo', width: 15, style: { numFmt: '@' } },
          { header: 'Buổi bắt đầu', key: 'start', width: 18 },
          { header: 'Trạng thái', key: 'status', width: 11 },
          { header: 'Tổng số buổi', key: 'sessions', width: 9 },
          { header: 'Có mặt', key: 'present', width: 8 },
          { header: 'Đi muộn', key: 'late', width: 8 },
          { header: 'Vắng có phép', key: 'excused', width: 9 },
          { header: 'Vắng không phép', key: 'absent', width: 10 },
          { header: 'Điểm cộng', key: 'bonus', width: 9 },
          { header: 'Giảm giá (%)', key: 'discount', width: 9 },
          { header: 'Tình trạng học phí', key: 'fee', width: 22 },
          { header: 'Cảnh báo', key: 'alert', width: 10 },
          { header: 'Ghi chú', key: 'note', width: 40 },
        ]
      : [
          { header: 'STT', key: 'stt', width: 6 },
          { header: 'Họ và tên', key: 'name', width: 28 },
          { header: 'Tổng số buổi', key: 'sessions', width: 12 },
        ];
    students.forEach((s, i) => {
      const t = map.get(s.id);
      const row = { stt: i + 1, name: s.fullName, sessions: t.sessionsDone };
      if (owner) {
        const fee = t.labels.current ? `Kì ${t.labels.currentCycle}: ${STATUS_LABELS[t.labels.current]}` : tl.configured ? '' : 'Lớp chưa cài học phí';
        Object.assign(row, {
          parent: s.parentName,
          phone: s.parentPhone,
          idNo: s.parentIdNumber,
          start: t.startNo ? `Buổi ${t.startNo} (${formatDate(t.startDate)})` : '',
          status: s.isActive ? 'Đang học' : 'Đã nghỉ',
          present: s.stats.present,
          late: s.stats.late,
          excused: s.stats.excused,
          absent: s.stats.absent,
          bonus: s.stats.bonus,
          discount: s.discountPercent || '',
          fee: s.isActive ? fee : '',
          alert: t.alert ? ALERT_LABELS[t.alert.level] : '',
          note: s.note,
        });
      }
      ws.addRow(row);
    });
    styleHeader(ws.getRow(1));

    // Trang 2: mỗi học sinh một dòng, mỗi buổi đã điểm danh một cột
    const LETTER = { present: 'C', late: 'M', excused: 'P', absent: 'V' };
    const FILL = { present: 'FFE3F6EA', late: 'FFFFF2CF', excused: 'FFE6EFFF', absent: 'FFFDEAEA' };
    const att = wb.addWorksheet('Điểm danh', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    att.addRow(['Họ và tên', ...sessions.map((s) => `${WEEKDAY_SHORT[weekdayOf(s.date)]} ${s.date.slice(8, 10)}/${s.date.slice(5, 7)}\n${s.start_time}`)]);
    for (const st of students) {
      const row = att.addRow([st.fullName, ...sessions.map((s) => {
        const m = marks.get(`${s.id}:${st.id}`);
        return m ? `${LETTER[m.status]}${m.bonus ? ` +${m.bonus}` : ''}` : '';
      })]);
      sessions.forEach((s, i) => {
        const m = marks.get(`${s.id}:${st.id}`);
        const cell = row.getCell(i + 2);
        cell.alignment = { horizontal: 'center' };
        if (m) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[m.status] } };
      });
    }
    att.getColumn(1).width = 28;
    for (let i = 2; i <= sessions.length + 1; i++) att.getColumn(i).width = 9;
    styleHeader(att.getRow(1));
    att.getRow(1).height = 36;
    att.addRow([]);
    att.addRow(['C = Có mặt · M = Đi muộn · P = Vắng có phép · V = Vắng không phép · +n = điểm cộng · ô trống = chưa vào lớp / đã nghỉ']).font = { italic: true };

    logAudit(db, {
      adminId: req.admin.id, action: 'export_class', classId: cls.id,
      detail: `Tải danh sách lớp "${cls.name}" về Excel (${students.length} học sinh${owner ? ', đủ thông tin' : ', chỉ tên + số buổi'})`,
    });
    await sendWorkbook(res, wb, `Lop ${cls.name} ${vnDate().split('-').reverse().join('-')}.xlsx`);
  });

  // Lịch sử của một học sinh: điểm danh từng buổi (bấm "vắng" để xem vắng buổi nào), bài đã làm.
  // Owner xem thêm: thông tin đủ (qua studentView). Thu học phí xem ở /api/admin/tuition/students/:sid.
  router.get('/:id/students/:sid', (req, res) => {
    const cls = loadClass(req, res, { allowDeleted: true });
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const tl = loadTimeline(db, cls);
    const no = new Map(tl.sessions.map((s) => [s.id, s.no]));
    const history = db
      .prepare(
        `SELECT s.id, s.date, s.start_time, s.end_time, a.status, a.bonus
           FROM attendance a JOIN class_sessions s ON s.id = a.session_id
          WHERE a.student_id = ? ORDER BY s.starts_at DESC`
      )
      .all(st.id)
      .map((r) => ({ sessionId: r.id, no: no.get(r.id) ?? null, date: r.date, startTime: r.start_time, endTime: r.end_time, status: r.status, bonus: r.bonus }));
    // Các bài học sinh đã làm (Class Assignment: học sinh bấm tên mình trong lớp), mới nhất trước
    const attempts = db
      .prepare(
        `SELECT a.id, a.status, a.started_at, a.submitted_at, a.correct_count, a.question_total, a.score10, a.total_score,
                v.title, e.id AS exam_id, e.code
           FROM attempts a
           JOIN students s ON s.id = a.student_id
           JOIN exam_versions v ON v.id = a.exam_version_id
           JOIN exams e ON e.id = v.exam_id
          WHERE s.class_student_id = ?
          ORDER BY a.started_at DESC`
      )
      .all(st.id)
      .map((a) => ({
        id: a.id, status: a.status, startedAt: a.started_at, submittedAt: a.submitted_at, examId: a.exam_id, examTitle: a.title,
        examCode: a.code, correct: a.correct_count, total: a.question_total, score10: a.score10, totalScore: a.total_score,
      }));
    const s = loadStudent(db, cls, st.id);
    const { map } = classTuition(db, cls, [s]);
    res.json({ student: studentView(s, req.access.isOwner, map.get(s.id)), history, attempts });
  });

  router.post('/:id/students/:sid/update', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const f = studentFields(req.body, st); // sửa: không bắt buộc đủ (đã chốt), học sinh thiếu thông tin có nhãn nhắc
    if (f.error) return res.status(400).json({ error: f.error });
    const start = readStart(req.body, cls.id);
    if (start.error) return res.status(400).json({ error: start.error });
    const v = f.value;
    const startAt = start.startAt || st.start_at;
    db.prepare(
      `UPDATE class_students SET full_name = ?, parent_name = ?, phone = ?, parent_id_number = ?, note = ?, discount_percent = ?,
              discount_note = ?, start_at = ?, joined_on = ?, updated_at = ? WHERE id = ?`
    ).run(v.fullName, v.parentName, v.parentPhone, v.parentIdNumber, v.note, v.discountPercent, v.discountNote, startAt,
      startAt ? vnDate(Date.parse(startAt)) : st.joined_on, nowIso(), st.id);
    if (v.fullName !== st.full_name) {
      // Tên hiện ở trang Kết quả / Hoạt động của các bài học sinh này đã làm
      const words = v.fullName.split(' ');
      db.prepare('UPDATE students SET last_name = ?, first_name = ? WHERE class_student_id = ?').run(words.slice(0, -1).join(' '), words.at(-1), st.id);
    }
    const changes = [];
    if (v.fullName !== st.full_name) changes.push(`tên "${st.full_name}" → "${v.fullName}"`);
    if (v.parentName !== st.parent_name) changes.push('tên phụ huynh');
    if (v.parentPhone !== st.phone) changes.push('SĐT phụ huynh');
    if (v.parentIdNumber !== st.parent_id_number) changes.push('CCCD phụ huynh');
    if (startAt !== st.start_at) {
      const tl = loadTimeline(db, cls);
      const first = (at) => tl.sessions.find((s) => !at || s.startsAt >= at);
      const label = (at) => (first(at) ? `buổi ${first(at).no} (${formatDate(first(at).date)})` : formatDate(vnDate(Date.parse(at))));
      changes.push(`buổi bắt đầu học ${label(st.start_at)} → ${label(startAt)}`);
    }
    if (v.discountPercent !== st.discount_percent) changes.push(`giảm giá ${st.discount_percent}% → ${v.discountPercent}%`);
    if (v.note !== st.note || v.discountNote !== st.discount_note) changes.push('ghi chú');
    if (changes.length) audit(req, cls, 'update_student', `Sửa học sinh "${v.fullName}" (lớp "${cls.name}"): ${changes.join('; ')}`);
    const s = loadStudent(db, cls, st.id);
    res.json({ student: studentView(s, true, classTuition(db, cls, [s]).map.get(s.id)) });
  });

  // Cho nghỉ học. Học sinh chưa có lịch sử nào (điểm danh, thu học phí, bài làm — ví dụ thêm nhầm) thì xóa hẳn.
  router.post('/:id/students/:sid/remove', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    const hasHistory =
      db.prepare('SELECT 1 FROM attendance WHERE student_id = ?').get(st.id) ||
      db.prepare('SELECT 1 FROM fee_payments WHERE student_id = ?').get(st.id) ||
      db.prepare('SELECT 1 FROM tuition_payments WHERE student_id = ?').get(st.id) ||
      db.prepare('SELECT 1 FROM tuition_events WHERE student_id = ?').get(st.id) ||
      db.prepare('SELECT 1 FROM attempts a JOIN students s ON s.id = a.student_id WHERE s.class_student_id = ?').get(st.id);
    if (!hasHistory) {
      db.transaction(() => {
        db.prepare('DELETE FROM students WHERE class_student_id = ?').run(st.id); // người làm bài chưa có bài nào
        db.prepare('DELETE FROM class_students WHERE id = ?').run(st.id);
      })();
      audit(req, cls, 'delete_student', `Xóa học sinh "${st.full_name}" khỏi lớp "${cls.name}" (chưa có lịch sử)`);
      return res.json({ deleted: true });
    }
    if (!st.removed_at) {
      db.prepare('UPDATE class_students SET removed_at = ?, removed_by = ?, updated_at = ? WHERE id = ?').run(nowIso(), req.admin.id, nowIso(), st.id);
      audit(req, cls, 'remove_student', `Cho học sinh "${st.full_name}" nghỉ học lớp "${cls.name}" (giữ lịch sử điểm danh, học phí)`);
    }
    res.json({ deleted: false });
  });

  router.post('/:id/students/:sid/restore', (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cls = loadClass(req, res);
    if (!cls) return;
    const st = loadStudentRow(req, res, cls);
    if (!st) return;
    if (st.removed_at) {
      db.prepare('UPDATE class_students SET removed_at = NULL, removed_by = NULL, updated_at = ? WHERE id = ?').run(nowIso(), st.id);
      audit(req, cls, 'restore_student', `Cho học sinh "${st.full_name}" học lại lớp "${cls.name}"`);
    }
    res.json({ ok: true });
  });

  return router;
}

module.exports = classesRouter;
module.exports.parseMoney = parseMoney;
