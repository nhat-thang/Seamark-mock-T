// Test quản lý đề: tạo đề, khóa chỉnh sửa, version (chống ghi đè), xuất bản, ngừng mở đề.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

// owner + 1 admin thường "lan", cả hai đã đăng nhập
async function setupTwoAdmins() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' });
  const lan = createClient(ctx.base);
  await lan.login('lan', 'matkhau-lan');
  return { ...ctx, owner, lan };
}

const SETTINGS = {
  code: 'TEST-01',
  title: 'Đề thử',
  durationMinutes: 60,
  internalNote: 'Ghi chú bí mật',
  allowSeekAudio: false,
  showAnswersAfter: true,
};

async function readingExam(client) {
  const list = (await client.get('/api/admin/exams')).body.exams;
  return list.find((e) => e.code === 'READING-01');
}

async function detail(client, id) {
  return (await client.get(`/api/admin/exams/${id}`)).body;
}

test('Chưa đăng nhập thì không dùng được API quản lý đề', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  assert.equal((await c.get('/api/admin/exams')).status, 401);
  assert.equal((await c.post('/api/admin/exams', SETTINGS)).status, 401);
  await close();
});

test('Tạo đề: mã đề viết hoa, không trùng; đề mới là bản nháp trống, học viên không thấy', async () => {
  const { base, lan, close } = await setupTwoAdmins();
  const created = await lan.post('/api/admin/exams', { ...SETTINGS, code: 'test-01' });
  assert.equal(created.status, 201);
  assert.equal((await lan.post('/api/admin/exams', SETTINGS)).status, 409);
  assert.equal((await lan.post('/api/admin/exams', { ...SETTINGS, code: 'có dấu' })).status, 400);

  const d = await detail(lan, created.body.id);
  assert.equal(d.exam.code, 'TEST-01');
  assert.equal(d.exam.status, 'draft');
  assert.equal(d.content.questions.length, 0);

  const students = (await (await fetch(`${base}/api/exams`)).json()).exams;
  assert.ok(!students.some((e) => e.code === 'TEST-01'));
  await close();
});

test('Khóa: người thứ hai thấy "đang chỉnh sửa", không lưu được; giành quyền thì người đầu mất quyền lưu', async () => {
  const { owner, lan, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);

  const a = await owner.post(`/api/admin/exams/${exam.id}/lock`);
  assert.equal(a.body.ok, true);
  assert.equal(a.body.lock.isMine, true);

  const b = await lan.post(`/api/admin/exams/${exam.id}/lock`);
  assert.equal(b.body.ok, false);
  assert.equal(b.body.lock.displayName, 'Thom Tran');
  assert.ok(b.body.lock.since);

  const { version } = (await detail(lan, exam.id)).exam;
  const lanSave = await lan.post(`/api/admin/exams/${exam.id}/save`, { version, settings: { ...SETTINGS, code: 'READING-01' } });
  assert.equal(lanSave.status, 409);
  assert.equal(lanSave.body.reason, 'lock');

  // Cô Lan giành quyền -> owner lưu bị từ chối, heartbeat báo mất khóa
  assert.equal((await lan.post(`/api/admin/exams/${exam.id}/takeover`)).body.lock.isMine, true);
  const ownerSave = await owner.post(`/api/admin/exams/${exam.id}/save`, { version, settings: { ...SETTINGS, code: 'READING-01' } });
  assert.equal(ownerSave.status, 409);
  assert.equal(ownerSave.body.reason, 'lock');
  assert.match(ownerSave.body.error, /Cô Lan/);
  assert.equal((await owner.post(`/api/admin/exams/${exam.id}/heartbeat`)).body.ok, false);

  const audit = (await owner.get('/api/admin/history/audit')).body.items;
  assert.equal(audit[0].action, 'takeover_lock');
  assert.match(audit[0].detail, /Thom Tran/);
  await close();
});

