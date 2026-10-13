// Unit test module học phí theo buổi (backend/src/utils/tuition.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { toInstant, addDays } = require('../src/classes/time');
const T = require('../src/utils/tuition');

const X = 25;
const PRICE = 100000;
const settings = { cycleSessions: X, pricePerSession: PRICE };
const D0 = '2026-09-01';

/** n buổi liên tiếp mỗi ngày từ ngày `start`, 18:00–19:30 giờ VN; id = số thứ tự */
function daily(n, start = D0, from = 1) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(start, i);
    return { id: from + i, date, startsAt: toInstant(date, '18:00'), endsAt: toInstant(date, '19:30') };
  });
}
/** Thời điểm giờ VN */
const at = (date, time) => Date.parse(toInstant(date, time));
/** Ngày của buổi số n (buổi 1 = D0) */
const day = (n) => addDays(D0, n - 1);

function view(sessions, student, now, { payments = {}, snoozed = new Set(), s = settings } = {}) {
  const tl = T.classTimeline(sessions, s, now);
  const cycles = T.studentCycles(tl, student, payments);
  return { tl, cycles, alert: T.studentAlert(tl, student, cycles, snoozed), labels: T.studentLabels(tl, cycles) };
}
const paidFor = (cy) => ({ amount: cy.amount, sessionIds: cy.sessions.map((x) => x.id) });

test('Học sinh vào từ đầu: chu kỳ 25 buổi, số tiền, hạn đóng; còn 4 / 2 / 1 / 0 buổi → vàng / vàng / cam / đỏ', () => {
  const ss = daily(60);
  const st = { id: 1, startAt: ss[0].startsAt };
  // Sau buổi 21: lớp ở chu kỳ 1, còn 4 buổi (22–25) -> chu kỳ 2 chưa đóng -> VÀNG
  let v = view(ss, st, at(day(21), '21:00'), { payments: { 1: { amount: 2500000, sessionIds: daily(25).map((x) => x.id) } } });
  assert.deepEqual(v.cycles.map((c) => [c.cycleNo, c.sessionCount, c.amount, c.dueDate]), [
    [1, 25, 2500000, day(1)],
    [2, 25, 2500000, day(25)],
  ]);
  assert.equal(v.tl.currentCycle, 1);
  assert.equal(v.tl.remainingInCurrent, 4);
  assert.deepEqual(v.alert, { level: 'yellow', cycleNo: 2, remaining: 4, kind: 'upcoming' });

  const paid1 = { 1: paidFor(v.cycles[0]) };
  assert.equal(view(ss, st, at(day(23), '21:00'), { payments: paid1 }).alert.level, 'yellow'); // còn 2
  assert.deepEqual(view(ss, st, at(day(24), '21:00'), { payments: paid1 }).alert, { level: 'orange', cycleNo: 2, remaining: 1, kind: 'upcoming' });
  // Hôm nay là buổi cuối chu kỳ (hạn đóng chu kỳ 2) -> ĐỎ
  assert.deepEqual(view(ss, st, at(day(25), '10:00'), { payments: paid1 }).alert, { level: 'red', cycleNo: 2, remaining: 1, kind: 'due_today' });
  // Còn ≥ 5 buổi: không cảnh báo
  assert.equal(view(ss, st, at(day(20), '21:00'), { payments: paid1 }).alert, null);
});

test('Quá hạn chưa đóng: sang chu kỳ mới vẫn ĐỎ tới hết buổi thứ 3 của chu kỳ đó rồi thôi cảnh báo', () => {
  const ss = daily(75);
  const st = { id: 1, startAt: ss[0].startsAt };
  const tl1 = T.classTimeline(ss, settings, at(day(1), '10:00'));
  const paid1 = { 1: paidFor(T.studentCycles(tl1, st)[0]) };
  // Buổi 25 đã qua: lớp sang chu kỳ 2 mà chưa đóng -> ĐỎ (quá hạn)
  assert.deepEqual(view(ss, st, at(day(26), '10:00'), { payments: paid1 }).alert, { level: 'red', cycleNo: 2, remaining: 25, kind: 'overdue' });
  assert.equal(view(ss, st, at(day(28), '10:00'), { payments: paid1 }).alert.level, 'red'); // buổi 28 = buổi thứ 3 của chu kỳ 2, chưa qua
  // Hết buổi thứ 3 của chu kỳ 2: thôi cảnh báo, nhưng nhãn vẫn "Chưa đóng"
  const after = view(ss, st, at(day(28), '21:00'), { payments: paid1 });
  assert.equal(after.alert, null);
  assert.equal(after.labels.current, 'unpaid');
  // Đã đóng chu kỳ 2 -> theo dõi chu kỳ 3: vàng khi chu kỳ 2 còn 4 buổi
  const paid12 = { ...paid1, 2: paidFor(after.cycles[1]) };
  const v = view(ss, st, at(day(46), '21:00'), { payments: paid12 });
  assert.deepEqual(v.alert, { level: 'yellow', cycleNo: 3, remaining: 4, kind: 'upcoming' });
  assert.deepEqual([v.labels.current, v.labels.next], ['paid', 'unpaid']);
});

