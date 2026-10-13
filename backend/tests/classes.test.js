// Test lớp học, phân quyền giáo viên, thời khóa biểu, điểm danh, học phí theo buổi.
// Logic tính học phí (chu kỳ, hạn đóng, mức cảnh báo) test riêng ở tuition.test.js; ở đây test qua API.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { setup, createClient, testConfig } = require('./helpers');
const { vnDate, vnTime, addDays, weekdayOf } = require('../src/classes/time');

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

/** Học sinh thêm tay: bắt buộc đủ tên phụ huynh, SĐT, CCCD */
const full = (fullName, i = 1, extra = {}) => ({
  fullName,
  parentName: `Phụ huynh ${fullName}`,
  parentPhone: `090123456${i}`,
  parentIdNumber: `00120300400${i}`,
  ...extra,
});

/** Owner + 2 giáo viên (Cô Lan phụ trách lớp, Thầy Minh không), một lớp có sẵn */
async function setupCenter(classBody = {}) {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const lanId = (await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' })).body.account.id;
  const minhId = (await owner.post('/api/admin/accounts', { username: 'minh', displayName: 'Thầy Minh', password: 'matkhau-minh' })).body.account.id;
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');
  const minh = createClient(ctx.base);
  await minh.login('minh', 'matkhau-minh');
  const cls = (await owner.post('/api/admin/classes', { name: 'TOEIC 550 K1', color: 'teal', teacherIds: [lanId], ...classBody })).body.class;
  return { ...ctx, owner, lan, minh, lanId, minhId, cls };
}

/** Tải file (Excel) bằng cookie đăng nhập */
async function download(base, username, password, path) {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await fetch(base + path, { headers: { cookie } });
  if (res.status !== 200) return { status: res.status };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return { status: 200, wb };
}
const sheetText = (ws) => {
  const out = [];
  ws.eachRow((row) => out.push(row.values.slice(1).map((v) => (v instanceof Date ? v.toISOString() : String(v ?? ''))).join(' | ')));
  return out.join('\n');
};

test('Lớp + học sinh: chỉ admin chính thêm / sửa / xóa; thêm tay bắt buộc đủ thông tin phụ huynh', async () => {
  const { owner, lan, minh, cls, close } = await setupCenter();
  assert.equal((await lan.post('/api/admin/classes', { name: 'Lớp của Lan' })).status, 403, 'giáo viên không tạo lớp');
  assert.equal((await owner.post('/api/admin/classes', { name: 'toeic 550 k1' })).status, 409, 'trùng tên lớp');
  assert.equal((await owner.post('/api/admin/classes', { name: '' })).status, 400);

  // Thêm tay: thiếu thông tin phụ huynh -> báo lỗi rõ ràng
  const missing = await owner.post(`/api/admin/classes/${cls.id}/students`, { students: [{ fullName: 'An', parentName: 'Mẹ An' }] });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /SĐT phụ huynh, CCCD phụ huynh/);
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/students`, { students: [full('An', 1, { parentPhone: '12345' })] })).status, 400);
  assert.match((await owner.post(`/api/admin/classes/${cls.id}/students`, { students: [full('An', 1, { parentIdNumber: '1234' })] })).body.error, /12 số/);

  const add = await owner.post(`/api/admin/classes/${cls.id}/students`, {
    students: [full('Nguyễn Văn An', 1, { parentPhone: '0901 234 561' }), full('  Trần   Bình ', 2, { parentIdNumber: '012345678' })],
  });
  assert.equal(add.status, 201);
  assert.deepEqual(add.body.students.map((s) => [s.fullName, s.parentPhone, s.parentIdNumber, s.missingInfo]), [
    ['Nguyễn Văn An', '0901234561', '001203004001', false],
    ['Trần Bình', '0901234562', '012345678', false], // CMND cũ 9 số vẫn nhận
  ]);
  // Nhập từ Excel (có tên file): chỉ bắt buộc họ tên -> nhãn "Thiếu thông tin"
  const imp = await owner.post(`/api/admin/classes/${cls.id}/students`, { fileName: 'ds.xlsx', students: [{ fullName: 'Lê Chi' }] });
  assert.equal(imp.status, 201);
  const chi = imp.body.students.find((s) => s.fullName === 'Lê Chi');
  assert.equal(chi.missingInfo, true);
  // Sửa: không bắt buộc đủ; giảm giá 0–100
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/students/${chi.id}/update`, { note: 'Học bù' })).status, 200);
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/students/${chi.id}/update`, { discountPercent: 120 })).status, 400);
  const disc = await owner.post(`/api/admin/classes/${cls.id}/students/${chi.id}/update`, { discountPercent: 20, discountNote: 'Con giáo viên' });
  assert.equal(disc.body.student.discountPercent, 20);

  // Giáo viên không thêm / sửa / cho nghỉ học sinh, không sửa / xóa lớp
  const sid = add.body.students[0].id;
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students`, { students: [full('X')] })).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${sid}/update`, { fullName: 'Y' })).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/students/${sid}/remove`)).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/update`, { name: 'Đổi tên' })).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/delete`)).status, 403);
  assert.equal((await lan.post(`/api/admin/classes/${cls.id}/import/preview`)).status, 403);
  // Thầy Minh không phụ trách lớp: không thấy lớp
  assert.equal((await minh.get('/api/admin/classes')).body.classes.length, 0);
  assert.equal((await minh.get(`/api/admin/classes/${cls.id}`)).status, 403);
  assert.equal((await lan.get('/api/admin/classes')).body.classes.length, 1);

  // Chưa học buổi nào -> "cho nghỉ" = xóa hẳn
  const binh = add.body.students[1];
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/students/${binh.id}/remove`)).body.deleted, true);
  assert.equal((await owner.get(`/api/admin/classes/${cls.id}`)).body.students.length, 2);

  // Xóa lớp: ẩn với mọi người; chỉ admin chính xem / khôi phục
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/delete`)).status, 200);
  assert.equal((await lan.get('/api/admin/classes')).body.classes.length, 0);
  assert.equal((await lan.get(`/api/admin/classes/${cls.id}`)).status, 404);
  assert.equal((await lan.get('/api/admin/classes?deleted=1')).status, 403);
  assert.equal((await owner.get('/api/admin/classes?deleted=1')).body.classes.length, 1);
  assert.equal((await owner.post(`/api/admin/classes/${cls.id}/restore`)).status, 200);
  assert.equal((await lan.get('/api/admin/classes')).body.classes[0].studentCount, 2);

  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items;
  assert.deepEqual(log.map((l) => l.action).reverse(), [
    'create_class', 'add_students', 'import_students', 'update_student', 'update_student', 'delete_student', 'delete_class', 'restore_class',
  ]);
  assert.match(log.find((l) => l.action === 'update_student' && /giảm giá/.test(l.detail)).detail, /giảm giá 0% → 20%/);
  await close();
});

