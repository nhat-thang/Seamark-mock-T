// Test đọc file Excel đề thi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseExamWorkbook } = require('../src/exam/excelImport');
const { normalizeContent } = require('../src/exam/contentSchema');
const { buildWorkbook } = require('./excelFixture');
const reading01 = require('../src/seed-data/reading-01');

const clone = (x) => JSON.parse(JSON.stringify(x));

test('File mẫu gốc docs/mau-de-toeic.xlsx đọc được (không lỗi do ghi chú trong ô); chưa điền câu nào thì báo rõ', async () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'mau-de-toeic.xlsx'));
  const r = await parseExamWorkbook(buf);
  assert.deepEqual(r.errors, ['Trang «Câu hỏi» chưa có câu nào được điền (cần ít nhất Đáp án hoặc nội dung câu hỏi).']);
  assert.equal(r.content.groups.length, 42); // 13 + 10 + 4 + 10 + 2 + 3
  assert.equal(r.content.groups.find((g) => g.code === 'P7-DB03').kind, 'triple');
  assert.equal(r.settings.durationMinutes, 120);
});

test('Import đề Reading 1 từ Excel: ra đúng từng câu, từng nhóm, đoạn văn nhiều dòng', async () => {
  const buf = await buildWorkbook(reading01.content, { code: 'reading-02', title: 'Đề từ Excel', duration: 180, note: 'Ghi chú' });
  const r = await parseExamWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.settings, { code: 'READING-02', title: 'Đề từ Excel', durationMinutes: 180, internalNote: 'Ghi chú' });

  const got = normalizeContent(r.content);
  const expected = normalizeContent(reading01.content);
  assert.deepEqual(got.questions, expected.questions);
  assert.deepEqual(got.groups, expected.groups);
  assert.ok(got.groups.find((g) => g.code === 'P7-DD01').passage.includes('\n---\n'));
});

test('File có lỗi: đáp án sai, Part sai, trùng câu, mã nhóm không tồn tại -> báo theo dòng / số câu', async () => {
  const c = clone(reading01.content);
  c.questions[0].answer = 'E'; // 101 (dòng 2)
  c.questions[1].part = 6; // 102
  c.questions[3].groupCode = 'P9-01'; // 104
  c.questions.push({ ...clone(c.questions[4]) }); // trùng 105
  const r = await parseExamWorkbook(await buildWorkbook(c));
  assert.ok(r.errors.includes('Trang «Câu hỏi», dòng 2 (câu 101): đáp án "E" không hợp lệ (chỉ được A, B, C, D).'));
  assert.ok(r.errors.some((e) => e.includes('(câu 102): câu 102 phải thuộc Part 5')));
  assert.ok(r.errors.some((e) => e.includes('mã nhóm "P9-01" không có trong trang «Nhóm câu»')));
  assert.ok(r.errors.some((e) => e.includes('câu 105 bị trùng')));
});

test('Chữ thường "d" vẫn là đáp án D; bỏ qua dòng chỉ có số câu', async () => {
  const content = { groups: [], questions: [clone(reading01.content.questions[0])] };
  content.questions[0].answer = 'd';
  const buf = await buildWorkbook(content, {}, (wb) => {
    const ws = wb.getWorksheet('Câu hỏi');
    ws.addRow([102, 5, '', '', '', '', '', '', '', '', '']); // dòng chỉ có số câu -> bỏ qua
  });
  const r = await parseExamWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.equal(r.content.questions.length, 1);
  assert.equal(r.content.questions[0].answer, 'D');
});

test('Part 2 chỉ có A–C; Part 1 chỉ cần đáp án + ảnh', async () => {
  const content = {
    groups: [],
    questions: [
      { no: 1, part: 1, groupCode: null, question: '', options: { A: '', B: '', C: '', D: '' }, answer: 'B', image: 'q1.jpg', explanation: '' },
      { no: 7, part: 2, groupCode: null, question: '', options: { A: '', B: '', C: '' }, answer: 'D', image: null, explanation: '' },
    ],
  };
  const r = await parseExamWorkbook(await buildWorkbook(content));
  assert.equal(r.content.questions[0].image, 'q1.jpg');
  assert.ok(r.errors.some((e) => e.includes('(câu 7): đáp án "D" không hợp lệ (chỉ được A, B, C)')));
});

test('Không phải file Excel / thiếu trang «Câu hỏi»', async () => {
  const bad = await parseExamWorkbook(Buffer.from('không phải excel'));
  assert.match(bad.errors[0], /Không đọc được file/);
  const noSheet = await parseExamWorkbook(await buildWorkbook({ groups: [], questions: [] }, {}, (wb) => wb.removeWorksheet(wb.getWorksheet('Câu hỏi').id)));
  assert.ok(noSheet.errors.some((e) => e.includes('Không tìm thấy trang «Câu hỏi»')));
});
