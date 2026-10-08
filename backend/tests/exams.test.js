// Test migration, seed và API GET /api/exams. Chạy: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openDb } = require('../src/db');
const { runMigrations } = require('../src/db/migrate');
const { seed } = require('../src/seed');
const { testConfig, setup } = require('./helpers');

test('migration chạy lại lần 2 không lỗi và không chạy trùng', () => {
  const db = openDb(':memory:');
  runMigrations(db, { log: () => {} });
  runMigrations(db, { log: () => {} });
  const count = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
  const files = fs.readdirSync(path.join(__dirname, '..', 'src', 'db', 'migrations')).filter((f) => f.endsWith('.sql'));
  assert.equal(count, files.length);
  db.close();
});

test('seed chạy 2 lần không tạo trùng owner và đề', () => {
  const db = openDb(':memory:');
  runMigrations(db, { log: () => {} });
  seed(db, testConfig, () => {});
  seed(db, testConfig, () => {});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exams').get().n, 3);
  const owner = db.prepare('SELECT role, display_name, password_hash FROM admins').get();
  assert.equal(owner.role, 'owner');
  assert.equal(owner.display_name, 'Thom Tran');
  assert.notEqual(owner.password_hash, testConfig.ownerPassword); // mật khẩu phải được mã hóa
  db.close();
});

test('GET /api/exams trả danh sách rỗng khi chưa có đề', async () => {
  const { base, close } = await setup({ withSeed: false });
  const res = await fetch(`${base}/api/exams`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { exams: [] });
  await close();
});

test('GET /api/exams trả các đề đã xuất bản, không lộ ghi chú nội bộ và nội dung đề', async () => {
  const { base, close } = await setup();
  const body = await (await fetch(`${base}/api/exams`)).json();
  assert.equal(body.exams.length, 3);
  const de1 = body.exams.find((e) => e.title === 'Đề mẫu 1');
  const de2 = body.exams.find((e) => e.title === 'Đề mẫu 2');
  assert.equal(de1.title, 'Đề mẫu 1');
  assert.equal(de1.questionCount, 200);
  assert.equal(de1.durationMinutes, 120);
  assert.equal(de2.title, 'Đề mẫu 2');
  assert.equal(de2.questionCount, 30);
  // Bảo mật: chỉ có đúng các trường công khai
  for (const ex of body.exams) {
    assert.deepEqual(Object.keys(ex).sort(), ['code', 'durationMinutes', 'id', 'questionCount', 'title']);
  }
  await close();
});

test('GET /api/exams không trả đề nháp', async () => {
  const { db, base, close } = await setup();
  db.prepare("UPDATE exams SET status = 'draft' WHERE code = 'DE-MAU-2'").run();
  const body = await (await fetch(`${base}/api/exams`)).json();
  assert.ok(!body.exams.some((e) => e.title === 'Đề mẫu 2'));
  assert.equal(body.exams.length, 2);
  await close();
});

test('Đường dẫn /api không tồn tại trả 404 kèm thông báo tiếng Việt', async () => {
  const { base, close } = await setup({ withSeed: false });
  const res = await fetch(`${base}/api/khong-co`);
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /Không tìm thấy/);
  await close();
});
