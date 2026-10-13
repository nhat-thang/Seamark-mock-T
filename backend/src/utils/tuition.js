// HỌC PHÍ THEO BUỔI — toàn bộ logic đếm buổi, chu kỳ, hạn đóng, số tiền, mức cảnh báo, tắt cảnh báo.
// Hàm thuần (không đọc database), test ở backend/tests/tuition.test.js.
//
// Quy tắc (đã chốt với người dùng):
// - Buổi học của lớp = các buổi owner xếp trên thời khóa biểu (KHÔNG dựa vào điểm danh), đánh số 1, 2, 3...
//   theo thời gian. Một buổi "đã qua" khi giờ kết thúc đã qua. Học sinh vắng vẫn bị tính buổi đó.
// - Chu kỳ k = các buổi (k−1)·X+1 … k·X của lớp (X = số buổi mỗi chu kỳ). Chu kỳ chỉ được thu khi owner
//   đã xếp ĐỦ X buổi của chu kỳ đó.
// - Học sinh bắt đầu từ "buổi bắt đầu học" (lưu bằng thời điểm của buổi đó: startAt). Vào giữa chu kỳ thì
//   chu kỳ đầu chỉ tính các buổi từ buổi bắt đầu. Đã nghỉ học thì không tính các buổi sau ngày nghỉ.
// - Đóng TRƯỚC: hạn đóng chu kỳ k = ngày của buổi cuối chu kỳ k−1; chu kỳ đầu của học sinh = ngày buổi bắt đầu.
// - Số tiền = số buổi của học sinh trong chu kỳ × học phí/buổi × (100 − giảm giá %) / 100.
//   Đã thu thì số tiền được CHỐT lúc thu (đổi giá, đổi lịch sau không ảnh hưởng).
// - Cảnh báo cho chu kỳ KẾ TIẾP (chưa đóng): lớp còn 4–2 buổi trong chu kỳ hiện tại → VÀNG, 1 buổi → CAM,
//   hôm nay là hạn đóng → ĐỎ. Chu kỳ HIỆN TẠI đã tới hạn mà chưa đóng → ĐỎ tới hết buổi thứ 3 của học sinh
//   trong chu kỳ đó, sau đó thôi cảnh báo (vẫn hiện "Chưa đóng" ở trang Quản lý học phí).
// - Tắt cảnh báo: theo từng (học sinh, chu kỳ) — tắt chu kỳ nào thì ẩn luôn cảnh báo của chu kỳ đó;
//   chu kỳ sau cảnh báo bình thường.
// Ngày ("hôm nay", ngày của buổi) luôn theo giờ Việt Nam; thời điểm (startsAt, endsAt, now) là UTC.
const { vnDate } = require('../classes/time');

/** Số buổi trong chu kỳ hiện tại còn lại từ đây trở xuống thì bắt đầu cảnh báo */
const WARN_FROM_REMAINING = 4;
/** Chu kỳ đã tới hạn mà chưa đóng: cảnh báo đỏ tới hết buổi thứ mấy của học sinh trong chu kỳ đó */
const OVERDUE_ALERT_SESSIONS = 3;

const isConfigured = (settings) =>
  Boolean(settings) && Number.isInteger(settings.cycleSessions) && settings.cycleSessions > 0 &&
  Number.isInteger(settings.pricePerSession) && settings.pricePerSession >= 0;

/** Số tiền của n buổi sau giảm giá (làm tròn tới đồng) */
const amountFor = (count, price, discountPercent = 0) => Math.round((count * price * (100 - (discountPercent || 0))) / 100);

/**
 * Đánh số các buổi của lớp và xác định lớp đang ở đâu.
 * sessions: [{ id, date ('YYYY-MM-DD' giờ VN), startsAt, endsAt (ISO UTC) }] — thứ tự bất kỳ.
 * settings: { cycleSessions: X, pricePerSession }
 */
function classTimeline(sessions, settings, now = Date.now()) {
  const list = [...sessions]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id)
    .map((s, i) => ({ ...s, no: i + 1, passed: Date.parse(s.endsAt) <= now }));
  const X = isConfigured(settings) ? settings.cycleSessions : 0;
  const passedCount = list.filter((s) => s.passed).length;
  const tl = {
    configured: X > 0,
    cycleSessions: X,
    pricePerSession: X > 0 ? settings.pricePerSession : null,
    sessions: list,
    total: list.length,
    passedCount,
    today: vnDate(now),
    now,
  };
  if (!X) return { ...tl, currentCycle: null, remainingInCurrent: null };
  for (const s of list) s.cycle = Math.ceil(s.no / X);
  // Chu kỳ hiện tại = chu kỳ của buổi đầu tiên chưa qua (hết lịch thì là chu kỳ sau buổi cuối)
  const currentCycle = Math.ceil((passedCount + 1) / X);
  const scheduledInCurrent = list.filter((s) => s.cycle === currentCycle).length;
  const remainingInCurrent = list.filter((s) => s.cycle === currentCycle && !s.passed).length;
  return { ...tl, currentCycle, scheduledInCurrent, remainingInCurrent };
}

