// Test đăng nhập, phân quyền admin chính / admin, quản lý tài khoản, lịch sử. Chạy: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

const OWNER = { username: testConfig.ownerUsername, password: testConfig.ownerPassword };

// Đăng nhập owner rồi tạo thêm 1 admin thường "lan"
async function setupWithAdmin() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(OWNER.username, OWNER.password);
  const created = await owner.post('/api/admin/accounts', {
    username: 'lan',
    displayName: 'Cô Lan',
    password: 'matkhau-lan',
  });
  assert.equal(created.status, 201);
  return { ...ctx, owner, lanId: created.body.account.id };
}

test('Đăng nhập đúng: trả thông tin admin, cookie httpOnly, không lộ password_hash', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  const res = await c.login('OWNER', OWNER.password); // tên đăng nhập không phân biệt hoa/thường
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.admin, { id: 1, username: 'owner', displayName: 'Thom Tran', role: 'owner' });
  assert.match(res.setCookie, /HttpOnly/i);
  assert.match(res.setCookie, /SameSite=Lax/i);

  const me = await c.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.admin.displayName, 'Thom Tran');
  assert.ok(!JSON.stringify(me.body).includes('password'));
  await close();
});

test('Đăng nhập sai: cùng một thông báo cho sai mật khẩu và sai tên', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  const a = await c.login('owner', 'sai-mat-khau');
  const b = await c.login('khong-ton-tai', 'sai-mat-khau');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
  await close();
});

test('Sai 5 lần thì bị chặn, kể cả khi nhập đúng mật khẩu ở lần 6', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  for (let i = 0; i < 5; i++) assert.equal((await c.login('owner', 'sai')).status, 401);
  const blocked = await c.login('owner', OWNER.password);
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /thử lại sau \d+ phút/);
  await close();
});

test('Đăng nhập đúng thì xóa đếm các lần sai trước đó', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  for (let i = 0; i < 4; i++) await c.login('owner', 'sai');
  assert.equal((await c.login('owner', OWNER.password)).status, 200);
  for (let i = 0; i < 4; i++) await c.login('owner', 'sai');
  assert.equal((await c.login('owner', OWNER.password)).status, 200);
  await close();
});

test('Chưa đăng nhập thì mọi API admin trả 401', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  for (const p of ['/api/auth/me', '/api/admin/accounts', '/api/admin/history/audit', '/api/admin/history/logins']) {
    assert.equal((await c.get(p)).status, 401, p);
  }
  await close();
});

test('Đăng xuất thì phiên mất hiệu lực', async () => {
  const { base, close } = await setup();
  const c = createClient(base);
  await c.login('owner', OWNER.password);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).status, 401);
  await close();
});

test('Owner tạo admin: kiểm tra dữ liệu và chống trùng tên đăng nhập', async () => {
  const { owner, close } = await setupWithAdmin();
  const dup = await owner.post('/api/admin/accounts', { username: 'LAN', displayName: 'X', password: '12345678' });
  assert.equal(dup.status, 409);
  const shortPw = await owner.post('/api/admin/accounts', { username: 'hoa', displayName: 'Cô Hoa', password: '123' });
  assert.equal(shortPw.status, 400);
  const badName = await owner.post('/api/admin/accounts', { username: 'cô hoa', displayName: 'Cô Hoa', password: '12345678' });
  assert.equal(badName.status, 400);

  const list = await owner.get('/api/admin/accounts');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.accounts.map((a) => a.username), ['owner', 'lan']);
  assert.ok(!JSON.stringify(list.body).includes('password_hash'));
  await close();
});

test('Admin thường đăng nhập được nhưng không dùng được chức năng của admin chính (403)', async () => {
  const { base, close, lanId } = await setupWithAdmin();
  const lan = createClient(base);
  assert.equal((await lan.login('lan', 'matkhau-lan')).status, 200);
  assert.equal((await lan.get('/api/admin/accounts')).status, 403);
  assert.equal((await lan.post('/api/admin/accounts', { username: 'x1', displayName: 'X', password: '12345678' })).status, 403);
  assert.equal((await lan.post(`/api/admin/accounts/1/disable`)).status, 403);
  assert.equal((await lan.post(`/api/admin/accounts/${lanId}/reset-password`, { newPassword: '12345678' })).status, 403);
  assert.equal((await lan.get('/api/admin/history/audit')).status, 403);
  assert.equal((await lan.get('/api/admin/history/logins')).status, 403);
  await close();
});

