// Test xóa đề: mọi admin, phải gõ lại mã đề, xóa sạch bài làm / file / học viên chỉ làm đề đó.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, createClient, testConfig } = require('./helpers');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);

async function setupWithData() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' });
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');

  const exams = (await owner.get('/api/admin/exams')).body.exams;
  const reading = exams.find((e) => e.code === 'READING-01').id;
  const mau2 = exams.find((e) => e.code === 'DE-MAU-2').id;

  // 2 học viên: Hòa chỉ làm Reading 1, Mai làm cả Reading 1 và Đề mẫu 2
  const start = (examId, phone) =>
    fetch(`${ctx.base}/api/attempts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Lê', firstName: phone.slice(-1), phone, examId }),
    }).then((r) => r.json());
  await start(reading, '0911000001');
  await start(reading, '0911000002');
  await start(mau2, '0911000002');

  // 1 file ảnh của đề Reading 1
  await owner.post(`/api/admin/exams/${reading}/lock`);
  const up = await owner.upload(`/api/admin/exams/${reading}/media`, 'files', [{ name: 'hinh.png', data: PNG, type: 'image/png' }]);
  const storedName = up.body.media[0].url.split('/').pop();
  await owner.post(`/api/admin/exams/${reading}/unlock`);
  return { ...ctx, owner, lan, reading, mau2, storedName };
}

test('Admin thường cũng xóa được đề; lịch sử ghi đúng người xóa', async () => {
  const { owner, lan, reading, close } = await setupWithData();
  const r = await lan.post(`/api/admin/exams/${reading}/delete`, { confirmCode: 'READING-01' });
  assert.equal(r.status, 200);
  const audit = (await owner.get('/api/admin/history/audit')).body.items;
  assert.equal(audit[0].action, 'delete_exam');
  assert.equal(audit[0].admin.displayName, 'Cô Lan');
  await close();
});

test('Phải gõ đúng mã đề; đề đang có người khác sửa thì không xóa được', async () => {
  const { owner, lan, reading, close } = await setupWithData();
  assert.equal((await owner.post(`/api/admin/exams/${reading}/delete`, { confirmCode: 'SAI' })).status, 400);
  await lan.post(`/api/admin/exams/${reading}/lock`);
  const locked = await owner.post(`/api/admin/exams/${reading}/delete`, { confirmCode: 'reading-01' });
  assert.equal(locked.status, 409);
  assert.match(locked.body.error, /Cô Lan đang chỉnh sửa/);
  await close();
});

test('Xóa đề: mất khỏi danh sách, xóa bài làm, file, học viên chỉ làm đề này; giữ lịch sử', async () => {
  const { base, db, owner, reading, storedName, close } = await setupWithData();
  const filePath = path.join(testConfig.dataDir, 'uploads', storedName);
  assert.ok(fs.existsSync(filePath));

  const r = await owner.post(`/api/admin/exams/${reading}/delete`, { confirmCode: 'reading-01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.attempts, 2);
  assert.equal(r.body.students, 1); // học viên ...01 chỉ làm đề này; ...02 còn bài Đề mẫu 2

  assert.equal((await owner.get(`/api/admin/exams/${reading}`)).status, 404);
  const studentList = (await (await fetch(`${base}/api/exams`)).json()).exams;
  assert.ok(!studentList.some((e) => e.id === reading));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exam_versions WHERE exam_id = ?').get(reading).n, 0);
  assert.deepEqual(db.prepare('SELECT phone FROM students ORDER BY phone').all().map((s) => s.phone), ['0911000002']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1);

  await new Promise((resolve) => setTimeout(resolve, 100)); // xóa file chạy nền
  assert.ok(!fs.existsSync(filePath), 'file ảnh phải bị xóa');

  const audit = (await owner.get('/api/admin/history/audit')).body.items;
  assert.equal(audit[0].action, 'delete_exam');
  assert.match(audit[0].detail, /READING-01.*2 lượt làm bài, 1 file/);
  assert.ok(audit.some((a) => a.action === 'upload_files' && a.detail.includes('[đề READING-01]')));
  await close();
});
