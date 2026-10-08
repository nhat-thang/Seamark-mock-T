// Test khung mẫu đề: lưu cấu trúc đề tự thiết kế, tạo đề mới từ khung, cập nhật / bỏ / xóa khung.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, createClient, testConfig } = require('./helpers');

const opts = (n) => Object.fromEntries('ABCDEF'.slice(0, n).split('').map((l) => [l, `nội dung ${l}`]));

async function setupWithCustomExam() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const id = (await owner.post('/api/admin/exams', { code: 'GOC-01', title: 'Đề gốc', durationMinutes: 35, examType: 'CUSTOM' })).body.id;
  await owner.post(`/api/admin/exams/${id}/lock`);
  const d = (await owner.get(`/api/admin/exams/${id}`)).body;
  const settings = { code: 'GOC-01', title: 'Đề gốc', durationMinutes: 35, internalNote: '', allowSeekAudio: false, showAnswersAfter: true };
  const content = {
    examType: 'CUSTOM',
    shuffleQuestions: true,
    parts: [{ name: 'Part 1 – Vocabulary', directions: 'Chọn đáp án đúng' }, { name: 'Part 2 – Reading', directions: '' }],
    groups: [{ code: 'N1', part: 2, passage: 'Đoạn văn bí mật' }],
    questions: [
      { part: 1, question: 'Q1 bí mật', options: opts(2), answer: 'A', explanation: 'giải thích' },
      { part: 1, question: 'Q2', options: opts(6), answer: 'F' },
      { part: 2, groupCode: 'N1', question: 'Q3', options: opts(4), answer: 'C' },
    ],
  };
  await owner.post(`/api/admin/exams/${id}/save`, { version: d.exam.version, settings, content });
  return { ...ctx, owner, id };
}

test('Lưu khung mẫu: chỉ giữ cấu trúc; tạo đề mới từ khung ra đề trống đúng cấu trúc', async () => {
  const { owner, id, close } = await setupWithCustomExam();
  const saved = await owner.post(`/api/admin/exams/${id}/template`, { name: 'Bài kiểm tra 15 phút' });
  assert.equal(saved.status, 200);
  assert.equal((await owner.get(`/api/admin/exams/${id}`)).body.template.name, 'Bài kiểm tra 15 phút');

  const list = (await owner.get('/api/admin/templates')).body.templates;
  assert.deepEqual(list.map((t) => [t.name, t.partCount, t.questionCount, t.durationMinutes]), [['Bài kiểm tra 15 phút', 2, 3, 35]]);

  const created = await owner.post('/api/admin/exams', { code: 'TU-KHUNG-1', title: 'Đề từ khung', durationMinutes: 35, templateId: list[0].id });
  assert.equal(created.status, 201);
  const d = (await owner.get(`/api/admin/exams/${created.body.id}`)).body;
  assert.equal(d.exam.examType, 'CUSTOM');
  const c = d.content;
  assert.deepEqual(c.parts.map((p) => [p.name, p.directions]), [['Part 1 – Vocabulary', 'Chọn đáp án đúng'], ['Part 2 – Reading', '']]);
  assert.equal(c.shuffleQuestions, true);
  assert.deepEqual(c.questions.map((q) => [q.no, q.part, q.groupCode, Object.keys(q.options).length]), [[1, 1, null, 2], [2, 1, null, 6], [3, 2, 'N1', 4]]);
  // Không chép nội dung / đáp án / đoạn văn
  assert.ok(c.questions.every((q) => q.question === '' && q.answer === null && q.explanation === ''));
  assert.ok(c.questions.every((q) => Object.values(q.options).every((t) => t === '')));
  assert.equal(c.groups[0].passage, '');
  assert.ok(!JSON.stringify(d).includes('bí mật'));
  await close();
});

test('Cập nhật khung từ đề gốc, không trùng tên, đề TOEIC không làm khung được', async () => {
  const { owner, id, close } = await setupWithCustomExam();
  await owner.post(`/api/admin/exams/${id}/template`, { name: 'Khung A' });
  const again = await owner.post(`/api/admin/exams/${id}/template`, { name: 'Khung A (sửa)' });
  assert.equal(again.status, 200);
  assert.deepEqual((await owner.get('/api/admin/templates')).body.templates.map((t) => t.name), ['Khung A (sửa)']);

  const other = (await owner.post('/api/admin/exams', { code: 'GOC-02', title: 'Đề 2', durationMinutes: 10, examType: 'CUSTOM' })).body.id;
  assert.equal((await owner.post(`/api/admin/exams/${other}/template`, { name: 'khung a (SỬA)' })).status, 409);
  const toeic = (await owner.get('/api/admin/exams')).body.exams.find((e) => e.code === 'READING-01').id;
  assert.equal((await owner.post(`/api/admin/exams/${toeic}/template`, { name: 'X' })).status, 400);
  assert.equal((await owner.post(`/api/admin/exams/${id}/template`, { name: '' })).status, 400);
  await close();
});

test('Bỏ khung, xóa khung, xóa đề gốc thì khung vẫn còn; lịch sử ghi đủ', async () => {
  const { owner, id, close } = await setupWithCustomExam();
  await owner.post(`/api/admin/exams/${id}/template`, { name: 'Khung B' });
  await owner.post(`/api/admin/exams/${id}/template/remove`);
  assert.equal((await owner.get('/api/admin/templates')).body.templates.length, 0);

  await owner.post(`/api/admin/exams/${id}/template`, { name: 'Khung C' });
  await owner.post(`/api/admin/exams/${id}/unlock`);
  assert.equal((await owner.post(`/api/admin/exams/${id}/delete`, { confirmCode: 'GOC-01' })).status, 200);
  const list = (await owner.get('/api/admin/templates')).body.templates;
  assert.deepEqual(list.map((t) => [t.name, t.sourceExamId]), [['Khung C', null]]);

  assert.equal((await owner.post(`/api/admin/templates/${list[0].id}/delete`)).status, 200);
  assert.equal((await owner.get('/api/admin/templates')).body.templates.length, 0);
  const actions = (await owner.get('/api/admin/history/audit')).body.items.map((i) => i.action);
  assert.ok(actions.includes('save_template') && actions.includes('delete_template'));
  await close();
});
