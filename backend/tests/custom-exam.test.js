// Test đề tự thiết kế: soạn đề, kiểm tra, xáo trộn câu cho từng học viên, chấm thang 10, hướng dẫn từng bước.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeContent } = require('../src/exam/contentSchema');
const { gradeAttempt } = require('../src/exam/grading');
const { makeQuestionOrder } = require('../src/exam/content');
const { validateContent } = require('../src/exam/validate');
const { setup, createClient, testConfig } = require('./helpers');

const opts = (...texts) => Object.fromEntries(texts.map((t, i) => ['ABCDEF'[i], t]));

/** Đề mẫu: Phần 1 có 3 câu lẻ; Phần 2 có 1 nhóm đọc hiểu (3 câu) + 2 câu lẻ */
function sampleCustom({ shuffle = false } = {}) {
  return {
    examType: 'CUSTOM',
    shuffleQuestions: shuffle,
    parts: [{ name: 'Từ vựng', directions: 'Chọn đáp án đúng' }, { name: 'Đọc hiểu', directions: '' }],
    groups: [{ code: 'N1', part: 2, passage: 'Đoạn văn mẫu.' }],
    questions: [
      { part: 1, question: '2 + 2 = ?', options: opts('3', '4'), answer: 'B' },
      { part: 1, question: 'Thủ đô Việt Nam?', options: opts('Hà Nội', 'Huế', 'Đà Nẵng'), answer: 'A' },
      { part: 1, question: 'Chọn E', options: opts('a', 'b', 'c', 'd', 'e', 'f'), answer: 'E' },
      { part: 2, groupCode: 'N1', question: 'Ý chính?', options: opts('x', 'y', 'z', 'w'), answer: 'C' },
      { part: 2, groupCode: 'N1', question: 'Chi tiết 1?', options: opts('x', 'y', 'z', 'w'), answer: 'A' },
      { part: 2, groupCode: 'N1', question: 'Chi tiết 2?', options: opts('x', 'y', 'z', 'w'), answer: 'D' },
      { part: 2, question: 'Câu lẻ 1', options: opts('x', 'y'), answer: 'A' },
      { part: 2, question: 'Câu lẻ 2', options: opts('x', 'y'), answer: 'B' },
    ],
  };
}

