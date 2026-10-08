// Test bảo mật tổng hợp (mốc 8).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

// Mọi API admin (method, đường dẫn). Thêm API admin mới thì thêm vào đây.
const ADMIN_ROUTES = [
  ['GET', '/api/auth/me'],
  ['POST', '/api/auth/tours/custom-builder'],
  ['POST', '/api/auth/change-password'],
  ['GET', '/api/admin/accounts'],
  ['POST', '/api/admin/accounts'],
  ['POST', '/api/admin/accounts/1/disable'],
  ['POST', '/api/admin/accounts/1/enable'],
  ['POST', '/api/admin/accounts/1/reset-password'],
  ['GET', '/api/admin/history/audit'],
  ['GET', '/api/admin/history/logins'],
  ['GET', '/api/admin/exams'],
  ['POST', '/api/admin/exams'],
  ['GET', '/api/admin/exams/1'],
  ['GET', '/api/admin/exams/1/lock'],
  ['POST', '/api/admin/exams/1/lock'],
  ['POST', '/api/admin/exams/1/heartbeat'],
  ['POST', '/api/admin/exams/1/takeover'],
  ['POST', '/api/admin/exams/1/unlock'],
  ['POST', '/api/admin/exams/1/save'],
  ['GET', '/api/admin/exams/1/check'],
  ['POST', '/api/admin/exams/1/publish'],
  ['POST', '/api/admin/exams/1/unpublish'],
  ['POST', '/api/admin/exams/1/delete'],
  ['POST', '/api/admin/exams/1/import/preview'],
  ['POST', '/api/admin/exams/1/media'],
  ['POST', '/api/admin/exams/1/media/1/delete'],
  ['GET', '/api/admin/excel-template'],
  ['GET', '/api/admin/results'],
  ['GET', '/api/admin/templates'],
  ['POST', '/api/admin/templates/1/delete'],
  ['POST', '/api/admin/exams/1/template'],
  ['POST', '/api/admin/exams/1/template/remove'],
  ['GET', '/api/admin/results/export'],
  ['GET', '/api/admin/results/1'],
];

test('Mọi API admin đều từ chối khi chưa đăng nhập (401)', async () => {
  const { base, close } = await setup();
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await fetch(base + path, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      body: method === 'POST' ? '{}' : undefined,
    });
    assert.equal(res.status, 401, `${method} ${path} trả ${res.status}`);
  }
  await close();
});

test('Phiên đăng nhập giả / cookie sai bị từ chối', async () => {
  const { base, close } = await setup();
  const res = await fetch(`${base}/api/admin/exams`, { headers: { cookie: 'seamark_sid=gia-mao-123' } });
  assert.equal(res.status, 401);
  await close();
});

test('Có header bảo mật (helmet), không lộ "X-Powered-By: Express"', async () => {
  const { base, close } = await setup();
  const res = await fetch(`${base}/api/health`);
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-frame-options'));
  assert.equal(res.headers.get('x-powered-by'), null);
  await close();
});

test('API học viên không lộ SĐT, ghi chú nội bộ, đáp án khi đang làm', async () => {
  const { base, db, close } = await setup();
  db.prepare(`UPDATE exams SET internal_note = 'BI-MAT-NOI-BO'`).run();
  const exams = await (await fetch(`${base}/api/exams`)).text();
  assert.ok(!exams.includes('BI-MAT-NOI-BO'));
  const examId = JSON.parse(exams).exams[0].id;

  const s = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'A', firstName: 'B', phone: '0909090909', examId }),
  })).json();
  const view = await (await fetch(`${base}/api/attempts/${s.attemptId}`, { headers: { 'x-attempt-token': s.token } })).text();
  assert.ok(!view.includes('0909090909'), 'lộ SĐT');
  assert.ok(!view.includes('BI-MAT-NOI-BO'), 'lộ ghi chú nội bộ');
  assert.ok(!view.includes('"answer"'), 'lộ đáp án');
  await close();
});

test('Dữ liệu gửi lên quá lớn / sai định dạng: báo lỗi tiếng Việt, không lộ chi tiết lỗi', async () => {
  const { base, close } = await setup();
  const big = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(6 * 1024 * 1024) }),
  });
  assert.equal(big.status, 413);
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{hỏng' });
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.error, 'Dữ liệu gửi lên không hợp lệ.');
  assert.ok(!JSON.stringify(body).includes('SyntaxError'));
  await close();
});

test('Giới hạn bắt đầu làm bài: quá 120 lần / 10 phút từ một IP thì báo 429', async () => {
  const { base, close } = await setup();
  const examId = (await (await fetch(`${base}/api/exams`)).json()).exams[0].id;
  let last;
  for (let i = 0; i < 121; i++) {
    last = await fetch(`${base}/api/attempts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'A', firstName: 'B', phone: `09${String(i).padStart(8, '0')}`, examId }),
    });
  }
  assert.equal(last.status, 429);
  await close();
});

test('Admin thường không tự nâng mình thành admin chính được', async () => {
  const { base, db, close } = await setup();
  const owner = createClient(base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  // Gửi kèm role: 'owner' khi tạo tài khoản -> server bỏ qua
  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan', role: 'owner' });
  assert.equal(db.prepare(`SELECT role FROM admins WHERE username = 'lan'`).get().role, 'admin');
  await close();
});
