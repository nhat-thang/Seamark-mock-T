// Hàm dùng chung cho các file test: tạo database trong bộ nhớ + mở server ở cổng ngẫu nhiên.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('../src/db');
const { runMigrations } = require('../src/db/migrate');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

const testConfig = {
  isProduction: false,
  sessionSecret: 'bi-mat-chi-dung-khi-test',
  ownerUsername: 'owner',
  ownerPassword: 'mat-khau-owner',
  ownerDisplayName: 'Thom Tran',
  // Thư mục tạm cho file upload khi test (tự xóa khi kết thúc)
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'toeic-test-')),
  maxUploadMb: 5,
};
process.on('exit', () => fs.rmSync(testConfig.dataDir, { recursive: true, force: true }));

async function setup({ withSeed = true } = {}) {
  const db = openDb(':memory:');
  runMigrations(db, { log: () => {} });
  if (withSeed) seed(db, testConfig, () => {});
  const app = createApp({ db, config: testConfig });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  // Test thất bại giữa chừng (không kịp gọi close) thì server này cũng không giữ tiến trình test lại -> không bị treo
  server.unref();
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((r) => server.close(() => { db.close(); r(); }));
  return { db, base, close };
}

/**
 * Một "trình duyệt" đơn giản: tự giữ cookie giữa các request.
 * client.post('/api/auth/login', {...}) -> { status, body }
 */
function createClient(base) {
  let cookie = '';
  async function request(method, urlPath, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
    const res = await fetch(base + urlPath, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* không phải JSON */ }
    return { status: res.status, body: data, setCookie };
  }
  return {
    get: (path) => request('GET', path),
    post: (urlPath, body = {}) => request('POST', urlPath, body),
    /** Gửi file: files = [{ name, data: Buffer, type }] */
    upload: (urlPath, field, files) => {
      const form = new FormData();
      for (const f of files) form.append(field, new Blob([f.data], { type: f.type }), f.name);
      return request('POST', urlPath, form);
    },
    login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  };
}

module.exports = { testConfig, setup, createClient };
