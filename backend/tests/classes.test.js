// Test lớp học, thời khóa biểu, điểm danh, nhắc học phí.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');
const { vnDate, vnTime, addDays, weekdayOf } = require('../src/classes/time');
const { feeInfo } = require('../src/classes/students');

const TODAY = vnDate();

/** Giờ học bắt đầu sau `minutes` phút nữa (âm = đã qua), không kéo qua nửa đêm */
function slotAt(minutes, duration = 60) {
  const start = Date.now() + minutes * 60000;
  const date = vnDate(start);
  let startTime = vnTime(start);
  let endTime = vnTime(start + duration * 60000);
  if (vnDate(start + duration * 60000) !== date) {
    if (startTime === '23:59') startTime = '23:58';
    endTime = '23:59';
  }
  return { date, startTime, endTime };
}

/** Owner + 2 admin (Cô Lan, Thầy Minh) đã đăng nhập, một lớp có sẵn */
async function setupCenter() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const lanId = (await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' })).body.account.id;
  await owner.post('/api/admin/accounts', { username: 'minh', displayName: 'Thầy Minh', password: 'matkhau-minh' });
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');
  const minh = createClient(ctx.base);
  await minh.login('minh', 'matkhau-minh');
  const cls = (await lan.post('/api/admin/classes', { name: 'TOEIC 550 K1', color: 'teal', feeEvery: 10 })).body.class;
  return { ...ctx, owner, lan, minh, lanId, cls };
}

test('Tính học phí: mốc nhắc theo số buổi của từng học sinh', () => {
  assert.equal(feeInfo({ sessions: 5, paidCycles: 0, every: 0 }).state, 'off');
  assert.deepEqual(
    [8, 9, 10, 11].map((n) => feeInfo({ sessions: n, paidCycles: 0, every: 10 }).state),
    ['ok', 'soon', 'due', 'due']
  );
  // Đã thu đợt 1 (lúc học 11 buổi): mốc tiếp theo vẫn là 20, không phải 21
  const after = feeInfo({ sessions: 11, paidCycles: 1, every: 10 });
  assert.equal(after.state, 'ok');
  assert.equal(after.nextAt, 20);
  assert.equal(after.progress, 1);
  // Quên thu 2 đợt
  assert.equal(feeInfo({ sessions: 21, paidCycles: 0, every: 10 }).owed, 2);
});