test('Giáo viên chỉ nhận dữ liệu đã lọc ở server: không tên phụ huynh, SĐT, CCCD, ghi chú, số tiền', async () => {
  const { owner, lan, lanId, cls, base, close } = await setupCenter({ cycleSessions: 4, pricePerSession: 150000 });
  const secret = { parentName: 'Bà Hoa Bí Mật', parentPhone: '0987654321', parentIdNumber: '079123456789', note: 'Ghi chú riêng', discountNote: 'Lý do riêng' };
  const add = await owner.post(`/api/admin/classes/${cls.id}/students`, {
    students: [{ fullName: 'Phạm Dũng', ...secret, discountPercent: 10, joinedOn: addDays(TODAY, -1) }],
  });
  const sid = add.body.ids[0];
  const sessionId = (await owner.post('/api/admin/schedule', { classId: cls.id, ...slotAt(-90), teacherIds: [lanId], force: true })).body.ids[0];
  await lan.post(`/api/admin/schedule/${sessionId}/attendance`, { records: [{ studentId: sid, status: 'present' }] });

  const leaks = (data) => {
    const text = JSON.stringify(data);
    return [...Object.values(secret), '150000', '150.000', 'pricePerSession', 'cycleSessions', 'amount', 'discount', 'parentName', 'parentPhone']
      .filter((v) => text.includes(v));
  };
  const responses = {
    classList: (await lan.get('/api/admin/classes')).body,
    classDetail: (await lan.get(`/api/admin/classes/${cls.id}`)).body,
    sessions: (await lan.get(`/api/admin/classes/${cls.id}/sessions`)).body,
    student: (await lan.get(`/api/admin/classes/${cls.id}/students/${sid}`)).body,
    session: (await lan.get(`/api/admin/schedule/${sessionId}`)).body,
    overview: (await lan.get('/api/admin/schedule/overview')).body,
    notifications: (await lan.get('/api/admin/notifications')).body,
  };
  for (const [name, data] of Object.entries(responses)) assert.deepEqual(leaks(data), [], name);
  // Giáo viên vẫn thấy số buổi đã học + nhãn học phí
  const st = responses.classDetail.students[0];
  assert.deepEqual(Object.keys(st).sort(), ['classId', 'fullName', 'id', 'isActive', 'stats', 'tuition']);
  assert.equal(st.tuition.sessionsDone, 1);
  // Owner thấy đủ
  const ownerView = (await owner.get(`/api/admin/classes/${cls.id}`)).body;
  assert.equal(ownerView.students[0].parentIdNumber, '079123456789');
  assert.equal(ownerView.class.pricePerSession, 150000);

  // Excel của giáo viên: chỉ tên + số buổi (+ trang điểm danh)
  const lanFile = await download(base, 'lan', 'matkhau-lan', `/api/admin/classes/${cls.id}/export`);
  const lanText = sheetText(lanFile.wb.getWorksheet('Danh sách lớp'));
  assert.equal(lanFile.wb.getWorksheet('Danh sách lớp').getRow(1).values.slice(1).join(','), 'STT,Họ và tên,Tổng số buổi');
  assert.deepEqual(Object.values(secret).filter((v) => lanText.includes(v)), []);
  assert.ok(lanFile.wb.getWorksheet('Điểm danh'));
  const ownerFile = await download(base, testConfig.ownerUsername, testConfig.ownerPassword, `/api/admin/classes/${cls.id}/export`);
  assert.match(sheetText(ownerFile.wb.getWorksheet('Danh sách lớp')), /079123456789/);
  // Excel một buổi học, danh sách cảnh báo: cũng không có thông tin riêng
  for (const path of [`/api/admin/schedule/${sessionId}/export`, '/api/admin/schedule/alerts/export']) {
    const f = await download(base, 'lan', 'matkhau-lan', path);
    assert.equal(f.status, 200, path);
    const text = f.wb.worksheets.map(sheetText).join('\n');
    assert.deepEqual([...Object.values(secret), '135000', '135.000'].filter((v) => text.includes(v)), [], path);
  }

  // Trang / thao tác học phí: giáo viên bị chặn hết (403)
  for (const [method, path, body] of [
    ['get', '/api/admin/tuition'],
    ['get', '/api/admin/tuition/export'],
    ['get', `/api/admin/tuition/students/${sid}`],
    ['post', `/api/admin/tuition/students/${sid}/pay`, { cycleNo: 1, method: 'cash' }],
    ['post', `/api/admin/tuition/students/${sid}/unpay`, { cycleNo: 1, password: 'matkhau-lan' }],
    ['post', `/api/admin/tuition/students/${sid}/snooze`, { cycleNo: 1 }],
  ]) {
    assert.equal((await lan[method](path, body)).status, 403, path);
  }
  await close();
});

