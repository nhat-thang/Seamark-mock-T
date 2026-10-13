// Test bài tập về nhà (homework): tạo đề, tên luôn có "Homework - " ở đầu, giáo viên ra đề,
// học viên thấy ở mục riêng, giáo viên xem điểm + câu sai.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

async function setupTeachers() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const lanId = (await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' })).body.account.id;
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');
  return { ...ctx, owner, lan, lanId };
}

const newHomework = (client, body) => client.post('/api/admin/exams', { category: 'homework', durationMinutes: 30, examType: 'CUSTOM', ...body });

test('Tạo homework: tên tự thêm "Homework - ", mã đề tự đặt HW-001…, ghi giáo viên ra đề', async () => {
  const { owner, lan, lanId, close } = await setupTeachers();

  const r1 = await newHomework(lan, { title: 'đề lớp 1a' });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.deepEqual([r1.body.code, r1.body.title], ['HW-001', 'Homework - đề lớp 1a']);
  // Lỡ gõ chữ "homework" ở đầu: không bị lặp
  const r2 = await newHomework(lan, { title: '  HOMEWORK -  Đề lớp 2B ' });
  assert.deepEqual([r2.body.code, r2.body.title], ['HW-002', 'Homework - Đề lớp 2B']);
  assert.equal((await newHomework(lan, { title: 'homework' })).status, 400);
  assert.equal((await newHomework(lan, { title: '' })).status, 400);

  // Admin chính tạo hộ, ghi giáo viên ra đề là Cô Lan
  const r3 = await newHomework(owner, { title: 'Ôn tập Unit 3', authorId: lanId, examType: 'TOEIC_LR' });
  assert.equal(r3.status, 201);
  const d = (await owner.get(`/api/admin/exams/${r3.body.id}`)).body.exam;
  assert.deepEqual([d.category, d.author, d.examType], ['homework', 'Cô Lan', 'TOEIC_LR']);
  assert.equal((await newHomework(owner, { title: 'X', authorId: 9999 })).status, 400);

  // Đề thi thử vẫn như cũ: bắt buộc mã đề, tên giữ nguyên
  assert.equal((await owner.post('/api/admin/exams', { title: 'Đề thường', durationMinutes: 30 })).status, 400);
  const normal = await owner.post('/api/admin/exams', { code: 'THU-01', title: 'Đề thường', durationMinutes: 30 });
  assert.equal(normal.body.title, 'Đề thường');

  const list = (await owner.get('/api/admin/exams')).body.exams;
  assert.equal(list.find((e) => e.code === 'THU-01').category, 'exam');
  assert.deepEqual(
    list.filter((e) => e.category === 'homework').map((e) => [e.code, e.author]).sort(),
    [['HW-001', 'Cô Lan'], ['HW-002', 'Cô Lan'], ['HW-003', 'Cô Lan']]
  );
  const log = (await owner.get('/api/admin/history/audit')).body.items.find((l) => l.exam?.code === 'HW-003');
  assert.match(log.detail, /Tạo bài tập về nhà .* giáo viên ra đề: Cô Lan/);
  await close();
});

test('Sửa tên homework: luôn giữ "Homework - " ở đầu, không cho để trống phần tên', async () => {
  const { lan, close } = await setupTeachers();
  const { id } = (await newHomework(lan, { title: 'Bài 1' })).body;
  await lan.post(`/api/admin/exams/${id}/lock`);
  const d = (await lan.get(`/api/admin/exams/${id}`)).body;
  const settings = { code: d.exam.code, title: 'Bài 1 (sửa)', durationMinutes: 30, internalNote: '', allowSeekAudio: false, showAnswersAfter: true };

  const ok = await lan.post(`/api/admin/exams/${id}/save`, { version: d.exam.version, settings });
  assert.equal(ok.status, 200);
  assert.equal((await lan.get(`/api/admin/exams/${id}`)).body.exam.title, 'Homework - Bài 1 (sửa)');

  const empty = await lan.post(`/api/admin/exams/${id}/save`, { version: ok.body.version, settings: { ...settings, title: 'Homework - ' } });
  assert.equal(empty.status, 400);
  await close();
});

test('Học viên: homework có loại + tên giáo viên; giáo viên xem điểm, câu sai, lọc theo homework / giáo viên', async () => {
  const { base, db, owner, lanId, close } = await setupTeachers();
  // Đề mẫu 2 (Part 5, câu 101–130, đã xuất bản) làm bài tập về nhà của Cô Lan
  db.prepare(`UPDATE exams SET category = 'homework', created_by = ? WHERE code = 'DE-MAU-2'`).run(lanId);

  const exams = (await (await fetch(`${base}/api/exams`)).json()).exams;
  const hw = exams.find((e) => e.code === 'DE-MAU-2');
  assert.deepEqual([hw.category, hw.teacherName], ['homework', 'Cô Lan']);
  const mock = exams.find((e) => e.code === 'DE-MAU-1');
  assert.deepEqual([mock.category, mock.teacherName], ['exam', null]);

  // Học viên làm bài: câu 101 đúng (B), 102 sai (chọn A, đáp án C), 103 đúng (D), còn lại bỏ trống
  const s = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'Nguyễn', firstName: 'An', phone: '0901234567', examId: hw.id }),
  })).json();
  await fetch(`${base}/api/attempts/${s.attemptId}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-attempt-token': s.token },
    body: JSON.stringify({ answers: { 101: 'B', 102: 'A', 103: 'D' }, flagged: [] }),
  });

  const r = (await owner.get('/api/admin/results?category=homework')).body;
  assert.equal(r.total, 1);
  const item = r.items[0];
  assert.deepEqual([item.student.lastName, item.student.firstName], ['Nguyễn', 'An']);
  assert.deepEqual([item.exam.category, item.exam.author], ['homework', 'Cô Lan']);
  assert.deepEqual(item.wrong, [102]);
  assert.equal(item.blank.length, 27);
  assert.equal(item.blank[0], 104);
  assert.equal(item.correct, 2);

  assert.equal((await owner.get(`/api/admin/results?authorId=${lanId}`)).body.total, 1);
  assert.equal((await owner.get('/api/admin/results?category=exam')).body.total, 0);
  const detail = (await owner.get(`/api/admin/results/${item.id}`)).body;
  assert.deepEqual(detail.attempt.wrong, [102]);
  await close();
});
