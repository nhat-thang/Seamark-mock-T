// Test 2 cách làm bài: Training Test (chỉ nhập họ tên) và Class Assignment (chọn lớp -> bấm tên mình),
// mật khẩu đề, giáo viên xem hoạt động (ai làm, lúc nào, mấy lần) và lịch sử bài làm của học sinh.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function setupCenter() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const lanId = (await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' })).body.account.id;
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');
  // Admin chính tạo lớp + thêm học sinh; Cô Lan là giáo viên phụ trách hai lớp
  const k1 = (await owner.post('/api/admin/classes', { name: 'Lớp 1A', teacherIds: [lanId] })).body.class;
  const k2 = (await owner.post('/api/admin/classes', { name: 'Lớp 2B', teacherIds: [lanId] })).body.class;
  const ids1 = (await owner.post(`/api/admin/classes/${k1.id}/students`, {
    fileName: 'ds.xlsx',
    students: [{ fullName: 'Nguyễn Văn An', parentPhone: '0901234567', parentName: 'Mẹ An', parentIdNumber: '001203004005', note: 'Dị ứng hải sản' }, { fullName: 'Trần Thị Bình' }, { fullName: 'Lê Châu' }],
  })).body.ids;
  const ids2 = (await owner.post(`/api/admin/classes/${k2.id}/students`, { fileName: 'ds.xlsx', students: [{ fullName: 'Phạm Huy' }] })).body.ids;
  return { ...ctx, owner, lan, lanId, k1, k2, ids1, ids2 };
}

/** Đề mẫu 2 (đã xuất bản, Part 5 câu 101–130) thành Class Assignment của Cô Lan, giao cho các lớp */
async function makeAssignment({ db, lan, lanId }, classIds, accessCode = '') {
  db.prepare(`UPDATE exams SET category = 'homework', created_by = ? WHERE code = 'DE-MAU-2'`).run(lanId);
  const examId = db.prepare(`SELECT id FROM exams WHERE code = 'DE-MAU-2'`).get().id;
  const r = await lan.post(`/api/admin/exams/${examId}/assignment`, { classIds, accessCode });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return examId;
}