test('Danh sách học sinh xếp theo tên (như sổ điểm danh), trùng tên thì theo họ', async () => {
  const { owner, lan, cls, close } = await setupCenter();
  await owner.post(`/api/admin/classes/${cls.id}/students`, {
    fileName: 'ds.xlsx',
    students: ['Đỗ Ngọc Linh', 'Trần Thị Bình', 'Nguyễn Văn An', 'Lê An', 'Bùi Thanh Mai'].map((fullName) => ({ fullName })),
  });
  const names = (await lan.get(`/api/admin/classes/${cls.id}`)).body.students.map((s) => s.fullName);
  assert.deepEqual(names, ['Lê An', 'Nguyễn Văn An', 'Trần Thị Bình', 'Đỗ Ngọc Linh', 'Bùi Thanh Mai']);
  await close();
});

test('Thời khóa biểu: chỉ admin chính xếp, nhiều giáo viên một buổi, lặp lại hằng tuần, báo trùng lịch', async () => {
  const { owner, lan, minh, lanId, minhId, cls, close } = await setupCenter();
  const base = { classId: cls.id, date: addDays(TODAY, 1), startTime: '18:00', endTime: '19:30' };

  assert.equal((await lan.post('/api/admin/schedule', { ...base, teacherIds: [lanId] })).status, 403);
  const noTeacher = await owner.post('/api/admin/schedule', base);
  assert.equal(noTeacher.status, 400);
  assert.match(noTeacher.body.error, /giáo viên/);
  assert.equal((await owner.post('/api/admin/schedule', { ...base, teacherIds: [lanId], endTime: '17:00' })).status, 400);

  // Lặp lại vào thứ của ngày bắt đầu + thứ sau đó, trong 4 tuần; 2 giáo viên dạy cùng
  const wd = weekdayOf(base.date);
  const weekdays = [wd, (wd % 7) + 1];
  const until = addDays(base.date, 27);
  const r = await owner.post('/api/admin/schedule', { ...base, teacherIds: [lanId, minhId], room: 'P.2', repeat: { weekdays, until } });
  assert.equal(r.status, 201);
  assert.equal(r.body.count, 8);
  const list = (await lan.get(`/api/admin/schedule?from=${base.date}&to=${until}`)).body.sessions;
  assert.equal(list.length, 8);
  assert.ok(list.every((s) => s.teacher.name === 'Cô Lan, Thầy Minh' && s.room === 'P.2' && s.canOpen && s.teacher.isMine));
  assert.equal(new Set(list.map((s) => s.seriesId)).size, 1);
  // Được xếp dạy -> Thầy Minh tự thành giáo viên phụ trách lớp
  assert.equal((await minh.get('/api/admin/classes')).body.classes.length, 1);
  assert.deepEqual((await owner.get(`/api/admin/classes/${cls.id}`)).body.class.teachers.map((t) => t.name), ['Cô Lan', 'Thầy Minh']);
  assert.equal((await minh.get(`/api/admin/schedule?from=${base.date}&to=${until}&mine=1`)).body.sessions.length, 8);

  // Mỗi giáo viên nhận thông báo trên web
  for (const client of [lan, minh]) {
    const n = (await client.get('/api/admin/notifications')).body;
    assert.equal(n.unread, 1);
    assert.match(n.items[0].text, /8 buổi học lớp "TOEIC 550 K1"/);
  }
  await lan.post('/api/admin/notifications/read');
  assert.equal((await lan.get('/api/admin/notifications')).body.unread, 0);

  // Cô Lan đã có lịch 18:00–19:30 -> xếp lớp khác 19:00 trùng giờ: server báo, xác nhận (force) mới lưu
  const cls2 = (await owner.post('/api/admin/classes', { name: 'IELTS K2' })).body.class;
  const clash = await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:00', endTime: '20:00', teacherIds: [lanId] });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.reason, 'confirm');
  assert.match(clash.body.conflicts[0], /Cô Lan đang dạy lớp "TOEIC 550 K1"/);
  assert.equal((await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:30', endTime: '21:00', teacherIds: [lanId] })).status, 201);
  assert.equal((await owner.post('/api/admin/schedule', { ...base, classId: cls2.id, startTime: '19:00', endTime: '20:00', teacherIds: [lanId], force: true })).status, 201);
  await close();
});

test('Sửa / xóa "buổi này và các buổi sau" trong lịch lặp lại', async () => {
  const { owner, lanId, cls, close } = await setupCenter();
  const date = addDays(TODAY, 1);
  await owner.post('/api/admin/schedule', {
    classId: cls.id, date, startTime: '08:00', endTime: '09:00', teacherIds: [lanId], repeat: { weekdays: [1, 2, 3, 4, 5, 6, 7], until: addDays(date, 5) },
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
  assert.equal((await owner.get(`/api/admin/classes/${cls.id}/sessions`)).body.sessions.map((s) => s.no).join(','), '1,2,3,4,5,6');

  const del = await owner.post(`/api/admin/schedule/${after[4].id}/delete`, { scope: 'following' });
  assert.equal(del.body.deleted, 2);
  assert.equal((await owner.post(`/api/admin/schedule/${after[0].id}/delete`, { scope: 'one' })).body.deleted, 1);
  assert.equal((await owner.get(`/api/admin/schedule?from=${date}&to=${addDays(date, 5)}`)).body.sessions.length, 3);
  await close();
});

test('Bắt đầu buổi học: giáo viên của buổi + giáo viên phụ trách lớp, từ 30 phút trước giờ học', async () => {
  const { owner, lan, minh, lanId, minhId, cls, close } = await setupCenter();
  await owner.post(`/api/admin/classes/${cls.id}/students`, { fileName: 'ds.xlsx', students: [{ fullName: 'An' }, { fullName: 'Bình' }] });
  const create = async (slot, teacher = { teacherIds: [lanId] }) =>
    (await owner.post('/api/admin/schedule', { classId: cls.id, ...slot, ...teacher, force: true })).body.ids[0];

  const later = await create(slotAt(120));
  const soon = await create(slotAt(20));
  const outsider = await create(slotAt(25), { teacherName: 'Thầy Tom' });

  // Còn 2 tiếng: mở xem được nhưng chưa bắt đầu được (admin chính cũng vậy)
  const d = (await lan.get(`/api/admin/schedule/${later}`)).body;
  assert.equal(d.permissions.canStart, false);
  assert.match(d.permissions.reason, /30 phút/);
  assert.equal((await lan.post(`/api/admin/schedule/${later}/start`)).status, 400);
  assert.equal((await owner.post(`/api/admin/schedule/${later}/start`)).status, 400);

  // Còn 20 phút: bắt đầu được; Thầy Minh (không dạy, không phụ trách lớp) không mở được
  assert.equal((await minh.get(`/api/admin/schedule/${soon}`)).status, 403);
  assert.equal((await minh.post(`/api/admin/schedule/${soon}/start`)).status, 403);
  const started = await lan.post(`/api/admin/schedule/${soon}/start`);
  assert.equal(started.status, 200);
  assert.equal(started.body.session.startedBy, 'Cô Lan');
  assert.equal(started.body.students.length, 2);
  assert.equal(started.body.session.no, 1);

  // Buổi giáo viên ngoài dạy: Cô Lan phụ trách lớp nên vẫn mở / điểm danh được; Thầy Minh thì không
  assert.equal((await lan.get(`/api/admin/schedule/${outsider}`)).status, 200);
  assert.equal((await minh.get(`/api/admin/schedule/${outsider}`)).status, 403);

  // Danh sách: buổi người khác dạy hiện nhưng không mở được
  const minhView = (await minh.get(`/api/admin/schedule?from=${addDays(TODAY, -1)}&to=${addDays(TODAY, 1)}`)).body.sessions;
  assert.equal(minhView.length, 3);
  assert.ok(minhView.every((s) => !s.canOpen));
  // Xếp Thầy Minh dạy cùng buổi "soon" -> mở được
  const { startTime, endTime } = started.body.session;
  assert.equal((await owner.post(`/api/admin/schedule/${soon}/update`, { startTime, endTime, teacherIds: [lanId, minhId], force: true })).status, 200);
  assert.equal((await minh.get(`/api/admin/schedule/${soon}`)).status, 200);

  // Trang chính + chuông của Cô Lan: có 2 buổi sắp dạy
  assert.equal((await lan.get('/api/admin/notifications')).body.upcoming.length, 2);
  const ov = (await lan.get('/api/admin/schedule/overview')).body;
  assert.ok(ov.mySessions.some((s) => s.id === soon));
  assert.equal(ov.today, TODAY);
  assert.match(ov.todayLabel, /\d{2}\/\d{2}\/\d{4}/);
  await close();
});

test('Điểm danh: lưu, sửa, hết hạn sửa với giáo viên (hết ngày hôm sau), admin chính vẫn sửa được; ghi lịch sử', async () => {
  const { owner, lan, lanId, cls, close } = await setupCenter();
  const ids = (await owner.post(`/api/admin/classes/${cls.id}/students`, {
    fileName: 'ds.xlsx',
    students: [{ fullName: 'An', joinedOn: addDays(TODAY, -5) }, { fullName: 'Bình', joinedOn: addDays(TODAY, -5) }],
  })).body.ids;
  const now = (await owner.post('/api/admin/schedule', { classId: cls.id, ...slotAt(-10), teacherIds: [lanId], force: true })).body.ids[0];
  const old = (await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, -2), startTime: '08:00', endTime: '09:00', teacherIds: [lanId], force: true })).body.ids[0];
  const yesterday = (await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, -1), startTime: '08:00', endTime: '09:00', teacherIds: [lanId], force: true })).body.ids[0];

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

  // Buổi owner vừa THÊM BÙ vào quá khứ: giáo viên điểm danh bổ sung được tới hết ngày hôm sau ngày thêm
  assert.equal((await save(lan, old, [{ studentId: ids[0], status: 'present' }])).status, 200);
  assert.equal((await save(lan, yesterday, [{ studentId: ids[0], status: 'present' }])).status, 200);

  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items.map((l) => [l.action, l.detail]);
  assert.ok(log.some(([a, d]) => a === 'save_attendance' && /1 có mặt, 1 vắng không phép \(Bình\)\. Điểm cộng: An \+2/.test(d)));
  assert.ok(log.some(([a, d]) => a === 'update_attendance' && /Bình: Vắng không phép → Đi muộn; An: điểm cộng 2 → 3|An: điểm cộng 2 → 3; Bình: Vắng không phép → Đi muộn/.test(d)));
  await close();
});