test('Học sinh vào giữa chu kỳ (từ buổi 10): chu kỳ đầu 16 buổi, hạn đóng = buổi bắt đầu, chưa đóng là ĐỎ', () => {
  const ss = daily(50);
  const st = { id: 2, startAt: ss[9].startsAt };
  const v = view(ss, st, at(day(10), '08:00'));
  assert.deepEqual([v.cycles[0].cycleNo, v.cycles[0].sessionCount, v.cycles[0].amount, v.cycles[0].dueDate], [1, 16, 1600000, day(10)]);
  assert.deepEqual(v.alert, { level: 'red', cycleNo: 1, remaining: 16, kind: 'due_today' });
  // Trước ngày bắt đầu: chưa tới hạn, nhãn "chưa bắt đầu" không áp dụng (đã thuộc chu kỳ 1)
  const before = view(ss, st, at(day(5), '08:00'));
  assert.equal(before.alert, null);
  assert.equal(T.sessionsDone(before.tl, st), 0);
  // Đã học 4 buổi (10–13) dù vắng hay không vẫn tính
  assert.equal(T.sessionsDone(T.classTimeline(ss, settings, at(day(13), '21:00')), st), 4);
});

test('Chu kỳ kế tiếp chưa xếp đủ lịch: chưa thu, không cảnh báo, nhắc owner "mới xếp a/X buổi"', () => {
  const ss = daily(30); // chu kỳ 2 mới có 5/25 buổi
  const st = { id: 1, startAt: ss[0].startsAt };
  const tl0 = T.classTimeline(ss, settings, at(day(1), '10:00'));
  const v = view(ss, st, at(day(22), '21:00'), { payments: { 1: paidFor(T.studentCycles(tl0, st)[0]) } });
  assert.deepEqual(v.cycles.map((c) => c.cycleNo), [1]);
  assert.equal(v.alert, null);
  assert.equal(v.labels.next, null);
  assert.deepEqual(T.scheduleGap(v.tl), { cycleNo: 2, scheduled: 5, needed: 25 });
  // Còn xa (chưa tới 4 buổi cuối) thì chưa nhắc
  assert.equal(T.scheduleGap(T.classTimeline(ss, settings, at(day(5), '21:00'))), null);
});

test('Lớp chưa cài học phí: không có chu kỳ, không cảnh báo, không nhãn', () => {
  const ss = daily(30);
  const st = { id: 1, startAt: ss[0].startsAt };
  for (const s of [null, { cycleSessions: 0, pricePerSession: 100 }, { cycleSessions: 25, pricePerSession: null }]) {
    const v = view(ss, st, at(day(25), '10:00'), { s });
    assert.deepEqual([v.cycles, v.alert, v.labels.current], [[], null, null]);
  }
});

test('Thêm buổi vào quá khứ / xóa buổi chưa điểm danh: đánh số lại, chu kỳ đã thu giữ nguyên tiền nhưng báo lệch', () => {
  const ss = daily(60);
  const st = { id: 1, startAt: ss[0].startsAt };
  const tl0 = T.classTimeline(ss, settings, at(day(1), '10:00'));
  const payments = { 1: paidFor(T.studentCycles(tl0, st)[0]) };

  // Thêm một buổi học bù vào sáng ngày 5 (trước buổi 5 cũ): buổi 25 cũ thành buổi 26 -> sang chu kỳ 2
  const extra = { id: 999, date: day(5), startsAt: toInstant(day(5), '08:00'), endsAt: toInstant(day(5), '09:30') };
  const added = view([...ss, extra], st, at(day(10), '10:00'), { payments });
  assert.equal(added.tl.sessions.find((s) => s.id === 999).no, 5);
  assert.equal(added.cycles[0].mismatch, true);
  assert.equal(added.cycles[0].amount, 2500000, 'giữ nguyên số tiền đã chốt');
  assert.equal(added.cycles[1].dueDate, day(24), 'hạn chu kỳ 2 dời lên vì buổi cuối chu kỳ 1 giờ là buổi 24 cũ');
  assert.equal(added.cycles[1].payment, null);

  // Xóa buổi 3 (chưa điểm danh): buổi 26 cũ vào chu kỳ 1
  const removed = view(ss.filter((s) => s.id !== 3), st, at(day(10), '10:00'), { payments });
  assert.equal(removed.cycles[0].mismatch, true);
  assert.equal(removed.cycles[1].dueDate, day(26));
  // Lịch không đổi thì không lệch
  assert.equal(view(ss, st, at(day(10), '10:00'), { payments }).cycles[0].mismatch, false);
});

