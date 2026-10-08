// Test kiểm tra đề trước khi xuất bản.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateContent, formatRanges } = require('../src/exam/validate');
const reading01 = require('../src/seed-data/reading-01');

const clone = (x) => JSON.parse(JSON.stringify(x));

test('Đề Reading 1 hợp lệ: không có lỗi, chỉ cảnh báo thiếu Listening', () => {
  const { errors, warnings } = validateContent(reading01.content, { uploadedFiles: new Set() });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ['Đề chưa có phần Listening (câu 1–100).']);
});

test('Phát hiện: thiếu đáp án, đáp án sai, sai Part, trùng câu, thiếu lựa chọn', () => {
  const c = clone(reading01.content);
  c.questions[0].answer = null; // 101
  c.questions[1].answer = 'E'; // 102
  c.questions[2].part = 6; // 103
  c.questions[3].options.C = ''; // 104
  c.questions.push(clone(c.questions[4])); // trùng 105
  const { errors } = validateContent(c);
  assert.ok(errors.includes('Câu 101 chưa có đáp án.'));
  assert.ok(errors.some((e) => e.startsWith('Câu 102: đáp án "E"')));
  assert.ok(errors.includes('Câu 103 phải thuộc Part 5 (đang ghi Part 6).'));
  assert.ok(errors.includes('Câu 104 thiếu nội dung lựa chọn C.'));
  assert.ok(errors.includes('Câu 105 bị trùng (xuất hiện nhiều lần).'));
});

test('Phát hiện: nhóm không tồn tại, nhóm Part 7 không có đoạn văn, file chưa tải lên', () => {
  const c = clone(reading01.content);
  c.questions.find((q) => q.no === 147).groupCode = 'P7-X99';
  c.groups.find((g) => g.code === 'P7-D02').passage = '';
  c.questions.find((q) => q.no === 101).image = 'anh-101.png';
  const { errors } = validateContent(c, { uploadedFiles: new Set(['khac.png']) });
  assert.ok(errors.some((e) => e.includes('nhóm "P7-X99" nhưng nhóm này không tồn tại')));
  assert.ok(errors.includes('Nhóm P7-D02 chưa có đoạn văn (chữ hoặc ảnh).'));
  assert.ok(errors.some((e) => e.includes('"anh-101.png"')));
});

test('Đề thiếu một số câu: cảnh báo kèm danh sách câu thiếu', () => {
  const c = clone(reading01.content);
  c.questions = c.questions.filter((q) => ![110, 111, 112, 150].includes(q.no));
  const { errors, warnings } = validateContent(c);
  assert.deepEqual(errors, []);
  assert.ok(warnings.includes('Reading còn thiếu câu: 110–112, 150.'));
});

test('Đề trống là lỗi', () => {
  assert.deepEqual(validateContent({ questions: [] }).errors, ['Đề chưa có câu hỏi nào.']);
});

test('formatRanges gộp dãy số liên tiếp', () => {
  assert.equal(formatRanges([1, 2, 3, 5, 7, 8]), '1–3, 5, 7–8');
  assert.equal(formatRanges([]), '');
});
