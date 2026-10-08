// Test bộ đọc chuỗi đáp án (file của frontend, viết bằng JavaScript thuần nên test được ở đây).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'answerParser.js')).href);

test('Kiểu "số + chữ": nhiều cách viết, chữ thường, xuống dòng', async () => {
  const { parseAnswerText } = await load();
  const r = parseAnswerText('101A 102c\n103.B, 104-d 105: A\n106) C');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.answers, { 101: 'A', 102: 'C', 103: 'B', 104: 'D', 105: 'A', 106: 'C' });
});

test('Dán nguyên danh sách dạng "101 D: chưa trả lời  [Chi tiết]" (đáp án gốc người dùng gửi)', async () => {
  const { parseAnswerText } = await load();
  const text = `101 D: chưa trả lời  [Chi tiết]
102 B: chưa trả lời  [Chi tiết]

Part 6
131 B: chưa trả lời  [Chi tiết]
170 A: D  [Chi tiết]`;
  const r = parseAnswerText(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.answers, { 101: 'D', 102: 'B', 131: 'B', 170: 'A' });
});

test('Kiểu chỉ có chữ: gán lần lượt từ câu bắt đầu', async () => {
  const { parseAnswerText } = await load();
  const r = parseAnswerText('ACBD dcba', 101);
  assert.deepEqual(r.answers, { 101: 'A', 102: 'C', 103: 'B', 104: 'D', 105: 'D', 106: 'C', 107: 'B', 108: 'A' });
});

test('Báo lỗi: chữ không hợp lệ, Part 2 chọn D, số câu ngoài 1–200, trùng câu khác đáp án', async () => {
  const { parseAnswerText } = await load();
  const r = parseAnswerText('1E 10D 250A 101A 101B');
  assert.ok(r.errors.some((e) => e.startsWith('Câu 1: "E"')));
  assert.ok(r.errors.includes('Câu 10 (Part 2) chỉ có A, B, C.'));
  assert.ok(r.errors.some((e) => e.startsWith('Câu 250')));
  assert.ok(r.errors.includes('Câu 101 xuất hiện 2 lần với 2 đáp án khác nhau.'));
  const s = parseAnswerText('ABDX', 30);
  assert.deepEqual(s.answers, { 30: 'A', 31: 'B', 32: 'D' }); // 32 là Part 3 nên D hợp lệ
  assert.ok(s.errors.some((e) => e.includes('"X"')));
});