/** Lớp đã xếp đủ X buổi của chu kỳ k chưa */
const cycleScheduled = (tl, k) => tl.configured && k >= 1 && tl.total >= k * tl.cycleSessions;

/** Số buổi đã xếp của chu kỳ k (để nhắc "mới xếp a/X buổi") */
const scheduledInCycle = (tl, k) => (tl.configured ? tl.sessions.filter((s) => s.cycle === k).length : 0);

/**
 * Các buổi tính cho học sinh: từ buổi bắt đầu học, trước ngày nghỉ học (nếu đã nghỉ).
 * student: { startAt?: ISO, removedAt?: ISO }
 */
function studentSessions(tl, student) {
  return tl.sessions.filter(
    (s) => (!student.startAt || s.startsAt >= student.startAt) && (!student.removedAt || s.startsAt < student.removedAt)
  );
}

/**
 * Các chu kỳ của một học sinh (từ chu kỳ của buổi bắt đầu học), chỉ những chu kỳ đã xếp đủ lịch.
 * payments: { [cycleNo]: { amount, sessionIds: [...], paidOn, method, note, ... } }
 * Trả về [{ cycleNo, sessions, sessionCount, amount, dueDate, payment, mismatch }]
 *   amount: số tiền đã chốt nếu đã thu, ngược lại số tiền tính theo lịch + giá hiện tại
 *   mismatch: đã thu nhưng các buổi của chu kỳ trên lịch hiện tại khác lúc thu (do thêm / xóa buổi)
 */
function studentCycles(tl, student, payments = {}) {
  if (!tl.configured) return [];
  const mine = studentSessions(tl, student);
  if (mine.length === 0) return [];
  const X = tl.cycleSessions;
  const firstCycle = mine[0].cycle;
  const out = [];
  for (let k = firstCycle; cycleScheduled(tl, k); k++) {
    const sessions = mine.filter((s) => s.cycle === k);
    if (sessions.length === 0) break; // đã nghỉ học trước chu kỳ này
    const payment = payments[k] || null;
    const ids = sessions.map((s) => s.id);
    out.push({
      cycleNo: k,
      firstNo: (k - 1) * X + 1,
      lastNo: k * X,
      sessions,
      sessionCount: sessions.length,
      amount: payment ? payment.amount : amountFor(sessions.length, tl.pricePerSession, student.discountPercent),
      // Hạn đóng: chu kỳ đầu của học sinh = ngày buổi bắt đầu học; còn lại = ngày buổi cuối chu kỳ trước
      dueDate: k === firstCycle ? mine[0].date : tl.sessions[(k - 1) * X - 1].date,
      payment,
      mismatch: Boolean(payment && payment.sessionIds && payment.sessionIds.join(',') !== ids.join(',')),
    });
  }
  return out;
}

/**
 * Mức cảnh báo học phí của một học sinh: null | { level: 'yellow'|'orange'|'red', cycleNo, remaining, kind }
 *   kind: 'upcoming' (sắp tới hạn), 'due_today' (hôm nay là hạn đóng), 'overdue' (đã tới hạn, chưa đóng)
 * snoozed: Set các chu kỳ owner đã tắt cảnh báo của học sinh này
 */