test('Chuẩn hóa: đánh số lại 1..N, 2–6 lựa chọn, câu trong nhóm theo phần của nhóm, có id', () => {
  const raw = sampleCustom();
  raw.questions[0].options = opts('chỉ một'); // 1 lựa chọn -> thành 2
  raw.questions[3].part = 1; // câu trong nhóm N1 (phần 2) ghi nhầm phần 1
  raw.questions[6].answer = 'Z';
  const c = normalizeContent(raw);
  assert.deepEqual(c.questions.map((q) => q.no), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(Object.keys(c.questions[0].options), ['A', 'B']);
  assert.deepEqual(Object.keys(c.questions[2].options), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(c.questions[3].part, 2);
  assert.equal(c.questions[6].answer, null);
  assert.ok(c.questions.every((q) => /^[a-z0-9]+$/.test(q.id)));
  assert.equal(c.parts[0].name, 'Từ vựng');
  assert.throws(() => normalizeContent({ examType: 'CUSTOM', parts: [], groups: [], questions: [] }), /ít nhất một phần/);
});

test('Kiểm tra trước xuất bản: thiếu đáp án, lựa chọn trống, câu không có nội dung, nhóm không có đoạn văn', () => {
  const c = normalizeContent(sampleCustom());
  assert.deepEqual(validateContent(c).errors, []);
  c.questions[0].answer = null;
  c.questions[1].options.C = '';
  c.questions[6].question = '';
  c.groups[0].passage = '';
  const { errors } = validateContent(c);
  assert.ok(errors.includes('Question 1 chưa có đáp án.'));
  assert.ok(errors.includes('Question 2 chưa có nội dung lựa chọn C.'));
  assert.ok(errors.some((e) => e.startsWith('Question 7 chưa có nội dung')));
  assert.ok(errors.includes('Nhóm N1 chưa có đoạn văn (chữ, ảnh hoặc audio).'));
});

test('Xáo trộn: chỉ xáo trong từng phần, câu cùng nhóm luôn liền nhau theo thứ tự gốc', () => {
  const c = normalizeContent(sampleCustom({ shuffle: true }));
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const order = makeQuestionOrder(c);
    assert.deepEqual([...order].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(order.slice(0, 3).sort(), [1, 2, 3]); // phần 1 luôn đứng trước
    const g = order.indexOf(4);
    assert.deepEqual(order.slice(g, g + 3), [4, 5, 6]); // nhóm giữ nguyên
    seen.add(order.join(','));
  }
  assert.ok(seen.size > 3, 'thứ tự phải thay đổi giữa các lượt');
  assert.equal(makeQuestionOrder(normalizeContent(sampleCustom())), null); // không bật xáo trộn
});

test('Chấm điểm: số câu đúng, thang 10, từng phần; không có điểm TOEIC', () => {
  const c = normalizeContent(sampleCustom());
  const r = gradeAttempt(c, { 1: 'B', 2: 'A', 3: 'A', 4: 'C', 7: 'A' });
  assert.equal(r.correct, 4);
  assert.equal(r.total, 8);
  assert.equal(r.score10, 5);
  assert.deepEqual(r.parts.map((p) => [p.name, p.correct, p.total]), [['Từ vựng', 2, 3], ['Đọc hiểu', 2, 5]]);
  assert.equal(r.totalScore, null);
  assert.equal(r.readingScore, null);
  assert.equal(gradeAttempt(c, {}).score10, 0);
});

async function createCustomExam(owner, shuffle) {
  const id = (await owner.post('/api/admin/exams', { code: 'TU-CHON-1', title: 'Đề tự chọn', durationMinutes: 30, examType: 'CUSTOM' })).body.id;
  await owner.post(`/api/admin/exams/${id}/lock`);
  const d = (await owner.get(`/api/admin/exams/${id}`)).body;
  assert.equal(d.exam.examType, 'CUSTOM');
  assert.equal(d.content.parts.length, 1);
  const settings = {
    code: d.exam.code, title: d.exam.title, durationMinutes: 30, internalNote: '', allowSeekAudio: false, showAnswersAfter: true,
  };
  const saved = await owner.post(`/api/admin/exams/${id}/save`, { version: d.exam.version, settings, content: sampleCustom({ shuffle }) });
  assert.equal(saved.status, 200);
  const pub = await owner.post(`/api/admin/exams/${id}/publish`, { version: saved.body.version });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  return id;
}

test('Luồng đầy đủ: tạo đề tự thiết kế, xáo trộn cho học viên, nộp bài, kết quả thang 10', async () => {
  const { base, owner, close } = await (async () => {
    const ctx = await setup();
    const o = createClient(ctx.base);
    await o.login(testConfig.ownerUsername, testConfig.ownerPassword);
    return { ...ctx, owner: o };
  })();
  const examId = await createCustomExam(owner, true);

  // Excel mẫu TOEIC không dùng cho đề tự thiết kế
  const xl = await owner.upload(`/api/admin/exams/${examId}/import/preview`, 'file', [{ name: 'a.xlsx', data: Buffer.from('PK'), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
  assert.equal(xl.status, 400);

  const start = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastName: 'Lê', firstName: 'Na', phone: '0933000111', examId }),
  })).json();
  const view = await (await fetch(`${base}/api/attempts/${start.attemptId}`, { headers: { 'x-attempt-token': start.token } })).json();
  assert.equal(view.content.examType, 'CUSTOM');
  assert.deepEqual(view.content.parts.map((p) => p.name), ['Từ vựng', 'Đọc hiểu']);
  assert.deepEqual(view.content.questions.map((q) => q.displayNo), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(!JSON.stringify(view).includes('"answer"'));
  // Câu nhóm N1 liền nhau trong thứ tự học viên thấy
  const nos = view.content.questions.map((q) => q.no);
  const g = nos.indexOf(4);
  assert.deepEqual(nos.slice(g, g + 3), [4, 5, 6]);

  // Tải lại trang: vẫn đúng thứ tự cũ
  const again = await (await fetch(`${base}/api/attempts/${start.attemptId}`, { headers: { 'x-attempt-token': start.token } })).json();
  assert.deepEqual(again.content.questions.map((q) => q.no), nos);

  const sub = await (await fetch(`${base}/api/attempts/${start.attemptId}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-attempt-token': start.token },
    body: JSON.stringify({ answers: { 1: 'B', 2: 'A', 3: 'E', 4: 'C', 5: 'A', 6: 'D', 7: 'A', 8: 'A', 99: 'A' }, flagged: [] }),
  })).json();
  const r = sub.result;
  assert.equal(r.examType, 'CUSTOM');
  assert.deepEqual([r.correct, r.total, r.score10], [7, 8, 8.8]);
  assert.equal(r.totalScore, null);
  assert.deepEqual(r.details.map((d) => d.displayNo), [1, 2, 3, 4, 5, 6, 7, 8]); // theo thứ tự học viên đã thấy
  assert.deepEqual(r.details.map((d) => d.no), nos);

  // Admin: kết quả có số câu đúng + thang 10
  const list = (await owner.get('/api/admin/results')).body.items;
  const item = list.find((i) => i.id === start.attemptId);
  assert.deepEqual([item.correct, item.total, item.score10, item.exam.examType], [7, 8, 8.8, 'CUSTOM']);
  const detail = (await owner.get(`/api/admin/results/${start.attemptId}`)).body;
  assert.deepEqual(detail.result.parts.map((p) => [p.correct, p.total]), [[3, 3], [4, 5]]);
  await close();
});

test('Hướng dẫn từng bước: ghi nhớ đã xem cho từng admin', async () => {
  const { base, close } = await setup();
  const owner = createClient(base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  assert.deepEqual((await owner.get('/api/auth/me')).body.admin.toursDone, []);
  assert.deepEqual((await owner.post('/api/auth/tours/custom-builder')).body.toursDone, ['custom-builder']);
  assert.deepEqual((await owner.get('/api/auth/me')).body.admin.toursDone, ['custom-builder']);
  assert.equal((await owner.post('/api/auth/tours/TEN SAI')).status, 400);

  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' });
  const lan = createClient(base);
  await lan.login('lan', 'matkhau-lan');
  assert.deepEqual((await lan.get('/api/auth/me')).body.admin.toursDone, []); // mỗi admin riêng
  await close();
});
