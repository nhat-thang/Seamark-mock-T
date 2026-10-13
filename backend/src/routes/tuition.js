// API QUẢN LÝ HỌC PHÍ — CHỈ admin chính (requireOwner gắn ở app.js; giáo viên gọi vào bị 403).
//   GET  /api/admin/tuition?month=YYYY-MM              học phí theo tháng: từng lớp, từng học sinh
//   GET  /api/admin/tuition/export?month=YYYY-MM       tải bảng học phí của tháng về Excel
//   GET  /api/admin/tuition/students/:sid              lịch sử thu học phí của một học sinh (mọi chu kỳ)
//   GET  /api/admin/tuition/students/:sid/export       tải lịch sử thu của học sinh về Excel
//   POST /api/admin/tuition/students/:sid/pay          Chưa đóng -> Đã thu (chốt số tiền, ngày thu, hình thức)
//   POST /api/admin/tuition/students/:sid/unpay        Đã thu -> Chưa đóng (phải nhập lại mật khẩu)
//   POST /api/admin/tuition/students/:sid/snooze       tắt cảnh báo của một chu kỳ
//   POST /api/admin/tuition/students/:sid/unsnooze     bật lại cảnh báo của chu kỳ đó
// Cách tính (chu kỳ, hạn đóng, số tiền, cảnh báo): utils/tuition.js.
const express = require('express');
const ExcelJS = require('exceljs');
const { requireJson } = require('../auth/middleware');
const { verifyPassword } = require('../auth/password');
const { rateLimit } = require('../rateLimit');
const { logAudit } = require('../audit');
const T = require('../utils/tuition');
const { vnDate, isValidDate, formatDate, addDays } = require('../classes/time');
const { loadStudents, loadStudent, studentView } = require('../classes/students');
const { classTuition } = require('../classes/tuitionData');
const { styleHeader, fillRow, sendWorkbook, excelDate, MONEY_FMT } = require('../utils/excel');

const METHODS = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
const STATUS_LABELS = { paid: 'Đã thu', unpaid: 'Chưa đóng', not_due: 'Chưa đến hạn' };
const ABSENCE_LABELS = { excused: 'Vắng có phép', absent: 'Vắng không phép' };
const EVENT_LABELS = { pay: 'Thu học phí', unpay: 'Bỏ "Đã thu"', snooze: 'Tắt cảnh báo', unsnooze: 'Bật lại cảnh báo' };

const toInt = (v) => Number.parseInt(v, 10);
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