test('Hết hạn sửa điểm danh với giáo viên: buổi được xếp trước ngày học, đã qua hơn 1 ngày', async () => {
  const { owner, lan, lanId, cls, db, close } = await setupCenter();
  const sid = (await owner.post(`/api/admin/classes/${cls.id}/students`, { fileName: 'ds.xlsx', students: [{ fullName: 'An', joinedOn: addDays(TODAY, -5) }] })).body.ids[0];
  const old = (await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, -2), startTime: '08:00', endTime: '09:00', teacherIds: [lanId], force: true })).body.ids[0];
  // Giả như buổi này đã có trên lịch từ trước ngày học
  db.prepare('UPDATE class_sessions SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 10 * 86400000).toISOString(), old);
  const expired = await lan.post(`/api/admin/schedule/${old}/attendance`, { records: [{ studentId: sid, status: 'present' }] });
  assert.equal(expired.status, 400);
  assert.match(expired.body.error, /hết hạn/);
  assert.equal((await owner.post(`/api/admin/schedule/${old}/attendance`, { records: [{ studentId: sid, status: 'excused' }] })).status, 200);
  await close();
});

test('Quy tắc thời khóa biểu: buổi đã điểm danh không xóa / không đổi giờ; thêm buổi quá khứ phải xác nhận', async () => {
  const { owner, lanId, minhId, cls, close } = await setupCenter();
  const sid = (await owner.post(`/api/admin/classes/${cls.id}/students`, { fileName: 'ds.xlsx', students: [{ fullName: 'An', joinedOn: addDays(TODAY, -10) }] })).body.ids[0];
  const past = { classId: cls.id, date: addDays(TODAY, -3), startTime: '18:00', endTime: '19:30', teacherIds: [lanId] };

  // Thêm buổi đã qua: server hỏi lại ("sẽ được tính tiền")
  const ask = await owner.post('/api/admin/schedule', past);
  assert.equal(ask.status, 409);
  assert.equal(ask.body.reason, 'confirm');
  assert.equal(ask.body.past, 1);
  const done = (await owner.post('/api/admin/schedule', { ...past, force: true })).body.ids[0];
  await owner.post(`/api/admin/schedule/${done}/attendance`, { records: [{ studentId: sid, status: 'present' }] });

  // Đã điểm danh: không xóa, không đổi ngày giờ; đổi giáo viên / phòng / ghi chú thì được
  const del = await owner.post(`/api/admin/schedule/${done}/delete`, { force: true });
  assert.equal(del.status, 400);
  assert.equal(del.body.reason, 'locked');
  const move = await owner.post(`/api/admin/schedule/${done}/update`, { ...past, startTime: '17:00', force: true });
  assert.equal(move.status, 400);
  assert.match(move.body.error, /không đổi được ngày giờ/);
  assert.equal((await owner.post(`/api/admin/schedule/${done}/update`, { ...past, date: addDays(TODAY, -4), force: true })).status, 400);
  const ok = await owner.post(`/api/admin/schedule/${done}/update`, { ...past, teacherIds: [minhId], room: 'P.5', note: 'Học bù' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.session.teacher.name, 'Thầy Minh');
  assert.equal(ok.body.permissions.locked, true);

  // Buổi chưa điểm danh: xóa được
  const free = (await owner.post('/api/admin/schedule', { ...past, date: addDays(TODAY, 2) })).body.ids[0];
  assert.equal((await owner.post(`/api/admin/schedule/${free}/delete`)).status, 200);
  await close();
});

test('Học phí theo buổi qua API: cảnh báo, thu tiền, bỏ "Đã thu" phải nhập mật khẩu, tắt cảnh báo, báo lệch khi đổi lịch', async () => {
  const { owner, lan, lanId, cls, base, close } = await setupCenter({ cycleSessions: 4, pricePerSession: 100000 });
  // 4 buổi đã qua (kì 1) + 4 buổi sắp tới (kì 2) -> lớp đang ở kì 2, hạn đóng kì 2 = buổi 4 (hôm qua) -> ĐỎ
  for (const d of [-4, -3, -2, -1, 1, 2, 3, 4]) {
    await owner.post('/api/admin/schedule', { classId: cls.id, date: addDays(TODAY, d), startTime: '18:00', endTime: '19:30', teacherIds: [lanId], force: true });
  }
  const sessions = (await owner.get(`/api/admin/classes/${cls.id}/sessions`)).body.sessions;
  assert.deepEqual(sessions.map((s) => `${s.no}:${s.cycle}`), ['1:1', '2:1', '3:1', '4:1', '5:2', '6:2', '7:2', '8:2']);
  // An học từ buổi 1; Bình vào giữa kì 1 (buổi 3), giảm giá 10%
  const [an, binh] = (await owner.post(`/api/admin/classes/${cls.id}/students`, {
    students: [full('An', 1, { startSessionId: sessions[0].id }), full('Bình', 2, { startSessionId: sessions[2].id, discountPercent: 10 })],
  })).body.ids;

  let h = (await owner.get(`/api/admin/tuition/students/${binh}`)).body;
  assert.deepEqual(h.cycles.map((c) => [c.cycleNo, c.sessionCount, c.amount, c.dueDate]), [
    [1, 2, 180000, addDays(TODAY, -2)], // 2 buổi × 100.000 × 90%; hạn = buổi bắt đầu học
    [2, 4, 360000, addDays(TODAY, -1)], // hạn kì 2 = ngày buổi cuối kì 1
  ]);

  // Trang chính: owner thấy cả số tiền + nhắc xếp lịch kì 3; giáo viên thấy cảnh báo nhưng không có tiền
  const ownerOv = (await owner.get('/api/admin/schedule/overview')).body.tuition;
  assert.deepEqual(ownerOv.items.map((a) => [a.fullName, a.level, a.kind, a.cycleNo, a.amount]), [
    ['An', 'red', 'overdue', 2, 400000],
    ['Bình', 'red', 'overdue', 2, 360000],
  ]);
  assert.deepEqual(ownerOv.gaps.map((g) => [g.className, g.cycleNo, g.scheduled, g.needed]), [['TOEIC 550 K1', 3, 0, 4]]);
  const lanOv = (await lan.get('/api/admin/schedule/overview')).body.tuition;
  assert.deepEqual(lanOv.items.map((a) => [a.fullName, a.level, a.amount]), [['An', 'red', undefined], ['Bình', 'red', undefined]]);
  assert.equal(lanOv.gaps, undefined);
  assert.equal((await lan.get(`/api/admin/classes/${cls.id}`)).body.students.find((s) => s.id === an).tuition.labels.current, 'unpaid');

  // Thu kì 2 của An: kiểm tra dữ liệu, rồi thu
  assert.equal((await owner.post(`/api/admin/tuition/students/${an}/pay`, { cycleNo: 2 })).status, 400, 'thiếu hình thức');
  assert.equal((await owner.post(`/api/admin/tuition/students/${an}/pay`, { cycleNo: 9, method: 'cash' })).status, 400, 'kì chưa xếp lịch');
  assert.equal((await owner.post(`/api/admin/tuition/students/${an}/pay`, { cycleNo: 2, method: 'cash', paidOn: addDays(TODAY, 1) })).status, 400);
  const paid = await owner.post(`/api/admin/tuition/students/${an}/pay`, { cycleNo: 2, method: 'transfer', note: 'Mẹ An chuyển khoản' });
  assert.equal(paid.status, 200);
  assert.deepEqual(paid.body.cycles.find((c) => c.cycleNo === 2).payment, {
    amount: 400000, paidOn: TODAY, method: 'transfer', note: 'Mẹ An chuyển khoản', by: 'Thom Tran', sessionCount: 4,
  });
  assert.equal((await owner.post(`/api/admin/tuition/students/${an}/pay`, { cycleNo: 2, method: 'cash' })).status, 409, 'đã thu rồi');
  assert.equal((await lan.get(`/api/admin/classes/${cls.id}`)).body.students.find((s) => s.id === an).tuition.labels.current, 'paid');
  assert.deepEqual((await owner.get('/api/admin/schedule/overview')).body.tuition.items.map((a) => a.fullName), ['Bình']);

  // Tắt cảnh báo kì 2 của Bình -> hết cảnh báo; bật lại -> đỏ lại
  await owner.post(`/api/admin/tuition/students/${binh}/snooze`, { cycleNo: 2 });
  assert.deepEqual((await owner.get('/api/admin/schedule/overview')).body.tuition.items, []);
  await owner.post(`/api/admin/tuition/students/${binh}/unsnooze`, { cycleNo: 2 });
  assert.equal((await owner.get('/api/admin/schedule/overview')).body.tuition.items.length, 1);

  // Thêm buổi bù vào quá khứ làm đánh số lại: server nêu rõ kì đã thu bị lệch; tiền đã thu giữ nguyên
  const extra = { classId: cls.id, date: addDays(TODAY, -5), startTime: '18:00', endTime: '19:30', teacherIds: [lanId] };
  const ask = await owner.post('/api/admin/schedule', extra);
  assert.equal(ask.status, 409);
  assert.equal(ask.body.past, 1);
  assert.deepEqual(ask.body.cycles, [{ fullName: 'An', cycleNo: 2 }]);
  assert.equal((await owner.post('/api/admin/schedule', { ...extra, force: true })).status, 201);
  h = (await owner.get(`/api/admin/tuition/students/${an}`)).body;
  const c2 = h.cycles.find((c) => c.cycleNo === 2);
  assert.equal(c2.mismatch, true);
  assert.equal(c2.payment.amount, 400000);

  // Bỏ "Đã thu": sai mật khẩu bị từ chối; đúng mật khẩu thì về "Chưa đóng"; mọi việc đều có lịch sử
  const wrong = await owner.post(`/api/admin/tuition/students/${an}/unpay`, { cycleNo: 2, password: 'sai-mat-khau' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.reason, 'wrong_password');
  const undo = await owner.post(`/api/admin/tuition/students/${an}/unpay`, { cycleNo: 2, password: testConfig.ownerPassword, note: 'Ghi nhầm' });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.cycles.find((c) => c.cycleNo === 2).payment, null);
  assert.deepEqual(undo.body.events.map((e) => [e.action, e.cycleNo, e.amount]), [['unpay', 2, 400000], ['pay', 2, 400000]]);
  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items.map((l) => l.action);
  for (const a of ['tuition_pay', 'tuition_unpay', 'tuition_snooze', 'tuition_unsnooze']) assert.ok(log.includes(a), a);

  // Trang Quản lý học phí theo tháng (tháng có hạn đóng kì 2) + Excel
  const month = addDays(TODAY, -2).slice(0, 7); // sau khi thêm buổi bù, hạn kì 2 = buổi cuối kì 1 (hôm kia)
  const report = (await owner.get(`/api/admin/tuition?month=${month}`)).body;
  const k = report.classes.find((c) => c.id === cls.id);
  assert.equal(k.teachers.join(), 'Cô Lan');
  assert.equal(k.due, k.students.reduce((n, s) => n + s.due, 0));
  assert.ok(k.students.every((s) => s.dueCycles.some((c) => c.cycleNo === 2)));
  assert.equal((await owner.get('/api/admin/tuition?month=2026-13')).status, 400);
  const file = await download(base, testConfig.ownerUsername, testConfig.ownerPassword, `/api/admin/tuition/export?month=${month}`);
  assert.equal(file.status, 200);
  assert.match(sheetText(file.wb.getWorksheet('Chi tiết')), /Bình/);
  const hist = await download(base, testConfig.ownerUsername, testConfig.ownerPassword, `/api/admin/tuition/students/${an}/export`);
  assert.match(sheetText(hist.wb.getWorksheet('Lịch sử')), /Bỏ "Đã thu"/);

  // Cho nghỉ học khi đã có lịch sử thu tiền: giữ lại, không xóa hẳn
  const removed = await owner.post(`/api/admin/classes/${cls.id}/students/${an}/remove`);
  assert.equal(removed.body.deleted, false);
  await close();
});
