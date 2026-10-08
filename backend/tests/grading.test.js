// Test chấm điểm.
const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeAttempt } = require('../src/exam/grading');
const { sanitizeAnswers, toStudentContent } = require('../src/exam/content');
const { buildSampleContent } = require('../src/seed');
const table = require('../src/config/toeic-score-table.json');

test('Bảng quy đổi: đủ 101 mốc mỗi phần, tăng dần, từ 5 tới 495', () => {
  for (const section of ['listening', 'reading']) {
    const row = table[section];
    assert.equal(row.length, 101);
    assert.equal(row[0], 5);
    assert.equal(row[100], 495);
    for (let i = 1; i < row.length; i++) assert.ok(row[i] >= row[i - 1]);
  }
});

test('Đề đủ 200 câu: đếm đúng từng phần, có điểm quy đổi và tổng điểm', () => {
  const content = buildSampleContent([1, 2, 3, 4, 5, 6, 7]);
  const answers = {};
  // Làm đúng 30 câu Listening đầu tiên và 60 câu Reading đầu tiên, sai 1 câu Reading
  for (const q of content.questions) {
    if (q.no <= 30 || (q.no >= 101 && q.no <= 160)) answers[q.no] = q.answer;
  }
  answers[161] = content.questions.find((q) => q.no === 161).answer === 'A' ? 'B' : 'A';

  const r = gradeAttempt(content, answers);
  assert.equal(r.listeningTotal, 100);
  assert.equal(r.readingTotal, 100);
  assert.equal(r.listeningCorrect, 30);
  assert.equal(r.readingCorrect, 60);
  assert.equal(r.listeningScore, table.listening[30]);
  assert.equal(r.readingScore, table.reading[60]);
  assert.equal(r.totalScore, table.listening[30] + table.reading[60]);
  const d161 = r.details.find((d) => d.no === 161);
  assert.equal(d161.isCorrect, false);
  assert.equal(r.details.find((d) => d.no === 162).chosen, null); // chưa làm
});

test('Đề chỉ có Reading 100 câu: có điểm Reading, không có điểm Listening và tổng', () => {
  const content = buildSampleContent([5, 6, 7]);
  const r = gradeAttempt(content, {});
  assert.equal(r.readingTotal, 100);
  assert.equal(r.readingCorrect, 0);
  assert.equal(r.readingScore, 5);
  assert.equal(r.listeningScore, null);
  assert.equal(r.totalScore, null);
});

test('Đề ngắn (30 câu): chỉ có số câu đúng, không có điểm quy đổi', () => {
  const content = buildSampleContent([5]);
  const all = Object.fromEntries(content.questions.map((q) => [q.no, q.answer]));
  const r = gradeAttempt(content, all);
  assert.equal(r.readingCorrect, 30);
  assert.equal(r.readingScore, null);
});

test('Lọc câu trả lời: bỏ câu không có trong đề và lựa chọn sai; Part 2 không có D', () => {
  const content = buildSampleContent([2, 5]);
  const clean = sanitizeAnswers(content, { 7: 'D', 8: 'C', 101: 'B', 102: 'E', 999: 'A', 103: 1 });
  assert.deepEqual(clean, { 8: 'C', 101: 'B' });
});

test('Nội dung gửi cho học viên khi làm bài không có đáp án và giải thích', () => {
  const content = buildSampleContent([5]);
  const s = JSON.stringify(toStudentContent(content));
  assert.ok(!s.includes('"answer"'));
  assert.ok(!s.includes('"explanation"'));
});