const startClass = (base, body) => fetch(`${base}/api/attempts`, json(body)).then(async (r) => ({ status: r.status, body: await r.json() }));
const submit = (base, s, answers) =>
  fetch(`${base}/api/attempts/${s.attemptId}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-attempt-token': s.token }, body: JSON.stringify({ answers, flagged: [] }),
  });

test('Tạo Class Assignment: tên tự có "Class Assignment - ", mã CA-001, giao nhiều lớp, mật khẩu không bắt buộc', async () => {
  const { owner, lan, lanId, k1, k2, close } = await setupCenter();
  const base = { category: 'homework', durationMinutes: 30, examType: 'CUSTOM' };

  const r1 = await lan.post('/api/admin/exams', { ...base, title: 'đề lớp 1a', classIds: [k1.id, k2.id], accessCode: ' Abc123 ' });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.deepEqual([r1.body.code, r1.body.title], ['CA-001', 'Class Assignment - đề lớp 1a']);
  const d = (await lan.get(`/api/admin/exams/${r1.body.id}`)).body.exam;
  assert.deepEqual(d.classes.map((c) => c.name), ['Lớp 1A', 'Lớp 2B']);
  assert.equal(d.accessCode, 'Abc123');
  assert.equal(d.author, 'Cô Lan');

  // Không mật khẩu, chưa giao lớp nào: vẫn tạo được; lỡ gõ chữ ở đầu không bị lặp
  const r2 = await owner.post('/api/admin/exams', { ...base, title: 'Class Assignment - Ôn tập', authorId: lanId });
  assert.deepEqual([r2.body.code, r2.body.title], ['CA-002', 'Class Assignment - Ôn tập']);
  assert.equal((await owner.post('/api/admin/exams', { ...base, title: 'homework' })).status, 400);
  assert.equal((await owner.post('/api/admin/exams', { ...base, title: 'X', classIds: [9999] })).status, 400);

  // Đổi tên: luôn giữ chữ ở đầu
  await lan.post(`/api/admin/exams/${r1.body.id}/lock`);
  const settings = { code: 'CA-001', title: 'Đề lớp 1A (sửa)', durationMinutes: 30, internalNote: '', allowSeekAudio: false, showAnswersAfter: true };
  assert.equal((await lan.post(`/api/admin/exams/${r1.body.id}/save`, { version: d.version, settings })).status, 200);
  assert.equal((await lan.get(`/api/admin/exams/${r1.body.id}`)).body.exam.title, 'Class Assignment - Đề lớp 1A (sửa)');

  // Đổi lớp + bỏ mật khẩu: ghi lịch sử
  const upd = await lan.post(`/api/admin/exams/${r1.body.id}/assignment`, { classIds: [k1.id], accessCode: '' });
  assert.deepEqual([upd.body.classes.map((c) => c.name), upd.body.accessCode], [['Lớp 1A'], '']);
  const log = (await owner.get('/api/admin/history/audit')).body.items.find((l) => l.action === 'update_assignment');
  assert.match(log.detail, /bỏ lớp Lớp 2B; bỏ mật khẩu đề/);

  // Đề Training Test không giao lớp được
  const training = (await owner.get('/api/admin/exams')).body.exams.find((e) => e.code === 'DE-MAU-1');
  assert.equal(training.category, 'exam');
  assert.equal((await owner.post(`/api/admin/exams/${training.id}/assignment`, { classIds: [k1.id] })).status, 400);
  await close();
});

test('Training Test: chỉ cần họ tên (không SĐT), chỉ thấy đề Training; đề của lớp không vào được bằng đường này', async () => {
  const ctx = await setupCenter();
  const { base, k1, close } = ctx;
  const examId = await makeAssignment(ctx, [k1.id]);

  const list = (await (await fetch(`${base}/api/exams`)).json()).exams.map((e) => e.code);
  assert.ok(list.includes('DE-MAU-1'));
  assert.ok(!list.includes('DE-MAU-2'), 'đề Class Assignment không nằm trong Training Test');

  const mau1 = (await (await fetch(`${base}/api/exams`)).json()).exams.find((e) => e.code === 'DE-MAU-1').id;
  const a = await startClass(base, { lastName: 'Ngô', firstName: 'Minh', examId: mau1 });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  // Chỉ có họ tên: không tự mở lại bài của người trùng tên -> lượt mới
  const b = await startClass(base, { lastName: 'Ngô', firstName: 'Minh', examId: mau1 });
  assert.notEqual(b.body.attemptId, a.body.attemptId);
  // Có SĐT (trình duyệt bản cũ) thì vẫn mở lại đúng bài dở
  const c1 = await startClass(base, { lastName: 'A', firstName: 'B', phone: '0911111111', examId: mau1 });
  const c2 = await startClass(base, { lastName: 'A', firstName: 'B', phone: '0911111111', examId: mau1 });
  assert.equal(c2.body.attemptId, c1.body.attemptId);

  const blocked = await startClass(base, { lastName: 'Ngô', firstName: 'Minh', examId });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /Class Assignment/);
  await close();
});

test('Class Assignment phía học sinh: thấy lớp + họ tên (không lộ SĐT / ghi chú), bấm tên làm bài, mật khẩu đề', async () => {
  const ctx = await setupCenter();
  const { base, owner, k1, k2, ids1, ids2, close } = ctx;
  const examId = await makeAssignment(ctx, [k1.id], 'Abc123');

  const classes = (await (await fetch(`${base}/api/classes`)).json()).classes;
  assert.deepEqual(classes.map((c) => [c.name, c.studentCount, c.assignmentCount]), [['Lớp 1A', 3, 1], ['Lớp 2B', 1, 0]]);

  const raw = await (await fetch(`${base}/api/classes/${k1.id}`)).text();
  assert.ok(!raw.includes('0901234567') && !raw.includes('Dị ứng'), 'lộ SĐT / ghi chú học sinh');
  const one = JSON.parse(raw);
  assert.deepEqual(one.students.map((s) => s.fullName), ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Châu']);
  assert.deepEqual(Object.keys(one.students[0]).sort(), ['fullName', 'id']);

  const asg = await (await fetch(`${base}/api/classes/${k1.id}/assignments?student=${ids1[0]}`)).text();
  assert.ok(!asg.includes('Abc123'), 'lộ mật khẩu đề');
  assert.equal(JSON.parse(asg).assignments[0].needsPassword, true);
  assert.equal((await (await fetch(`${base}/api/classes/${k2.id}/assignments`)).json()).assignments.length, 0);

  // Mật khẩu: thiếu / sai bị chặn; đúng (không phân biệt hoa thường) thì vào được
  const noPw = await startClass(base, { classStudentId: ids1[0], examId });
  assert.deepEqual([noPw.status, noPw.body.reason], [403, 'password']);
  assert.equal((await startClass(base, { classStudentId: ids1[0], examId, password: 'sai' })).status, 403);
  const ok = await startClass(base, { classStudentId: ids1[0], examId, password: ' abc123 ' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  // Bấm lại tên mình: mở lại đúng bài đang làm dở
  const again = await startClass(base, { classStudentId: ids1[0], examId, password: 'ABC123' });
  assert.equal(again.body.attemptId, ok.body.attemptId);
  // Lớp 2B không được giao đề này
  assert.equal((await startClass(base, { classStudentId: ids2[0], examId, password: 'Abc123' })).status, 403);

  await submit(base, ok.body, { 101: 'B', 102: 'A' });
  const view = await (await fetch(`${base}/api/attempts/${ok.body.attemptId}`, { headers: { 'x-attempt-token': ok.body.token } })).json();
  assert.equal(view.classId, k1.id);
  assert.deepEqual([view.student.lastName, view.student.firstName], ['Nguyễn Văn', 'An']);
  const after = (await (await fetch(`${base}/api/classes/${k1.id}/assignments?student=${ids1[0]}`)).json()).assignments[0];
  assert.deepEqual([after.doneCount, after.lastCorrect, after.inProgress], [1, 1, false]);

  // Học sinh đã nghỉ không còn trong danh sách, không làm bài được; có bài làm nên chỉ ẩn (không xóa)
  const removed = await owner.post(`/api/admin/classes/${k1.id}/students/${ids1[0]}/remove`);
  assert.equal(removed.body.deleted, false);
  assert.equal((await (await fetch(`${base}/api/classes/${k1.id}`)).json()).students.length, 2);
  assert.equal((await startClass(base, { classStudentId: ids1[0], examId, password: 'Abc123' })).status, 404);
  await close();
});

test('Giáo viên: hoạt động của đề (ai làm, lúc nào, mấy lần, ai chưa làm) + lịch sử bài làm của học sinh', async () => {
  const ctx = await setupCenter();
  const { base, owner, lan, k1, ids1, close } = ctx;
  const examId = await makeAssignment(ctx, [k1.id]);

  // An làm 2 lần, Bình làm 1 lần, Châu chưa làm; một người làm bằng đường khác (không thuộc lớp)
  for (const [sid, answers] of [[ids1[0], { 101: 'B' }], [ids1[0], { 101: 'B', 102: 'C' }], [ids1[1], {}]]) {
    const s = await startClass(base, { classStudentId: sid, examId });
    await submit(base, s.body, answers);
  }
  const act = (await lan.get(`/api/admin/exams/${examId}/activity`)).body;
  assert.equal(act.classes.length, 1);
  assert.deepEqual(
    act.classes[0].students.map((s) => [s.fullName, s.attempts.length, s.attempts.at(-1)?.correct ?? null]),
    [['Nguyễn Văn An', 2, 2], ['Trần Thị Bình', 1, 0], ['Lê Châu', 0, null]]
  );
  assert.ok(act.classes[0].students[0].attempts.every((a) => a.status === 'submitted' && a.startedAt && a.submittedAt));

  // Lịch sử của học sinh trong lớp
  const hist = (await lan.get(`/api/admin/classes/${k1.id}/students/${ids1[0]}`)).body;
  assert.equal(hist.attempts.length, 2);
  assert.match(hist.attempts[0].examTitle, /Đề mẫu 2/);

  // Kết quả: học sinh của lớp có tên lớp; lọc theo Class Assignment
  const results = (await owner.get('/api/admin/results?category=homework')).body.items;
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.student.className === 'Lớp 1A' && r.student.phone === ''));

  // Đổi tên học sinh: tên trong kết quả đổi theo
  await owner.post(`/api/admin/classes/${k1.id}/students/${ids1[1]}/update`, { fullName: 'Trần Thị Bình Minh' });
  const renamed = (await owner.get('/api/admin/results?category=homework')).body.items.find((r) => r.student.classStudentId === ids1[1]);
  assert.deepEqual([renamed.student.lastName, renamed.student.firstName], ['Trần Thị Bình', 'Minh']);

  // Tải tab Hoạt động về Excel
  const login = await fetch(`${base}/api/auth/login`, json({ username: 'lan', password: 'matkhau-lan' }));
  const file = await fetch(`${base}/api/admin/exams/${examId}/activity/export`, { headers: { cookie: login.headers.get('set-cookie').split(';')[0] } });
  assert.equal(file.status, 200);
  const wb = new (require('exceljs').Workbook)();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));
  const text = [];
  wb.getWorksheet('Hoạt động').eachRow((r) => text.push(r.values.slice(1).join(' | ')));
  assert.match(text.join('\n'), /Lớp 1A \| Nguyễn Văn An \| 2/);
  assert.match(text.join('\n'), /Lê Châu \| Chưa làm/);

  // Giáo viên khác (không phụ trách Lớp 1A): không thấy học sinh của lớp trong hoạt động, không giao đề cho lớp đó
  await owner.post('/api/admin/accounts', { username: 'minh', displayName: 'Thầy Minh', password: 'matkhau-minh' });
  const minh = createClient(base);
  await minh.login('minh', 'matkhau-minh');
  const minhAct = (await minh.get(`/api/admin/exams/${examId}/activity`)).body;
  assert.deepEqual([minhAct.classes.length, minhAct.others.length, minhAct.hiddenClasses], [0, 0, 1]);
  const k3 = (await owner.post('/api/admin/classes', { name: 'Lớp 3C' })).body.class;
  const bad = await lan.post(`/api/admin/exams/${examId}/assignment`, { classIds: [k1.id, k3.id] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /lớp mình phụ trách/);
  await close();
});
