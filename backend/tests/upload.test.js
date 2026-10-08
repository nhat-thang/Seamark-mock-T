// Test API mốc 4: import Excel (xem trước + áp dụng), lưu nội dung, upload ảnh/audio, phục vụ file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');
const { buildWorkbook } = require('./excelFixture');
const reading01 = require('../src/seed-data/reading-01');

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// PNG nhỏ nhất hợp lệ (8 byte chữ ký + dữ liệu giả là đủ cho kiểm tra chữ ký)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(60, 0)]);

async function setupExam() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const id = (await owner.post('/api/admin/exams', { code: 'NEW-01', title: 'Đề mới', durationMinutes: 120 })).body.id;
  await owner.post(`/api/admin/exams/${id}/lock`);
  const detail = async () => (await owner.get(`/api/admin/exams/${id}`)).body;
  return { ...ctx, owner, id, detail };
}

const settingsOf = (exam) => ({
  code: exam.code, title: exam.title, durationMinutes: exam.durationMinutes, internalNote: exam.internalNote,
  allowSeekAudio: exam.allowSeekAudio, showAnswersAfter: exam.showAnswersAfter,
});

test('Import Excel: xem trước không ghi gì; áp dụng thì bản nháp có đủ 100 câu và lịch sử ghi "Import"', async () => {
  const { owner, id, detail, close } = await setupExam();
  const buf = await buildWorkbook(reading01.content, { code: 'NEW-01', title: 'Reading từ Excel', duration: 150 });

  const preview = await owner.upload(`/api/admin/exams/${id}/import/preview`, 'file', [{ name: 'de-reading.xlsx', data: buf, type: XLSX }]);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.errors, []);
  assert.equal(preview.body.content.questions.length, 100);
  assert.deepEqual(preview.body.publishIssues, []);
  assert.ok(preview.body.warnings.includes('Đề chưa có phần Listening (câu 1–100).'));
  assert.equal((await detail()).content.questions.length, 0); // chưa áp dụng thì chưa ghi

  // Áp dụng = lưu nội dung + thông tin đề từ file
  const d = await detail();
  const saved = await owner.post(`/api/admin/exams/${id}/save`, {
    version: d.exam.version,
    settings: { ...settingsOf(d.exam), ...preview.body.settings },
    content: preview.body.content,
    source: 'import',
    sourceName: preview.body.fileName,
  });
  assert.equal(saved.status, 200);
  const after = await detail();
  assert.equal(after.content.questions.length, 100);
  assert.equal(after.exam.title, 'Reading từ Excel');
  assert.equal(after.exam.durationMinutes, 150);

  const audit = (await owner.get('/api/admin/history/audit')).body.items;
  assert.equal(audit[0].action, 'import_excel');
  assert.match(audit[0].detail, /de-reading\.xlsx.*100 câu, 19 nhóm/);
  await close();
});

test('Import file lỗi: trả danh sách lỗi; file không phải Excel bị từ chối', async () => {
  const { owner, id, close } = await setupExam();
  const c = JSON.parse(JSON.stringify(reading01.content));
  c.questions[0].answer = 'X';
  const bad = await owner.upload(`/api/admin/exams/${id}/import/preview`, 'file', [{ name: 'loi.xlsx', data: await buildWorkbook(c), type: XLSX }]);
  assert.equal(bad.status, 200);
  assert.equal(bad.body.errors.length, 1);

  const notExcel = await owner.upload(`/api/admin/exams/${id}/import/preview`, 'file', [{ name: 'gia.xlsx', data: Buffer.from('hello'), type: XLSX }]);
  assert.equal(notExcel.status, 400);
  const wrongType = await owner.upload(`/api/admin/exams/${id}/import/preview`, 'file', [{ name: 'a.exe', data: Buffer.from('MZ'), type: 'application/x-msdownload' }]);
  assert.equal(wrongType.status, 400);
  await close();
});

test('Lưu nội dung: chuẩn hóa dữ liệu (bỏ trường lạ, đáp án sai thành trống, sắp xếp theo số câu)', async () => {
  const { owner, id, detail, close } = await setupExam();
  const d = await detail();
  const content = {
    groups: [],
    questions: [
      { no: 102, part: 5, question: 'Q2', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'Z', hack: '<script>' },
      { no: 101, part: 5, question: 'Q1', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'b' },
    ],
  };
  const r = await owner.post(`/api/admin/exams/${id}/save`, { version: d.exam.version, settings: settingsOf(d.exam), content, source: 'answers' });
  assert.equal(r.status, 200);
  const saved = (await detail()).content.questions;
  assert.deepEqual(saved.map((q) => [q.no, q.answer]), [[101, 'B'], [102, null]]);
  assert.ok(!('hack' in saved[1]));

  const bad = await owner.post(`/api/admin/exams/${id}/save`, { version: r.body.version, settings: settingsOf(d.exam), content: { questions: 'x' } });
  assert.equal(bad.status, 400);
  await close();
});

