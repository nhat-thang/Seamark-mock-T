// Test API học viên làm bài: bắt đầu, lưu, tiếp tục, nộp, hết giờ.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { finalizeExpiredAttempts } = require('../src/exam/attempts');

const STUDENT = { lastName: 'Nguyễn Văn', firstName: 'An', phone: '0901234567' };

async function call(base, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers['x-attempt-token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function readingExamId(base) {
  const list = (await call(base, 'GET', '/api/exams')).body.exams;
  return list.find((e) => e.title === 'TOEIC Reading – Đề 1').id;
}

async function start(base, examId, student = STUDENT) {
  const r = await call(base, 'POST', '/api/attempts', { body: { ...student, examId } });
  assert.equal(r.status, 201);
  return r.body;
}

// Đẩy giờ hết hạn của lượt làm bài về quá khứ (giả lập hết giờ)
function expire(db, attemptId) {
  db.prepare('UPDATE attempts SET deadline_at = ? WHERE id = ?').run(new Date(Date.now() - 60_000).toISOString(), attemptId);
}

test('Danh sách đề có đề Reading 1: 100 câu, 180 phút', async () => {
  const { base, close } = await setup();
  const list = (await call(base, 'GET', '/api/exams')).body.exams;
  const ex = list.find((e) => e.title === 'TOEIC Reading – Đề 1');
  assert.equal(ex.questionCount, 100);
  assert.equal(ex.durationMinutes, 180);
  await close();
});

test('Bắt đầu làm bài: kiểm tra SĐT, hạn nộp = 180 phút, KHÔNG gửi đáp án xuống trình duyệt', async () => {
  const { base, close } = await setup();
  const examId = await readingExamId(base);

  const bad = await call(base, 'POST', '/api/attempts', { body: { ...STUDENT, phone: '123', examId } });
  assert.equal(bad.status, 400);

  const { attemptId, token } = await start(base, examId);
  const r = await call(base, 'GET', `/api/attempts/${attemptId}`, { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'in_progress');
  const minutes = (Date.parse(r.body.deadlineAt) - Date.parse(r.body.serverNow)) / 60000;
  assert.ok(minutes > 179.9 && minutes <= 180, `còn ${minutes} phút`);
  const raw = JSON.stringify(r.body);
  assert.ok(!raw.includes('"answer"'), 'lộ đáp án');
  assert.ok(!raw.includes('"explanation"'), 'lộ giải thích');
  assert.ok(!raw.includes('internal'), 'lộ ghi chú nội bộ');
  assert.equal(r.body.content.questions.length, 100);
  await close();
});

test('Không có mã (token) hoặc sai mã thì không xem / lưu được bài người khác', async () => {
  const { base, close } = await setup();
  const { attemptId } = await start(base, await readingExamId(base));
  assert.equal((await call(base, 'GET', `/api/attempts/${attemptId}`)).status, 404);
  assert.equal((await call(base, 'GET', `/api/attempts/${attemptId}`, { token: 'sai' })).status, 404);
  assert.equal((await call(base, 'POST', `/api/attempts/${attemptId}/save`, { token: 'sai', body: { answers: {} } })).status, 404);
  await close();
});

test('Lưu bài + tải lại: câu trả lời và câu đánh dấu được giữ; vào lại cùng SĐT thì tiếp tục lượt cũ', async () => {
  const { base, db, close } = await setup();
  const examId = await readingExamId(base);
  const first = await start(base, examId);
  const save = await call(base, 'POST', `/api/attempts/${first.attemptId}/save`, {
    token: first.token,
    body: { answers: { 101: 'D', 102: 'A', 999: 'A', 103: 'Z' }, flagged: [102, 500] },
  });
  assert.equal(save.status, 200);

  // Cùng SĐT, đổi tên -> cùng học viên, cùng lượt làm bài, họ tên cập nhật
  const again = await start(base, examId, { ...STUDENT, lastName: 'Nguyễn', firstName: 'Bình' });
  assert.equal(again.attemptId, first.attemptId);
  assert.equal(again.resumed, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 1);

  const r = await call(base, 'GET', `/api/attempts/${first.attemptId}`, { token: again.token });
  assert.deepEqual(r.body.answers, { 101: 'D', 102: 'A' });
  assert.deepEqual(r.body.flagged, [102]);
  assert.equal(r.body.student.firstName, 'Bình');
  await close();
});

test('Nộp bài: chấm đúng, có đáp án + giải thích sau khi nộp; nộp xong không lưu thêm được', async () => {
  const { base, close } = await setup();
  const { attemptId, token } = await start(base, await readingExamId(base));
  // 101 đúng (D), 102 sai (A, đáp án B), còn lại bỏ trống
  const r = await call(base, 'POST', `/api/attempts/${attemptId}/submit`, { token, body: { answers: { 101: 'D', 102: 'A' }, flagged: [] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'submitted');
  const res = r.body.result;
  assert.equal(res.readingCorrect, 1);
  assert.equal(res.readingTotal, 100);
  assert.equal(res.readingScore, 5 + 5); // bảng ước tính: 1 câu đúng = 10 điểm
  assert.equal(res.listeningTotal, 0);
  assert.equal(res.totalScore, null);
  assert.equal(res.showAnswers, true);
  const d102 = res.details.find((d) => d.no === 102);
  assert.deepEqual([d102.chosen, d102.answer, d102.isCorrect], ['A', 'B', false]);
  assert.ok(res.content.questions.find((q) => q.no === 102).explanation.length > 0);

  const late = await call(base, 'POST', `/api/attempts/${attemptId}/save`, { token, body: { answers: { 103: 'C' } } });
  assert.equal(late.status, 409);
  assert.equal(late.body.submitted, true);
  await close();
});

test('Hết giờ: server không nhận câu trả lời mới, tự nộp với những câu đã lưu', async () => {
  const { base, db, close } = await setup();
  const { attemptId, token } = await start(base, await readingExamId(base));
  await call(base, 'POST', `/api/attempts/${attemptId}/save`, { token, body: { answers: { 101: 'D' } } });
  expire(db, attemptId);

  const save = await call(base, 'POST', `/api/attempts/${attemptId}/save`, { token, body: { answers: { 101: 'D', 102: 'B' } } });
  assert.equal(save.status, 409);
  // Nộp sau giờ: câu trả lời gửi kèm bị bỏ qua, chỉ chấm câu đã lưu trước giờ
  const sub = await call(base, 'POST', `/api/attempts/${attemptId}/submit`, { token, body: { answers: { 101: 'D', 102: 'B', 103: 'C' } } });
  assert.equal(sub.body.result.readingCorrect, 1);
  await close();
});

test('Học viên đóng trình duyệt: hệ thống tự nộp bài hết giờ', async () => {
  const { base, db, close } = await setup();
  const { attemptId, token } = await start(base, await readingExamId(base));
  await call(base, 'POST', `/api/attempts/${attemptId}/save`, { token, body: { answers: { 101: 'D', 103: 'C' } } });
  expire(db, attemptId);

  assert.equal(finalizeExpiredAttempts(db), 1);
  const row = db.prepare('SELECT status, reading_correct, submitted_at, deadline_at FROM attempts WHERE id = ?').get(attemptId);
  assert.equal(row.status, 'submitted');
  assert.equal(row.reading_correct, 2);
  assert.equal(row.submitted_at, row.deadline_at); // tự nộp: ghi giờ nộp = giờ hết hạn

  // Vào lại sau khi hết giờ: thấy kết quả, và bắt đầu lại sẽ là lượt mới
  const r = await call(base, 'GET', `/api/attempts/${attemptId}`, { token });
  assert.equal(r.body.status, 'submitted');
  const again = await start(base, await readingExamId(base));
  assert.notEqual(again.attemptId, attemptId);
  await close();
});

test('Đề không cho xem đáp án: kết quả chỉ có điểm, không có đáp án', async () => {
  const { base, db, close } = await setup();
  const examId = await readingExamId(base);
  // Cài đặt lấy theo bản đã xuất bản
  db.prepare('UPDATE exam_versions SET show_answers_after = 0 WHERE exam_id = ?').run(examId);
  const { attemptId, token } = await start(base, examId);
  const r = await call(base, 'POST', `/api/attempts/${attemptId}/submit`, { token, body: { answers: { 101: 'D' } } });
  assert.equal(r.body.result.readingCorrect, 1);
  assert.equal(r.body.result.content, null);
  assert.equal(r.body.result.details, null);
  assert.ok(!JSON.stringify(r.body).includes('"answer"'));
  await close();
});