test('Khóa hết hạn (không heartbeat quá 2 phút) thì người khác sửa được', async () => {
  const { db, owner, lan, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);
  await owner.post(`/api/admin/exams/${exam.id}/lock`);
  db.prepare('UPDATE exams SET lock_expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), exam.id);
  assert.equal((await lan.post(`/api/admin/exams/${exam.id}/lock`)).body.ok, true);
  await close();
});

test('Version: lưu đúng version thì tăng version; gửi version cũ thì bị từ chối (không ghi đè âm thầm)', async () => {
  const { owner, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);
  await owner.post(`/api/admin/exams/${exam.id}/lock`);
  const v1 = (await detail(owner, exam.id)).exam.version;

  const s1 = await owner.post(`/api/admin/exams/${exam.id}/save`, { version: v1, settings: { ...SETTINGS, code: 'READING-01', title: 'Tên mới' } });
  assert.equal(s1.status, 200);
  assert.equal(s1.body.version, v1 + 1);

  const stale = await owner.post(`/api/admin/exams/${exam.id}/save`, { version: v1, settings: { ...SETTINGS, code: 'READING-01', title: 'Tên cũ đè lên' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.reason, 'version');
  assert.equal((await detail(owner, exam.id)).exam.title, 'Tên mới');
  await close();
});

test('Lưu: kiểm tra dữ liệu, không cho trùng mã đề với đề khác', async () => {
  const { owner, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);
  await owner.post(`/api/admin/exams/${exam.id}/lock`);
  const { version } = (await detail(owner, exam.id)).exam;
  const dup = await owner.post(`/api/admin/exams/${exam.id}/save`, { version, settings: { ...SETTINGS, code: 'DE-MAU-1' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.reason, 'code');
  const bad = await owner.post(`/api/admin/exams/${exam.id}/save`, { version, settings: { ...SETTINGS, code: 'READING-01', durationMinutes: 0 } });
  assert.equal(bad.status, 400);
  await close();
});

test('Sửa nháp không ảnh hưởng học viên cho tới khi xuất bản lại', async () => {
  const { base, owner, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);
  const studentTitles = async () => (await (await fetch(`${base}/api/exams`)).json()).exams.map((e) => e.title);

  await owner.post(`/api/admin/exams/${exam.id}/lock`);
  let { version } = (await detail(owner, exam.id)).exam;
  const saved = await owner.post(`/api/admin/exams/${exam.id}/save`, {
    version,
    settings: { ...SETTINGS, code: 'READING-01', title: 'Reading 1 (bản mới)', durationMinutes: 120 },
  });
  version = saved.body.version;

  assert.ok((await studentTitles()).includes('TOEIC Reading – Đề 1'));
  const d = await detail(owner, exam.id);
  assert.equal(d.hasUnpublishedChanges, true);

  const pub = await owner.post(`/api/admin/exams/${exam.id}/publish`, { version });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.versionNo, 2);
  assert.ok(pub.body.warnings.some((w) => w.includes('Listening')));

  const titles = await studentTitles();
  assert.ok(titles.includes('Reading 1 (bản mới)'));
  assert.ok(!titles.includes('TOEIC Reading – Đề 1'));
  const after = await detail(owner, exam.id);
  assert.equal(after.hasUnpublishedChanges, false);
  assert.deepEqual(after.versions.map((v) => v.versionNo), [2, 1]);

  // Ghi chú nội bộ không bao giờ lộ ra API học viên
  const raw = await (await fetch(`${base}/api/exams`)).text();
  assert.ok(!raw.includes('Ghi chú bí mật'));
  await close();
});

test('Học viên đang làm dở vẫn làm trên bản cũ sau khi xuất bản lại / ngừng mở đề', async () => {
  const { base, owner, close } = await setupTwoAdmins();
  const exam = await readingExam(owner);
  const start = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'Lê', firstName: 'Hoa', phone: '0912345678', examId: exam.id }),
  })).json();

  await owner.post(`/api/admin/exams/${exam.id}/lock`);
  const { version } = (await detail(owner, exam.id)).exam;
  await owner.post(`/api/admin/exams/${exam.id}/unpublish`, { version });

  const students = (await (await fetch(`${base}/api/exams`)).json()).exams;
  assert.ok(!students.some((e) => e.id === exam.id));

  const r = await (await fetch(`${base}/api/attempts/${start.attemptId}`, { headers: { 'x-attempt-token': start.token } })).json();
  assert.equal(r.status, 'in_progress');
  assert.equal(r.examTitle, 'TOEIC Reading – Đề 1');
  await close();
});

test('Đề trống không xuất bản được (422 kèm danh sách lỗi)', async () => {
  const { lan, close } = await setupTwoAdmins();
  const id = (await lan.post('/api/admin/exams', SETTINGS)).body.id;
  await lan.post(`/api/admin/exams/${id}/lock`);
  const { version } = (await detail(lan, id)).exam;
  const pub = await lan.post(`/api/admin/exams/${id}/publish`, { version });
  assert.equal(pub.status, 422);
  assert.ok(pub.body.errors.length > 0);
  await close();
});