test('Lớp + học sinh: mọi admin thêm / sửa / xóa; lớp đã xóa chỉ admin chính thấy và khôi phục', async () => {
  const { owner, lan, minh, cls, close } = await setupCenter();
  assert.equal((await minh.post('/api/admin/classes', { name: 'toeic 550 k1' })).status, 409, 'trùng tên lớp');
  assert.equal((await minh.post('/api/admin/classes', { name: '' })).status, 400);

  const add = await minh.post(`/api/admin/classes/${cls.id}/students`, {
    students: [{ fullName: 'Nguyễn Văn An', phone: '0901 234 567' }, { fullName: '  Trần   Bình ' }],
  });
  assert.equal(add.status, 201);
  assert.deepEqual(add.body.students.map((s) => [s.fullName, s.phone, s.joinedOn]), [
    ['Nguyễn Văn An', '0901234567', TODAY],
    ['Trần Bình', '', TODAY],
  ]);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students`, { students: [{ fullName: 'X', phone: 'abc' }] })).status, 400);

  // Chưa học buổi nào -> "cho nghỉ" = xóa hẳn
  const binh = add.body.students[1];
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${binh.id}/remove`)).body.deleted, true);
  assert.equal((await lan.get(`/api/admin/classes/${cls.id}`)).body.students.length, 1);

  // Xóa lớp: ẩn với mọi người, admin không xem được danh sách lớp đã xóa
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/delete`)).status, 200);
  assert.equal((await lan.get('/api/admin/classes')).body.classes.length, 0);
  assert.equal((await lan.get(`/api/admin/classes/${cls.id}`)).status, 404);
  assert.equal((await lan.get('/api/admin/classes?deleted=1')).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/restore`)).status, 403);
  assert.equal((await owner.get('/api/admin/classes?deleted=1')).body.classes.length, 1);
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/restore`)).status, 200);
  assert.equal((await lan.get('/api/admin/classes')).body.classes[0].studentCount, 1);

  // Admin chính xem được mọi thao tác của lớp
  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items;
  assert.deepEqual(log.map((l) => l.action).reverse(), ['create_class', 'add_students', 'delete_student', 'delete_class', 'restore_class']);
  assert.equal(log[0].class.name, 'TOEIC 550 K1');
  assert.equal(log.at(-1).admin.displayName, 'Cô Lan');
  await close();
});

test('Danh sách học sinh xếp theo tên (như sổ điểm danh), trùng tên thì theo họ', async () => {
  const { lan, cls, close } = await setupCenter();
  await lan.post(`/api/admin/classes/${cls.id}/students`, {
    students: ['Đỗ Ngọc Linh', 'Trần Thị Bình', 'Nguyễn Văn An', 'Lê An', 'Bùi Thanh Mai'].map((fullName) => ({ fullName })),
  });
  const names = (await lan.get(`/api/admin/classes/${cls.id}`)).body.students.map((s) => s.fullName);
  assert.deepEqual(names, ['Lê An', 'Nguyễn Văn An', 'Trần Thị Bình', 'Đỗ Ngọc Linh', 'Bùi Thanh Mai']);
  await close();
});

test('Thời khóa biểu: chỉ admin chính xếp, bắt buộc chọn giáo viên, lặp lại hằng tuần, báo trùng lịch', async () => {
  const { owner, lan, lanId, cls, close } = await setupCenter();
  const base = { classId: cls.id, date: addDays(TODAY, 1), startTime: '18:00', endTime: '19:30' };

  assert.equal((await lan.post('/api/admin/schedule', { ...base, teacherId: lanId })).status, 403);
  const noTeacher = await owner.post('/api/admin/schedule', base);
  assert.equal(noTeacher.status, 400);
  assert.match(noTeacher.body.error, /giáo viên/);
  assert.equal((await owner.post('/api/admin/schedule', { ...base, teacherId: lanId, endTime: '17:00' })).status, 400);

  // Lặp lại vào thứ của ngày bắt đầu + thứ sau đó, trong 4 tuần
  const wd = weekdayOf(base.date);
  const weekdays = [wd, (wd % 7) + 1];
  const until = addDays(base.date, 27);
  const r = await owner.post('/api/admin/schedule', { ...base, teacherId: lanId, room: 'P.2', repeat: { weekdays, until } });
  assert.equal(r.status, 201);
  assert.equal(r.body.count, 8);
  const list = (await lan.get(`/api/admin/schedule?from=${base.date}&to=${until}`)).body.sessions;
  assert.equal(list.length, 8);
  assert.ok(list.every((s) => s.teacher.name === 'Cô Lan' && s.room === 'P.2' && s.canOpen));
  assert.equal(new Set(list.map((s) => s.seriesId)).size, 1);

  // Giáo viên nhận thông báo trên web
  const n = (await lan.get('/api/admin/notifications')).body;
  assert.equal(n.unread, 1);
  assert.match(n.items[0].text, /8 buổi học lớp "TOEIC 550 K1"/);
  await lan.post('/api/admin/notifications/read');
  assert.equal((await lan.get('/api/admin/notifications')).body.unread, 0);

  // Cô Lan đã có lịch 18:00–19:30 -> xếp lớp khác 19:00 trùng giờ
  const cls2 = (await owner.post('/api/admin/classes', { name: 'IELTS K2' })).body.class;
  const clash = await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:00', endTime: '20:00', teacherId: lanId });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.reason, 'conflict');
  assert.match(clash.body.conflicts[0], /Cô Lan đang dạy lớp "TOEIC 550 K1"/);
  // Giáo viên khác, giờ nối tiếp (19:30) thì không trùng
  assert.equal((await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:30', endTime: '21:00', teacherId: lanId })).status, 201);
  assert.equal((await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:00', endTime: '20:00', teacherId: lanId, force: true })).status, 201);
  await close();
});

test('Sửa / xóa "buổi này và các buổi sau" trong lịch lặp lại', async () => {
  const { owner, lanId, cls, close } = await setupCenter();
  const date = addDays(TODAY, 1);
  await owner.post('/api/admin/schedule', {
    classId: cls.id, date, startTime: '08:00', endTime: '09:00', teacherId: lanId, repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7], until: addDays(date, 5) },
  });
  const all = (await owner.get(`/api/admin/schedule?from=${date}&to=${addDays(date, 5)}`)).body.sessions;
  assert.equal(all.length, 6);

  const third = all[2];
  const upd = await owner.post(`/api/admin/schedule/${third.id}/update`, { scope: 'following', startTime: '09:00', endTime: '10:30', teacherName: 'Thầy Tom' });
  assert.equal(upd.status, 200);
  const after = (await owner.get(`/api/admin/schedule?from=${date}&to=${addDays(date, 5)}`)).body.sessions;
  assert.deepEqual(after.map((s) => `${s.startTime} ${s.teacher.name}`), [
    '08:00 Cô Lan', '08:00 Cô Lan', '09:00 Thầy Tom', '09:00 Thầy Tom', '09:00 Thầy Tom', '09:00 Thầy Tom',
  ]);
  assert.ok(after[2].teacher.isOther);

  const del = await owner.post(`/api/admin/schedule/${after[4].id}/delete`, { scope: 'following' });
  assert.equal(del.body.deleted, 2);
  assert.equal((await owner.post(`/api/admin/schedule/${after[0].id}/delete`, { scope: 'one' })).body.deleted, 1);
  assert.equal((await owner.get(`/api/admin/schedule?from=${date}&to=${addDays(date, 5)}`)).body.sessions.length, 3);
  await close();
});

test('Bắt đầu buổi học: chỉ giáo viên của buổi, từ 30 phút trước giờ học; buổi giáo viên ngoài chỉ admin chính mở', async () => {
  const { owner, lan, minh, lanId, cls, close } = await setupCenter();
  await lan.post(`/api/admin/classes/${cls.id}/students`, { students: [{ fullName: 'An' }, { fullName: 'Bình' }] });
  const create = async (slot, teacher = { teacherId: lanId }) =>
    (await owner.post('/api/admin/schedule', { classId: cls.id, ...slot, ...teacher, force: true })).body.ids[0];

  const later = await create(slotAt(120));
  const soon = await create(slotAt(20));
  const outsider = await create(slotAt(25), { teacherName: 'Thầy Tom' });

  // Còn 2 tiếng: mở xem được nhưng chưa bắt đầu được
  const d = (await lan.get(`/api/admin/schedule/${later}`)).body;
  assert.equal(d.permissions.canStart, false);
  assert.match(d.permissions.reason, /30 phút/);
  assert.equal((await lan.post(`/api/admin/schedule/${later}/start`)).status, 400);
  assert.equal((await owner.post(`/api/admin/schedule/${later}/start`)).status, 400, 'admin chính cũng không bắt đầu trước giờ');

  // Còn 20 phút: bắt đầu được, người khác không mở được
  assert.equal((await minh.get(`/api/admin/schedule/${soon}`)).status, 403);
  assert.equal((await minh.post(`/api/admin/schedule/${soon}/start`)).status, 403);
  const started = await lan.post(`/api/admin/schedule/${soon}/start`);
  assert.equal(started.status, 200);
  assert.ok(started.body.session.startedAt);
  assert.equal(started.body.session.startedBy, 'Cô Lan');
  assert.equal(started.body.students.length, 2);

  // Giáo viên ngoài: chỉ admin chính
  assert.equal((await lan.get(`/api/admin/schedule/${outsider}`)).status, 403);
  assert.equal((await owner.post(`/api/admin/schedule/${outsider}/start`)).status, 200);

  // Danh sách: buổi người khác dạy hiện nhưng không mở được
  const minhView = (await minh.get(`/api/admin/schedule?from=${addDays(TODAY, -1)}&to=${addDays(TODAY, 1)}`)).body.sessions;
  assert.equal(minhView.length, 3);
  assert.ok(minhView.every((s) => !s.canOpen));
  assert.equal((await minh.get(`/api/admin/schedule?from=${addDays(TODAY, -1)}&to=${addDays(TODAY, 1)}&mine=1`)).body.sessions.length, 0);

  // Trang chính + chuông của Cô Lan: có 2 buổi sắp dạy
  assert.equal((await lan.get('/api/admin/notifications')).body.upcoming.length, 2);
  const ov = (await lan.get('/api/admin/schedule/overview')).body;
  assert.ok(ov.mySessions.some((s) => s.id === soon));
  await close();
});

test('Điểm danh: lưu, sửa, hết hạn sửa với giáo viên (hết ngày hôm sau), admin chính vẫn sửa được; ghi lịch sử', async () => {
  const { owner, lan, lanId, cls, close } = await setupCenter();
  const ids = (await lan.post(`/api/admin/classes/${cls.id}/students`, {
    students: [{ fullName: 'An', joinedOn: addDays(TODAY, -5) }, { fullName: 'Bình', joinedOn: addDays(TODAY, -5) }],
  })).body.ids;
  const now = (await owner.post('/api/admin/schedule', { classId: cls.id, ...slotAt(-10), teacherId: lanId, force: true })).body.ids[0];
  const old = (await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, -2), startTime: '08:00', endTime: '09:00', teacherId: lanId })).body.ids[0];
  const yesterday = (await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, -1), startTime: '08:00', endTime: '09:00', teacherId: lanId })).body.ids[0];

  const save = (client, id, records) => client.post(`/api/admin/schedule/${id}/attendance`, { records });
  assert.equal((await save(lan, now, [{ studentId: ids[0], status: 'here' }])).status, 400);
  assert.equal((await save(lan, now, [{ studentId: 99999, status: 'present' }])).status, 400);
  assert.equal((await save(lan, now, [{ studentId: ids[0], status: 'present', bonus: 99 }])).status, 400);

  const r = await save(lan, now, [{ studentId: ids[0], status: 'present', bonus: 2 }, { studentId: ids[1], status: 'absent' }]);
  assert.equal(r.status, 200);
  assert.ok(r.body.session.attendanceAt);
  assert.deepEqual(r.body.students.map((s) => [s.fullName, s.attendance.status, s.attendance.bonus, s.stats.bonus]), [
    ['An', 'present', 2, 2],
    ['Bình', 'absent', 0, 0],
  ]);
  await save(lan, now, [{ studentId: ids[0], status: 'present', bonus: 3 }, { studentId: ids[1], status: 'late' }]);

  // Buổi hôm qua: còn sửa được tới hết hôm nay. Buổi hôm kia: hết hạn với giáo viên.
  assert.equal((await save(lan, yesterday, [{ studentId: ids[0], status: 'present' }])).status, 200);
  const expired = await save(lan, old, [{ studentId: ids[0], status: 'present' }]);
  assert.equal(expired.status, 400);
  assert.match(expired.body.error, /hết hạn/);
  assert.equal((await save(owner, old, [{ studentId: ids[0], status: 'excused' }])).status, 200);

  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items.map((l) => [l.action, l.detail]);
  assert.ok(log.some(([a, d]) => a === 'save_attendance' && /1 có mặt, 1 vắng không phép \(Bình\)\. Điểm cộng: An \+2/.test(d)));
  assert.ok(log.some(([a, d]) => a === 'update_attendance' && /Bình: Vắng không phép → Đi muộn; An: điểm cộng 2 → 3|An: điểm cộng 2 → 3; Bình: Vắng không phép → Đi muộn/.test(d)));
  await close();
});

test('Nhắc học phí theo số buổi của từng học sinh: vào muộn thì tính từ buổi vào, vắng vẫn tính', async () => {
  const { owner, lan, lanId, cls, close } = await setupCenter();
  // 10 buổi đã qua: ngày -14 … -5
  const dates = Array.from({ length: 10 }, (_, i) => addDays(TODAY, -14 + i));
  const sessionIds = [];
  for (const date of dates) {
    sessionIds.push((await owner.post('/api/admin/schedule', { classId: cls.id, date, startTime: '18:00', endTime: '19:30', teacherId: lanId })).body.ids[0]);
  }
  // A học từ buổi 1. B vào lớp sau khi lớp đã học 3 buổi (từ buổi 4). C vào ở buổi 10 nhưng đã học 9 buổi trước khi lên web.
  const [a, b, c] = (await lan.post(`/api/admin/classes/${cls.id}/students`, {
    students: [
      { fullName: 'A', joinedOn: dates[0] },
      { fullName: 'B', joinedOn: dates[3] },
      { fullName: 'C', joinedOn: dates[9], priorSessions: 9 },
    ],
  })).body.ids;

  for (const [i, id] of sessionIds.entries()) {
    const detail = (await owner.get(`/api/admin/schedule/${id}`)).body;
    // Danh sách điểm danh của mỗi buổi chỉ có học sinh đã vào lớp
    const expected = ['A', ...(i >= 3 ? ['B'] : []), ...(i === 9 ? ['C'] : [])];
    assert.deepEqual(detail.students.map((s) => s.fullName), expected, `buổi ${i + 1}`);
    // A nghỉ 2 buổi vẫn được tính
    const records = detail.students.map((s) => ({ studentId: s.id, status: s.fullName === 'A' && (i === 1 || i === 6) ? 'absent' : 'present' }));
    assert.equal((await owner.post(`/api/admin/schedule/${id}/attendance`, { records })).status, 200);
  }

  const get = async () => Object.fromEntries((await owner.get(`/api/admin/classes/${cls.id}`)).body.students.map((s) => [s.fullName, s]));
  let st = await get();
  assert.equal(st.A.stats.sessions, 10);
  assert.equal(st.A.stats.absent, 2);
  assert.equal(st.A.fee.state, 'due');
  assert.equal(st.B.stats.sessions, 7);
  assert.equal(st.B.fee.state, 'ok');
  assert.equal(st.B.fee.remaining, 3);
  assert.equal(st.C.stats.sessions, 10);
  assert.equal(st.C.fee.state, 'due');

  // Danh sách nhắc học phí ở trang chính
  const reminders = (await lan.get('/api/admin/schedule/overview')).body.feeReminders;
  assert.deepEqual(reminders.map((s) => [s.fullName, s.className]), [['A', 'TOEIC 550 K1'], ['C', 'TOEIC 550 K1']]);
  assert.equal((await lan.get('/api/admin/classes')).body.classes[0].feeDue, 2);

  // B chưa tới hạn -> không đánh dấu đã thu được. A: đã thu -> hết nhắc, mốc tiếp theo 20; hoàn tác -> nhắc lại
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${b}/fee-paid`)).status, 400);
  const paid = await lan.post(`/api/admin/classes/${cls.id}/students/${a}/fee-paid`, { note: 'Mẹ An đóng tiền mặt' });
  assert.equal(paid.body.student.fee.state, 'ok');
  assert.equal(paid.body.student.fee.nextAt, 20);
  const hist = (await lan.get(`/api/admin/classes/${cls.id}/students/${a}`)).body;
  assert.equal(hist.history.length, 10);
  assert.deepEqual(hist.payments.map((p) => [p.cycleNo, p.sessionsAt, p.note, p.by]), [[1, 10, 'Mẹ An đóng tiền mặt', 'Cô Lan']]);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${a}/fee-undo`)).body.student.fee.state, 'due');

  // Xóa một buổi đã điểm danh: phải xác nhận, rồi số buổi giảm
  const del = await owner.post(`/api/admin/schedule/${sessionIds[9]}/delete`);
  assert.equal(del.status, 409);
  assert.equal(del.body.reason, 'has_attendance');
  assert.equal((await owner.post(`/api/admin/schedule/${sessionIds[9]}/delete`, { confirmAttendance: true })).status, 200);
  st = await get();
  assert.equal(st.A.stats.sessions, 9);
  assert.equal(st.A.fee.state, 'soon');
  assert.equal(st.C.stats.sessions, 9);

  // Cho nghỉ học khi đã có lịch sử: giữ lại, không xóa hẳn. C không còn buổi nào (buổi 10 vừa xóa) -> xóa hẳn
  const removed = await lan.post(`/api/admin/classes/${cls.id}/students/${b}/remove`);
  assert.equal(removed.body.deleted, false);
  assert.equal(removed.body.student.isActive, false);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${c}/remove`)).body.deleted, true);
  await close();
});
