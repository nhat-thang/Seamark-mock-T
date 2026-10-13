// Đọc dữ liệu học phí từ database rồi tính bằng utils/tuition.js (module tính toán thuần).
const T = require('../utils/tuition');

const settingsOf = (cls) => ({ cycleSessions: cls.cycle_sessions, pricePerSession: cls.price_per_session });

/** Các buổi của lớp trên thời khóa biểu, dạng module tính cần */
const sessionRows = (db, classId) =>
  db.prepare('SELECT id, date, starts_at AS startsAt, ends_at AS endsAt FROM class_sessions WHERE class_id = ?').all(classId);

/** Các buổi của lớp trên thời khóa biểu -> dòng thời gian (đánh số buổi, chu kỳ hiện tại...) */
function loadTimeline(db, cls, now = Date.now()) {
  return T.classTimeline(sessionRows(db, cls.id), settingsOf(cls), now);
}

/**
 * Thử trước một thay đổi lịch (thêm / xóa / dời buổi): những chu kỳ ĐÃ THU nào sẽ bị lệch
 * (các buổi của học sinh trong chu kỳ đó sẽ khác hiện nay, vì đánh số lại). Số tiền đã thu không đổi.
 * change(rows) -> rows mới. Trả [{ studentId, fullName, cycleNo }].
 */
function paidCyclesAffected(db, cls, change, now = Date.now()) {
  const settings = settingsOf(cls);
  if (!T.isConfigured(settings)) return [];
  const paid = db
    .prepare(
      `SELECT p.cycle_no, st.id, st.full_name, st.start_at, st.removed_at FROM tuition_payments p
         JOIN class_students st ON st.id = p.student_id WHERE st.class_id = ? ORDER BY p.cycle_no`
    )
    .all(cls.id);
  if (paid.length === 0) return [];
  const rows = sessionRows(db, cls.id);
  const before = T.classTimeline(rows, settings, now);
  const after = T.classTimeline(change(rows.map((r) => ({ ...r }))), settings, now);
  const idsOf = (tl, p, k) =>
    T.studentSessions(tl, { startAt: p.start_at, removedAt: p.removed_at }).filter((s) => s.cycle === k).map((s) => s.id).join(',');
  return paid
    .filter((p) => idsOf(before, p, p.cycle_no) !== idsOf(after, p, p.cycle_no))
    .map((p) => ({ studentId: p.id, fullName: p.full_name, cycleNo: p.cycle_no }));
}

/** Các chu kỳ đã thu: Map(id học sinh -> { cycleNo: payment }) */
function loadPayments(db, studentIds) {
  const map = new Map(studentIds.map((id) => [id, {}]));
  if (studentIds.length === 0) return map;
  const rows = db
    .prepare(
      `SELECT p.*, a.display_name AS by_name FROM tuition_payments p LEFT JOIN admins a ON a.id = p.created_by
        WHERE p.student_id IN (${studentIds.map(() => '?').join(',')})`
    )
    .all(...studentIds);
  for (const p of rows) {
    map.get(p.student_id)[p.cycle_no] = {
      id: p.id,
      dueAmount: p.due_amount,
      amount: p.amount,
      sessionCount: p.session_count,
      sessionIds: JSON.parse(p.session_ids),
      paidOn: p.paid_on,
      method: p.method,
      note: p.note,
      by: p.by_name,
      createdAt: p.created_at,
    };
  }
  return map;
}

/** Chu kỳ owner đã tắt cảnh báo: Map(id học sinh -> Set(cycleNo)) */
function loadSnoozes(db, studentIds) {
  const map = new Map(studentIds.map((id) => [id, new Set()]));
  if (studentIds.length === 0) return map;
  const rows = db
    .prepare(`SELECT student_id, cycle_no FROM tuition_alert_snoozes WHERE student_id IN (${studentIds.map(() => '?').join(',')})`)
    .all(...studentIds);
  for (const r of rows) map.get(r.student_id).add(r.cycle_no);
  return map;
}

/** Học sinh (classes/students.js) -> dữ liệu module tính học phí cần */
const tuitionStudent = (s) => ({ id: s.id, startAt: s.startAt, removedAt: s.removedAt, discountPercent: s.discountPercent });

/** Học phí của một học sinh: chu kỳ, cảnh báo, nhãn, số buổi đã học, buổi bắt đầu */
function tuitionOf(tl, s, payments = {}, snoozed = new Set()) {
  const st = tuitionStudent(s);
  const cycles = T.studentCycles(tl, st, payments);
  const alert = T.studentAlert(tl, st, cycles, snoozed);
  const mine = T.studentSessions(tl, st);
  return {
    cycles,
    alert,
    alertAmount: alert ? cycles.find((cy) => cy.cycleNo === alert.cycleNo)?.amount ?? null : null,
    labels: T.studentLabels(tl, cycles),
    sessionsDone: mine.filter((x) => x.passed).length,
    startNo: mine[0]?.no ?? null,
    startDate: mine[0]?.date ?? null,
    snoozedCycles: [...snoozed],
  };
}

/** Học phí của cả lớp: Map(id học sinh -> tuitionOf) */
function classTuition(db, cls, students, now = Date.now()) {
  const tl = loadTimeline(db, cls, now);
  const ids = students.map((s) => s.id);
  const payments = loadPayments(db, ids);
  const snoozes = loadSnoozes(db, ids);
  const map = new Map(students.map((s) => [s.id, tuitionOf(tl, s, payments.get(s.id), snoozes.get(s.id))]));
  return { tl, map };
}

module.exports = { settingsOf, sessionRows, loadTimeline, paidCyclesAffected, loadPayments, loadSnoozes, tuitionOf, classTuition };