test('Upload ảnh/audio: kiểm tra đuôi + MIME + nội dung; trùng tên thì thay file; phục vụ qua /api/files', async () => {
  const { base, owner, id, close } = await setupExam();
  const up = await owner.upload(`/api/admin/exams/${id}/media`, 'files', [
    { name: 'q1.png', data: PNG, type: 'image/png' },
    { name: 'listening.mp3', data: MP3, type: 'audio/mpeg' },
    { name: 'gia-mao.png', data: Buffer.from('<html>not an image</html>'), type: 'image/png' },
  ]);
  assert.equal(up.status, 200);
  assert.deepEqual(up.body.accepted, ['q1.png', 'listening.mp3']);
  assert.equal(up.body.rejected.length, 1);
  assert.equal(up.body.media.length, 2);

  // Tải file về đúng loại
  const png = up.body.media.find((m) => m.name === 'q1.png');
  const res = await fetch(base + png.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');

  // Không đọc được file ngoài thư mục upload / tên bịa
  assert.equal((await fetch(`${base}/api/files/..%2F..%2Fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/api/files/${'a'.repeat(32)}.png`)).status, 404);

  // Đuôi không cho phép
  const exe = await owner.upload(`/api/admin/exams/${id}/media`, 'files', [{ name: 'virus.exe', data: Buffer.from('MZ'), type: 'application/octet-stream' }]);
  assert.equal(exe.status, 400);

  // Trùng tên (khác hoa thường) -> thay file cũ, vẫn chỉ 2 file
  const again = await owner.upload(`/api/admin/exams/${id}/media`, 'files', [{ name: 'Q1.PNG', data: PNG, type: 'image/png' }]);
  assert.equal(again.body.media.length, 2);
  await close();
});

test('Upload / xóa file phải giữ quyền chỉnh sửa; xóa file thì bản đã xuất bản vẫn tải được file', async () => {
  const { base, owner, id, detail, close } = await setupExam();
  // Đề 1 câu Part 5 có ảnh
  const d = await detail();
  const content = {
    groups: [],
    questions: [{ no: 101, part: 5, question: 'Q', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'A', image: 'hinh.png' }],
  };
  let version = (await owner.post(`/api/admin/exams/${id}/save`, { version: d.exam.version, settings: settingsOf(d.exam), content })).body.version;

  // Chưa tải ảnh -> không xuất bản được
  const fail = await owner.post(`/api/admin/exams/${id}/publish`, { version });
  assert.equal(fail.status, 422);
  assert.ok(fail.body.errors.some((e) => e.includes('"hinh.png"')));

  const up = await owner.upload(`/api/admin/exams/${id}/media`, 'files', [{ name: 'hinh.png', data: PNG, type: 'image/png' }]);
  assert.equal((await owner.post(`/api/admin/exams/${id}/publish`, { version })).status, 200);

  // Học viên nhận đường dẫn ảnh, không nhận tên file gốc
  const start = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'A', firstName: 'B', phone: '0900000001', examId: id }),
  })).json();
  const view = await (await fetch(`${base}/api/attempts/${start.attemptId}`, { headers: { 'x-attempt-token': start.token } })).json();
  const imgUrl = view.content.questions[0].image;
  assert.match(imgUrl, /^\/api\/files\/[a-f0-9]{32}\.png$/);

  // Người khác (không giữ khóa) không upload / xóa được
  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' });
  const lan = createClient(base);
  await lan.login('lan', 'matkhau-lan');
  assert.equal((await lan.upload(`/api/admin/exams/${id}/media`, 'files', [{ name: 'x.png', data: PNG, type: 'image/png' }])).status, 409);
  const mediaId = up.body.media[0].id;
  assert.equal((await lan.post(`/api/admin/exams/${id}/media/${mediaId}/delete`)).status, 409);

  // Owner xóa file khỏi bản nháp -> bản đã xuất bản vẫn tải được ảnh
  assert.equal((await owner.post(`/api/admin/exams/${id}/media/${mediaId}/delete`)).body.media.length, 0);
  assert.equal((await fetch(base + imgUrl)).status, 200);
  version = (await detail()).exam.version;
  assert.equal((await owner.post(`/api/admin/exams/${id}/publish`, { version })).status, 422);
  await close();
});

test('Upload từ trang web khác (Origin lạ) bị chặn', async () => {
  const { base, owner, id, close } = await setupExam();
  const form = new FormData();
  form.append('files', new Blob([PNG], { type: 'image/png' }), 'a.png');
  const cookie = (await owner.login(testConfig.ownerUsername, testConfig.ownerPassword)).setCookie.split(';')[0];
  const res = await fetch(`${base}/api/admin/exams/${id}/media`, { method: 'POST', headers: { cookie, origin: 'https://evil.example' }, body: form });
  assert.equal(res.status, 403);
  await close();
});