test('Tắt cảnh báo: ẩn cảnh báo của đúng chu kỳ đó, chu kỳ sau vẫn cảnh báo bình thường', () => {
  const ss = daily(75);
  const st = { id: 1, startAt: ss[0].startsAt };
  const tl0 = T.classTimeline(ss, settings, at(day(1), '10:00'));
  const paid1 = { 1: paidFor(T.studentCycles(tl0, st)[0]) };
  const snoozed = new Set([2]);
  assert.equal(view(ss, st, at(day(23), '21:00'), { payments: paid1, snoozed }).alert, null); // vàng chu kỳ 2 -> ẩn
  assert.equal(view(ss, st, at(day(26), '10:00'), { payments: paid1, snoozed }).alert, null); // đỏ chu kỳ 2 -> ẩn
  // Chu kỳ 2 vẫn chưa đóng, tới cửa sổ cảnh báo chu kỳ 3: hiện cảnh báo của chu kỳ 3
  const v = view(ss, st, at(day(46), '21:00'), { payments: paid1, snoozed });
  assert.deepEqual(v.alert, { level: 'yellow', cycleNo: 3, remaining: 4, kind: 'upcoming' });
  assert.equal(v.labels.current, 'unpaid', 'tắt cảnh báo không đổi trạng thái thu');
});

test('Buổi học vắt qua lúc đổi ngày UTC / giờ VN: "hôm nay" và hạn đóng tính theo giờ Việt Nam', () => {
  const s2 = { cycleSessions: 2, pricePerSession: 50000 };
  // Buổi 2: 06:30–08:00 sáng 14/10 giờ VN = 23:30–01:00 UTC đêm 13 sang 14
  const ss = [
    { id: 1, date: '2026-10-13', startsAt: toInstant('2026-10-13', '18:00'), endsAt: toInstant('2026-10-13', '19:30') },
    { id: 2, date: '2026-10-14', startsAt: toInstant('2026-10-14', '06:30'), endsAt: toInstant('2026-10-14', '08:00') },
    { id: 3, date: '2026-10-15', startsAt: toInstant('2026-10-15', '18:00'), endsAt: toInstant('2026-10-15', '19:30') },
    { id: 4, date: '2026-10-16', startsAt: toInstant('2026-10-16', '18:00'), endsAt: toInstant('2026-10-16', '19:30') },
  ];
  assert.equal(ss[1].startsAt, '2026-10-13T23:30:00.000Z');
  const st = { id: 1, startAt: ss[0].startsAt };
  const now = Date.parse('2026-10-13T23:45:00.000Z'); // ở UTC vẫn là ngày 13, ở Việt Nam đã là 06:45 ngày 14
  const tl0 = T.classTimeline(ss, s2, now);
  const v = view(ss, st, now, { s: s2, payments: { 1: paidFor(T.studentCycles(tl0, st)[0]) } });
  assert.equal(v.tl.today, '2026-10-14');
  assert.deepEqual(v.alert, { level: 'red', cycleNo: 2, remaining: 1, kind: 'due_today' });
});

test('Giảm giá, học sinh đã nghỉ, tổng hợp theo tháng (cần thu / đã thu / chưa đến hạn / nợ kì trước)', () => {
  const ss = daily(75); // 01/09 … 14/11
  const st = { id: 1, startAt: ss[0].startsAt, discountPercent: 10 };
  const tl = T.classTimeline(ss, settings, at('2026-10-10', '10:00'));
  const cycles = T.studentCycles(tl, st);
  assert.equal(cycles[0].amount, 2250000);
  // Tháng 9: chu kỳ 1 (hạn 01/09) và chu kỳ 2 (hạn 25/09)
  const sep = T.studentMonth(tl, st, cycles, '2026-09');
  assert.deepEqual([sep.dueCycles.map((c) => c.cycleNo), sep.due, sep.paid, sep.status], [[1, 2], 4500000, 0, 'unpaid']);
  assert.equal(sep.sessionsDoneInMonth, 30);
  const paid = T.studentCycles(tl, st, { 1: paidFor(cycles[0]), 2: { amount: 2000000, sessionIds: cycles[1].sessions.map((s) => s.id) } });
  const sepPaid = T.studentMonth(tl, st, paid, '2026-09');
  assert.deepEqual([sepPaid.due, sepPaid.paid, sepPaid.status], [4250000, 4250000, 'paid']);
  // Tháng 10: chu kỳ 3 (hạn 19/10); tháng 12 chưa đến hạn
  const oct = T.studentMonth(tl, st, cycles, '2026-10');
  assert.deepEqual([oct.dueCycles.map((c) => c.cycleNo), oct.olderUnpaid.map((c) => c.cycleNo)], [[3], [1, 2]]);
  assert.equal(T.studentMonth(tl, st, cycles, '2026-12').status, 'not_due');

  // Đã nghỉ học từ 05/10: không tính chu kỳ sau ngày nghỉ, không cảnh báo
  const gone = { ...st, removedAt: toInstant('2026-10-05', '00:00') };
  const goneCycles = T.studentCycles(tl, gone);
  assert.deepEqual(goneCycles.map((c) => [c.cycleNo, c.sessionCount]), [[1, 25], [2, 9]]);
  assert.equal(T.studentAlert(tl, gone, goneCycles), null);
});