test('Vô hiệu hóa: người đó bị đăng xuất ngay và không đăng nhập lại được; mở lại thì đăng nhập được', async () => {
  const { base, owner, lanId, close } = await setupWithAdmin();
  const lan = createClient(base);
  await lan.login('lan', 'matkhau-lan');

  assert.equal((await owner.post(`/api/admin/accounts/${lanId}/disable`)).status, 200);
  assert.equal((await lan.get('/api/auth/me')).status, 401);
  const relogin = await lan.login('lan', 'matkhau-lan');
  assert.equal(relogin.status, 403);
  assert.match(relogin.body.error, /vô hiệu hóa/);

  assert.equal((await owner.post(`/api/admin/accounts/${lanId}/enable`)).status, 200);
  assert.equal((await lan.login('lan', 'matkhau-lan')).status, 200);
  await close();
});

test('Owner không tự vô hiệu hóa hay tự đặt lại mật khẩu của chính mình', async () => {
  const { owner, close } = await setupWithAdmin();
  assert.equal((await owner.post('/api/admin/accounts/1/disable')).status, 400);
  assert.equal((await owner.post('/api/admin/accounts/1/reset-password', { newPassword: '12345678' })).status, 400);
  await close();
});

test('Owner đặt lại mật khẩu: mật khẩu cũ hết tác dụng, phiên cũ bị đăng xuất', async () => {
  const { base, owner, lanId, close } = await setupWithAdmin();
  const lan = createClient(base);
  await lan.login('lan', 'matkhau-lan');
  assert.equal((await owner.post(`/api/admin/accounts/${lanId}/reset-password`, { newPassword: 'mat-khau-moi' })).status, 200);
  assert.equal((await lan.get('/api/auth/me')).status, 401);
  assert.equal((await lan.login('lan', 'matkhau-lan')).status, 401);
  assert.equal((await lan.login('lan', 'mat-khau-moi')).status, 200);
  await close();
});

test('Tự đổi mật khẩu: phải nhập đúng mật khẩu hiện tại; đổi xong phiên hiện tại vẫn dùng được', async () => {
  const { base, close } = await setupWithAdmin();
  const lan = createClient(base);
  const lanOther = createClient(base); // cùng tài khoản, đăng nhập ở máy khác
  await lan.login('lan', 'matkhau-lan');
  await lanOther.login('lan', 'matkhau-lan');

  const wrong = await lan.post('/api/auth/change-password', { currentPassword: 'sai', newPassword: 'abcdefgh' });
  assert.equal(wrong.status, 400);
  const ok = await lan.post('/api/auth/change-password', { currentPassword: 'matkhau-lan', newPassword: 'abcdefgh' });
  assert.equal(ok.status, 200);
  assert.equal((await lan.get('/api/auth/me')).status, 200);
  assert.equal((await lanOther.get('/api/auth/me')).status, 401);
  assert.equal((await createClient(base).login('lan', 'abcdefgh')).status, 200);
  await close();
});

test('Lịch sử chỉnh sửa và lịch sử đăng nhập ghi đúng', async () => {
  const { base, owner, lanId, close } = await setupWithAdmin();
  await createClient(base).login('lan', 'sai-mat-khau');
  await owner.post(`/api/admin/accounts/${lanId}/disable`);

  const audit = await owner.get('/api/admin/history/audit');
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.body.items.map((i) => i.action), ['disable_admin', 'create_admin']);
  assert.equal(audit.body.items[0].admin.displayName, 'Thom Tran');

  const logins = await owner.get('/api/admin/history/logins');
  assert.deepEqual(
    logins.body.items.map((i) => [i.username, i.success, i.reason]),
    [['lan', false, 'wrong_password'], ['owner', true, 'ok']]
  );
  const onlyFail = await owner.get('/api/admin/history/logins?result=fail');
  assert.equal(onlyFail.body.total, 1);
  await close();
});

test('Request thay đổi dữ liệu không phải JSON bị từ chối (chống giả mạo request)', async () => {
  const { base, close } = await setup();
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'username=owner&password=mat-khau-owner',
  });
  assert.equal(res.status, 415);
  await close();
});