function studentAlert(tl, student, cycles, snoozed = new Set()) {
  if (!tl.configured || student.removedAt) return null;
  const today = tl.today;
  const c = tl.currentCycle;
  const byNo = new Map(cycles.map((cy) => [cy.cycleNo, cy]));
  const rank = { yellow: 1, orange: 2, red: 3 };
  let best = null;
  const offer = (a) => {
    if (!best || rank[a.level] > rank[best.level]) best = a;
  };
  const dueKind = (cy) => (cy.dueDate === today ? 'due_today' : 'overdue');

  // Chu kỳ hiện tại đã tới hạn mà chưa đóng: ĐỎ tới hết buổi thứ 3 của học sinh trong chu kỳ này
  const cur = byNo.get(c);
  if (cur && !cur.payment && !snoozed.has(c) && cur.dueDate <= today) {
    const passedMine = cur.sessions.filter((s) => s.passed).length;
    if (passedMine < OVERDUE_ALERT_SESSIONS) offer({ level: 'red', cycleNo: c, remaining: tl.remainingInCurrent, kind: dueKind(cur) });
  }
  // Chu kỳ kế tiếp chưa đóng: theo số buổi còn lại của chu kỳ hiện tại
  const next = byNo.get(c + 1);
  if (next && !next.payment && !snoozed.has(c + 1)) {
    const r = tl.remainingInCurrent;
    if (next.dueDate <= today) offer({ level: 'red', cycleNo: c + 1, remaining: r, kind: dueKind(next) });
    else if (r === 1) offer({ level: 'orange', cycleNo: c + 1, remaining: r, kind: 'upcoming' });
    else if (r >= 2 && r <= WARN_FROM_REMAINING) offer({ level: 'yellow', cycleNo: c + 1, remaining: r, kind: 'upcoming' });
  }
  return best;
}

/**
 * Nhãn "Đã thu" / "Chưa đóng" cho chu kỳ hiện tại và chu kỳ kế tiếp (nếu đã xếp đủ lịch).
 * Giá trị: 'paid' | 'unpaid' | 'not_started' (học sinh chưa tới buổi bắt đầu) | null (lớp chưa cài học phí / chưa có lịch)
 */
function studentLabels(tl, cycles) {
  if (!tl.configured || tl.total === 0) return { current: null, next: null, currentCycle: null };
  const c = tl.currentCycle;
  const byNo = new Map(cycles.map((cy) => [cy.cycleNo, cy]));
  const status = (k) => {
    const cy = byNo.get(k);
    if (cy) return cy.payment ? 'paid' : 'unpaid';
    const firstMine = cycles[0]?.cycleNo;
    return firstMine && firstMine > k ? 'not_started' : null;
  };
  return { currentCycle: c, current: status(c), next: cycleScheduled(tl, c + 1) ? status(c + 1) : null };
}

/** Học sinh đã học bao nhiêu buổi (buổi đã qua tính từ buổi bắt đầu, kể cả vắng) */
const sessionsDone = (tl, student) => studentSessions(tl, student).filter((s) => s.passed).length;

/**
 * Tình hình một học sinh trong một tháng ('YYYY-MM', giờ VN) cho trang Quản lý học phí.
 * "Cần thu trong tháng" = tổng tiền các chu kỳ có hạn đóng rơi vào tháng đó;
 * "Đã thu" = phần đã thu của chính các chu kỳ đó.
 */
function studentMonth(tl, student, cycles, month) {
  const mine = studentSessions(tl, student);
  const dueCycles = cycles.filter((cy) => cy.dueDate.slice(0, 7) === month);
  const due = dueCycles.reduce((n, cy) => n + cy.amount, 0);
  const paid = dueCycles.filter((cy) => cy.payment).reduce((n, cy) => n + cy.payment.amount, 0);
  let status = 'not_due';
  if (dueCycles.length) status = dueCycles.every((cy) => cy.payment) ? 'paid' : 'unpaid';
  return {
    sessionsDone: mine.filter((s) => s.passed).length,
    sessionsDoneInMonth: mine.filter((s) => s.passed && s.date.slice(0, 7) === month).length,
    dueCycles,
    due,
    paid,
    status,
    // Các chu kỳ trước tháng này vẫn chưa đóng (để owner thấy còn nợ)
    olderUnpaid: cycles.filter((cy) => !cy.payment && cy.dueDate.slice(0, 7) < month),
  };
}

/** Lớp sắp sang chu kỳ mới mà chưa xếp đủ lịch chu kỳ đó: { cycleNo, scheduled, needed } hoặc null */
function scheduleGap(tl) {
  if (!tl.configured || tl.total === 0) return null;
  const n = tl.currentCycle + 1;
  if (cycleScheduled(tl, n)) return null;
  if (tl.remainingInCurrent > WARN_FROM_REMAINING) return null; // còn xa, chưa cần nhắc
  return { cycleNo: n, scheduled: scheduledInCycle(tl, n), needed: tl.cycleSessions };
}

module.exports = {
  WARN_FROM_REMAINING,
  OVERDUE_ALERT_SESSIONS,
  isConfigured,
  amountFor,
  classTimeline,
  cycleScheduled,
  scheduledInCycle,
  studentSessions,
  studentCycles,
  studentAlert,
  studentLabels,
  sessionsDone,
  studentMonth,
  scheduleGap,
};