function tuitionRouter(db) {
  const router = express.Router();
  router.use(requireJson);
  // Nhập lại mật khẩu khi bỏ "Đã thu": chặn dò mật khẩu
  const unpayLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });

  const teachersOfClass = (classId) =>
    db.prepare(
      `SELECT a.display_name AS name FROM class_teachers ct JOIN admins a ON a.id = ct.admin_id
        WHERE ct.class_id = ? ORDER BY a.display_name COLLATE NOCASE`
    ).all(classId).map((t) => t.name);

  const cycleView = (cy, snoozed) => ({
    cycleNo: cy.cycleNo,
    firstNo: cy.firstNo,
    lastNo: cy.lastNo,
    sessionCount: cy.sessionCount,
    sessions: cy.sessions.map((s) => ({ id: s.id, no: s.no, date: s.date, passed: s.passed })),
    amount: cy.amount,
    dueDate: cy.dueDate,
    mismatch: cy.mismatch,
    snoozed: snoozed.includes(cy.cycleNo),
    payment: cy.payment && {
      amount: cy.payment.amount, paidOn: cy.payment.paidOn, method: cy.payment.method, note: cy.payment.note, by: cy.payment.by,
      sessionCount: cy.payment.sessionCount,
    },
  });

  /** Học phí của mọi lớp (chưa xóa) trong một tháng */
  function monthReport(month, now = Date.now()) {
    const classes = db.prepare('SELECT * FROM classes WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE').all();
    const out = [];
    for (const cls of classes) {
      const students = loadStudents(db, cls);
      const { tl, map } = classTuition(db, cls, students, now);
      // Buổi nghỉ trong tháng của từng học sinh (vắng có phép / không phép)
      const no = new Map(tl.sessions.map((s) => [s.id, s.no]));
      const absences = new Map();
      for (const a of db
        .prepare(
          `SELECT a.student_id, a.status, s.id AS session_id, s.date, s.start_time FROM attendance a
             JOIN class_sessions s ON s.id = a.session_id
            WHERE s.class_id = ? AND a.status IN ('absent', 'excused') AND substr(s.date, 1, 7) = ? ORDER BY s.starts_at`
        )
        .all(cls.id, month)) {
        if (!absences.has(a.student_id)) absences.set(a.student_id, []);
        absences.get(a.student_id).push({ sessionId: a.session_id, no: no.get(a.session_id) ?? null, date: a.date, startTime: a.start_time, status: a.status });
      }
      const rows = [];
      for (const s of students) {
        const t = map.get(s.id);
        const m = T.studentMonth(tl, { startAt: s.startAt, removedAt: s.removedAt }, t.cycles, month);
        // Học sinh đã nghỉ: chỉ hiện nếu tháng này còn liên quan (có học, có kì đến hạn, còn nợ)
        if (!s.isActive && !m.dueCycles.length && !m.olderUnpaid.length && !m.sessionsDoneInMonth) continue;
        rows.push({
          id: s.id,
          fullName: s.fullName,
          isActive: s.isActive,
          missingInfo: !s.parentName || !s.parentPhone || !s.parentIdNumber,
          startNo: t.startNo,
          startDate: t.startDate,
          sessionsDone: m.sessionsDone,
          sessionsDoneInMonth: m.sessionsDoneInMonth,
          absences: absences.get(s.id) || [],
          discountPercent: s.discountPercent,
          discountNote: s.discountNote,
          due: m.due,
          paid: m.paid,
          missing: m.due - m.paid,
          status: m.status,
          dueCycles: m.dueCycles.map((cy) => cycleView(cy, t.snoozedCycles)),
          olderUnpaid: m.olderUnpaid.map((cy) => ({ cycleNo: cy.cycleNo, amount: cy.amount, dueDate: cy.dueDate, snoozed: t.snoozedCycles.includes(cy.cycleNo) })),
          alert: t.alert && { ...t.alert, amount: t.alertAmount },
        });
      }
      const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
      const hasDue = rows.some((r) => r.dueCycles.length);
      out.push({
        id: cls.id,
        name: cls.name,
        color: cls.color,
        teachers: teachersOfClass(cls.id),
        configured: tl.configured,
        cycleSessions: cls.cycle_sessions,
        pricePerSession: cls.price_per_session,
        sessionsDone: tl.passedCount,
        sessionsDoneInMonth: tl.sessions.filter((s) => s.passed && s.date.slice(0, 7) === month).length,
        totalSessions: tl.total,
        gap: T.scheduleGap(tl),
        due: sum('due'),
        paid: sum('paid'),
        missing: sum('missing'),
        status: !hasDue ? 'not_due' : rows.every((r) => r.status !== 'unpaid') ? 'paid' : 'unpaid',
        students: rows,
      });
    }
    const total = (k) => out.reduce((n, c) => n + c[k], 0);
    return { month, today: vnDate(now), classes: out, totals: { due: total('due'), paid: total('paid'), missing: total('missing') } };
  }

  function readMonth(req, res) {
    const month = String(req.query.month || vnDate().slice(0, 7));
    if (!isMonth(month)) {
      res.status(400).json({ error: 'Tháng không hợp lệ.' });
      return null;
    }
    return month;
  }

  /** Học sinh theo :sid (kể cả lớp đã xóa, học sinh đã nghỉ) */
  function loadTarget(req, res) {
    const row = db.prepare('SELECT class_id FROM class_students WHERE id = ?').get(toInt(req.params.sid) || 0);
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return null;
    }
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(row.class_id);
    const student = loadStudent(db, cls, toInt(req.params.sid));
    const { tl, map } = classTuition(db, cls, [student]);
    return { cls, student, tl, tuition: map.get(student.id) };
  }

  /** Lịch sử thu học phí của một học sinh */
  function studentHistory(target) {
    const { cls, student, tl, tuition } = target;
    const events = db
      .prepare(
        `SELECT e.*, a.display_name AS by_name FROM tuition_events e LEFT JOIN admins a ON a.id = e.created_by
          WHERE e.student_id = ? ORDER BY e.created_at DESC, e.id DESC`
      )
      .all(student.id)
      .map((e) => ({
        id: e.id, cycleNo: e.cycle_no, action: e.action, amount: e.amount, paidOn: e.paid_on, method: e.method, note: e.note,
        by: e.by_name, createdAt: e.created_at,
      }));
    // Bấm "đã đóng" theo cách cũ (trước khi tính học phí theo buổi) — chỉ để xem lại
    const legacy = db
      .prepare(
        `SELECT f.cycle_no, f.sessions_at, f.note, f.created_at, a.display_name AS by_name FROM fee_payments f
           LEFT JOIN admins a ON a.id = f.created_by WHERE f.student_id = ? ORDER BY f.created_at DESC`
      )
      .all(student.id)
      .map((f) => ({ cycleNo: f.cycle_no, sessionsAt: f.sessions_at, note: f.note, by: f.by_name, createdAt: f.created_at }));
    return {
      student: studentView(student, true, tuition),
      class: {
        id: cls.id, name: cls.name, color: cls.color, deleted: Boolean(cls.deleted_at),
        configured: tl.configured, cycleSessions: cls.cycle_sessions, pricePerSession: cls.price_per_session,
        totalSessions: tl.total, currentCycle: tl.currentCycle, gap: T.scheduleGap(tl),
      },
      cycles: tuition.cycles.map((cy) => cycleView(cy, tuition.snoozedCycles)),
      events,
      legacy,
    };
  }

  /** Chu kỳ :cycleNo của học sinh (phải là chu kỳ đã xếp đủ lịch). Gửi lỗi và trả null nếu không có. */
  function findCycle(res, target, cycleNo) {
    const cy = target.tuition.cycles.find((c) => c.cycleNo === cycleNo);
    if (!target.tl.configured) {
      res.status(400).json({ error: `Lớp "${target.cls.name}" chưa cài học phí (số buổi mỗi kì, học phí mỗi buổi).` });
      return null;
    }
    if (!cy) {
      res.status(400).json({ error: `Không có kì ${cycleNo} của học sinh này (có thể lớp chưa xếp đủ lịch của kì đó).` });
      return null;
    }
    return cy;
  }

  const audit = (req, target, action, detail) => logAudit(db, { adminId: req.admin.id, action, classId: target.cls.id, detail });
  const event = (req, target, cycleNo, action, extra = {}) =>
    db.prepare(
      `INSERT INTO tuition_events (student_id, cycle_no, action, amount, paid_on, method, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(target.student.id, cycleNo, action, extra.amount ?? null, extra.paidOn ?? null, extra.method ?? null, extra.note ?? '',
      req.admin.id, new Date().toISOString());
  const who = (target) => `"${target.student.fullName}" (lớp "${target.cls.name}")`;
  const cycleLabel = (cy) => `kì ${cy.cycleNo} (buổi ${cy.sessions[0].no}–${cy.sessions.at(-1).no})`;

  // ----- Theo tháng -----

  router.get('/', (req, res) => {
    const month = readMonth(req, res);
    if (month) res.json(monthReport(month));
  });

  router.get('/export', async (req, res) => {
    const month = readMonth(req, res);
    if (!month) return;
    const report = monthReport(month);
    const [y, m] = month.split('-');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';

    // Trang 1: tổng hợp theo lớp
    const sum = wb.addWorksheet('Tổng hợp', { views: [{ state: 'frozen', ySplit: 1 }] });
    sum.columns = [
      { header: 'Lớp', key: 'name', width: 20 },
      { header: 'Giáo viên', key: 'teachers', width: 26 },
      { header: 'Học phí / buổi', key: 'price', width: 13, style: { numFmt: MONEY_FMT } },
      { header: 'Số buổi / kì', key: 'cycle', width: 10 },
      { header: 'Buổi đã học (tổng)', key: 'done', width: 12 },
      { header: `Buổi đã học tháng ${m}`, key: 'doneMonth', width: 12 },
      { header: 'Cần thu', key: 'due', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Đã thu', key: 'paid', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Còn thiếu', key: 'missing', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Ghi chú', key: 'note', width: 36 },
    ];
    for (const c of report.classes) {
      sum.addRow({
        name: c.name, teachers: c.teachers.join(', '), price: c.pricePerSession, cycle: c.cycleSessions, done: c.sessionsDone,
        doneMonth: c.sessionsDoneInMonth, due: c.due, paid: c.paid, missing: c.missing,
        note: !c.configured ? 'Chưa cài học phí' : c.status === 'not_due' ? 'Chưa đến hạn' : c.gap ? `Mới xếp ${c.gap.scheduled}/${c.gap.needed} buổi của kì ${c.gap.cycleNo}` : '',
      });
    }
    styleHeader(sum.getRow(1));
    fillRow(sum.addRow({ name: 'Tổng', ...report.totals }), 'FFF1F5F9');

    // Trang 2: chi tiết từng học sinh, nhóm theo lớp
    const ws = wb.addWorksheet('Chi tiết', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Lớp', key: 'cls', width: 16 },
      { header: 'Học sinh', key: 'name', width: 26 },
      { header: 'Buổi bắt đầu', key: 'start', width: 20 },
      { header: `Đã học tháng ${m}`, key: 'doneMonth', width: 10 },
      { header: 'Đã học (tổng)', key: 'done', width: 10 },
      { header: `Buổi nghỉ tháng ${m}`, key: 'absences', width: 28 },
      { header: 'Học phí / buổi', key: 'price', width: 12, style: { numFmt: MONEY_FMT } },
      { header: 'Giảm giá (%)', key: 'discount', width: 9 },
      { header: 'Kì đến hạn', key: 'cycles', width: 22 },
      { header: 'Cần thu', key: 'due', width: 13, style: { numFmt: MONEY_FMT } },
      { header: 'Đã thu', key: 'paid', width: 13, style: { numFmt: MONEY_FMT } },
      { header: 'Ngày thu', key: 'paidOn', width: 12 },
      { header: 'Hình thức', key: 'method', width: 13 },
      { header: 'Trạng thái', key: 'status', width: 13 },
      { header: 'Ghi chú', key: 'note', width: 40 },
    ];
    const STATUS_FILL = { paid: 'FFE3F6EA', unpaid: 'FFFFF6CC', not_due: 'FFF1F5F9' };
    for (const c of report.classes) {
      fillRow(ws.addRow({ cls: c.name, name: `${c.teachers.join(', ') || 'Chưa có giáo viên phụ trách'}` }), 'FFE6EFFF');
      for (const r of c.students) {
        const pays = r.dueCycles.filter((cy) => cy.payment);
        const notes = [
          r.isActive ? '' : 'Đã nghỉ học',
          r.discountNote,
          ...r.dueCycles.filter((cy) => cy.snoozed).map((cy) => `Đã tắt cảnh báo kì ${cy.cycleNo}`),
          ...r.dueCycles.filter((cy) => cy.mismatch).map((cy) => `Kì ${cy.cycleNo}: lịch đã đổi sau khi thu`),
          ...r.olderUnpaid.map((cy) => `Còn nợ kì ${cy.cycleNo} (${money(cy.amount)}, hạn ${formatDate(cy.dueDate)})`),
        ].filter(Boolean);
        const row = ws.addRow({
          cls: c.name,
          name: r.fullName,
          start: r.startNo ? `Buổi ${r.startNo} (${formatDate(r.startDate)})` : '',
          doneMonth: r.sessionsDoneInMonth,
          done: r.sessionsDone,
          absences: r.absences.map((a) => `${formatDate(a.date).slice(0, 5)}${a.status === 'excused' ? ' (P)' : ''}`).join(', '),
          price: c.pricePerSession,
          discount: r.discountPercent || '',
          cycles: r.dueCycles.map((cy) => `Kì ${cy.cycleNo} (hạn ${formatDate(cy.dueDate)})`).join('; '),
          due: r.due,
          paid: r.paid,
          paidOn: pays.map((cy) => formatDate(cy.payment.paidOn)).join(', '),
          method: [...new Set(pays.map((cy) => METHODS[cy.payment.method]))].join(', '),
          status: STATUS_LABELS[r.status],
          note: notes.join('; '),
        });
        row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r.status] } };
      }
      fillRow(ws.addRow({ cls: c.name, name: `Tổng lớp ${c.name}`, due: c.due, paid: c.paid, note: c.missing ? `Còn thiếu ${money(c.missing)}` : '' }), 'FFF1F5F9');
    }
    styleHeader(ws.getRow(1));
    ws.addRow([]);
    [
      'Cần thu trong tháng = tiền các kì học phí có HẠN ĐÓNG rơi vào tháng này. Đã thu = phần đã thu của chính các kì đó.',
      'Hạn đóng kì k = ngày buổi cuối của kì trước; kì đầu tiên của học sinh = ngày buổi bắt đầu học.',
      'Buổi đã học = buổi trên thời khóa biểu đã qua giờ kết thúc, tính từ buổi bắt đầu học (vắng vẫn tính). (P) = vắng có phép.',
    ].forEach((t) => (ws.addRow([t]).font = { italic: true, color: { argb: 'FF555555' } }));

    logAudit(db, { adminId: req.admin.id, action: 'export_tuition', detail: `Tải bảng học phí tháng ${m}/${y} về Excel` });
    await sendWorkbook(res, wb, `Hoc phi thang ${m}-${y}.xlsx`);
  });

  // ----- Một học sinh -----

  router.get('/students/:sid', (req, res) => {
    const target = loadTarget(req, res);
    if (target) res.json(studentHistory(target));
  });

  router.get('/students/:sid/export', async (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    const h = studentHistory(target);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    const ws = wb.addWorksheet('Các kì học phí');
    ws.addRow([`${h.student.fullName} — lớp ${h.class.name}`]).font = { bold: true, size: 13 };
    ws.addRow([`Phụ huynh: ${h.student.parentName || '—'} · SĐT: ${h.student.parentPhone || '—'} · Giảm giá: ${h.student.discountPercent || 0}%`]);
    ws.addRow([]);
    const head = ws.addRow(['Kì', 'Các buổi', 'Số buổi', 'Hạn đóng', 'Cần thu', 'Đã thu', 'Ngày thu', 'Hình thức', 'Người thu', 'Ghi chú']);
    styleHeader(head);
    for (const cy of h.cycles) {
      const p = cy.payment;
      const row = ws.addRow([
        cy.cycleNo,
        `${cy.sessions[0].no}–${cy.sessions.at(-1).no}`,
        cy.sessionCount,
        excelDate(cy.dueDate),
        cy.amount,
        p ? p.amount : null,
        p ? excelDate(p.paidOn) : null,
        p ? METHODS[p.method] : 'Chưa đóng',
        p ? p.by : '',
        [p?.note, cy.snoozed ? 'Đã tắt cảnh báo' : '', cy.mismatch ? 'Lịch đã đổi sau khi thu' : ''].filter(Boolean).join('; '),
      ]);
      row.getCell(4).numFmt = 'dd/mm/yyyy';
      row.getCell(7).numFmt = 'dd/mm/yyyy';
      row.getCell(5).numFmt = MONEY_FMT;
      row.getCell(6).numFmt = MONEY_FMT;
    }
    [6, 12, 8, 12, 13, 13, 12, 14, 16, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));

    const log = wb.addWorksheet('Lịch sử');
    log.columns = [
      { header: 'Thời gian', key: 'at', width: 18 },
      { header: 'Việc', key: 'action', width: 18 },
      { header: 'Kì', key: 'cycle', width: 6 },
      { header: 'Số tiền', key: 'amount', width: 13, style: { numFmt: MONEY_FMT } },
      { header: 'Ngày thu', key: 'paidOn', width: 12 },
      { header: 'Hình thức', key: 'method', width: 13 },
      { header: 'Người làm', key: 'by', width: 16 },
      { header: 'Ghi chú', key: 'note', width: 36 },
    ];
    const at = (iso) => `${formatDate(vnDate(Date.parse(iso)))} ${new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(11, 16)}`;
    for (const e of h.events) {
      log.addRow({
        at: at(e.createdAt), action: EVENT_LABELS[e.action], cycle: e.cycleNo, amount: e.amount, paidOn: e.paidOn ? formatDate(e.paidOn) : '',
        method: e.method ? METHODS[e.method] : '', by: e.by, note: e.note,
      });
    }
    for (const f of h.legacy) {
      log.addRow({ at: at(f.createdAt), action: 'Đã đóng (cách cũ)', cycle: f.cycleNo, by: f.by, note: `Lúc đã học ${f.sessionsAt} buổi${f.note ? `. ${f.note}` : ''}` });
    }
    styleHeader(log.getRow(1));
    logAudit(db, { adminId: req.admin.id, action: 'export_tuition', classId: target.cls.id, detail: `Tải lịch sử học phí của ${who(target)} về Excel` });
    await sendWorkbook(res, wb, `Hoc phi ${h.student.fullName}.xlsx`);
  });

  // Chưa đóng -> Đã thu: { cycleNo, paidOn?, method: cash|transfer, amount?, note? }
  // Số tiền phải thu được chốt lúc này (số buổi × giá × giảm giá); amount = số owner thực thu (mặc định bằng số phải thu).
  router.post('/students/:sid/pay', (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    const cycleNo = toInt(req.body?.cycleNo);
    const cy = findCycle(res, target, cycleNo);
    if (!cy) return;
    if (cy.payment) return res.status(409).json({ error: `Kì ${cycleNo} của học sinh này đã thu rồi.` });
    const today = vnDate();
    const paidOn = String(req.body?.paidOn || today);
    if (!isValidDate(paidOn) || paidOn > today || paidOn < addDays(today, -400)) {
      return res.status(400).json({ error: 'Ngày thu không hợp lệ (không được sau hôm nay).' });
    }
    const method = req.body?.method;
    if (!METHODS[method]) return res.status(400).json({ error: 'Vui lòng chọn hình thức thu: tiền mặt hoặc chuyển khoản.' });
    let amount = cy.amount;
    if (req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== '') {
      amount = typeof req.body.amount === 'number' ? req.body.amount : Number(String(req.body.amount).replace(/[.,\s]/g, ''));
      if (!Number.isInteger(amount) || amount < 0 || amount > 1000000000) return res.status(400).json({ error: 'Số tiền đã thu không hợp lệ.' });
    }
    const note = cleanText(req.body?.note, 300);
    const { student, tl } = target;
    db.transaction(() => {
      db.prepare(
        `INSERT INTO tuition_payments (student_id, cycle_no, session_count, due_amount, amount, price_per_session, discount_percent,
                                       session_ids, paid_on, method, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(student.id, cycleNo, cy.sessionCount, cy.amount, amount, tl.pricePerSession, student.discountPercent || 0,
        JSON.stringify(cy.sessions.map((s) => s.id)), paidOn, method, note, req.admin.id, new Date().toISOString());
      event(req, target, cycleNo, 'pay', { amount, paidOn, method, note });
    })();
    const diff = amount !== cy.amount ? ` (phải thu ${money(cy.amount)})` : '';
    audit(req, target, 'tuition_pay',
      `Thu học phí ${who(target)} ${cycleLabel(cy)}: ${money(amount)}${diff}, ${METHODS[method].toLowerCase()}, ngày ${formatDate(paidOn)}${note ? `. Ghi chú: ${note}` : ''}`);
    res.json(studentHistory(loadTarget(req, res)));
  });

  // Đã thu -> Chưa đóng: { cycleNo, password, note? } — phải nhập lại mật khẩu (đã chốt)
  router.post('/students/:sid/unpay', unpayLimit, async (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    const cycleNo = toInt(req.body?.cycleNo);
    const payment = db.prepare('SELECT * FROM tuition_payments WHERE student_id = ? AND cycle_no = ?').get(target.student.id, cycleNo);
    if (!payment) return res.status(400).json({ error: `Kì ${cycleNo} của học sinh này chưa thu.` });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu của bạn để xác nhận.' });
    const me = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
    if (!me || !(await verifyPassword(password, me.password_hash))) {
      return res.status(403).json({ reason: 'wrong_password', error: 'Mật khẩu không đúng.' });
    }
    const note = cleanText(req.body?.note, 300);
    db.transaction(() => {
      db.prepare('DELETE FROM tuition_payments WHERE id = ?').run(payment.id);
      event(req, target, cycleNo, 'unpay', {
        amount: payment.amount, paidOn: payment.paid_on, method: payment.method,
        note: note || `Bỏ khoản đã thu ngày ${formatDate(payment.paid_on)}`,
      });
    })();
    audit(req, target, 'tuition_unpay',
      `Bỏ "Đã thu" kì ${cycleNo} của ${who(target)} (${money(payment.amount)}, thu ngày ${formatDate(payment.paid_on)})${note ? `. Lý do: ${note}` : ''}`);
    res.json(studentHistory(loadTarget(req, res)));
  });

  // Tắt cảnh báo một kì: { cycleNo } — ẩn cảnh báo của kì đó (kì sau vẫn cảnh báo bình thường)
  router.post('/students/:sid/snooze', (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    const cycleNo = toInt(req.body?.cycleNo);
    const cy = findCycle(res, target, cycleNo);
    if (!cy) return;
    if (!target.tuition.snoozedCycles.includes(cycleNo)) {
      const note = cleanText(req.body?.note, 300);
      db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO tuition_alert_snoozes (student_id, cycle_no, created_by, created_at) VALUES (?, ?, ?, ?)').run(
          target.student.id, cycleNo, req.admin.id, new Date().toISOString()
        );
        event(req, target, cycleNo, 'snooze', { note });
      })();
      audit(req, target, 'tuition_snooze', `Tắt cảnh báo học phí kì ${cycleNo} của ${who(target)}${note ? `. Ghi chú: ${note}` : ''}`);
    }
    res.json(studentHistory(loadTarget(req, res)));
  });

  router.post('/students/:sid/unsnooze', (req, res) => {
    const target = loadTarget(req, res);
    if (!target) return;
    const cycleNo = toInt(req.body?.cycleNo);
    const removed = db.prepare('DELETE FROM tuition_alert_snoozes WHERE student_id = ? AND cycle_no = ?').run(target.student.id, cycleNo);
    if (removed.changes) {
      event(req, target, cycleNo, 'unsnooze');
      audit(req, target, 'tuition_unsnooze', `Bật lại cảnh báo học phí kì ${cycleNo} của ${who(target)}`);
    }
    res.json(studentHistory(loadTarget(req, res)));
  });

  return router;
}

module.exports = tuitionRouter;
