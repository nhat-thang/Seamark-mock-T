// Test bộ tách đề dán vào (file của frontend: frontend/src/utils/pasteParser.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'pasteParser.js')).href);
const levels = (q, level) => q.flags.filter((f) => f.level === level);

test('Mỗi lựa chọn một dòng, đáp án "Đáp án: B", câu hỏi nhiều dòng, giải thích', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam(`
1. She ___ to school every day.
A. go
B. goes
C. going
D. gone
Đáp án: B
Giải thích: Chủ ngữ số ít, thì hiện tại đơn.

2. They ___ football
yesterday afternoon.
A) play
B) played
C) playing
Answer: B
`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.questions.length, 2);
  const [q1, q2] = r.questions;
  assert.equal(q1.question, 'She ___ to school every day.');
  assert.deepEqual(q1.options, { A: 'go', B: 'goes', C: 'going', D: 'gone' });
  assert.equal(q1.answer, 'B');
  assert.equal(q1.explanation, 'Chủ ngữ số ít, thì hiện tại đơn.');
  assert.equal(q2.question, 'They ___ football\nyesterday afternoon.');
  assert.deepEqual(Object.keys(q2.options), ['A', 'B', 'C']);
  assert.equal(q2.answer, 'B');
  assert.deepEqual(levels(q1, 'error'), []);
});

test('Lựa chọn trên cùng dòng câu hỏi + bảng đáp án ở cuối đề', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam(`
Question 1: I have lived here ___ 2010. A. for B. since C. in D. at
Question 2: He is good ___ math.   A. at   B. in   C. on   D. with
Question 3: Choose the correct word: A. beautiful B. beautifuly C. beautyful D. beutiful

ĐÁP ÁN
1B 2A 3A
`);
  assert.equal(r.questions.length, 3);
  assert.equal(r.questions[0].question, 'I have lived here ___ 2010.');
  assert.deepEqual(r.questions[0].options, { A: 'for', B: 'since', C: 'in', D: 'at' });
  assert.deepEqual(r.questions.map((q) => q.answer), ['B', 'A', 'A']);
  assert.ok(r.questions.every((q) => q.answerFrom === 'key'));
});

test('Kiểu "Câu 1:", lựa chọn viết thường, đáp án đánh dấu *, lựa chọn bị xuống dòng', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam(`
Câu 1: Từ nào khác loại?
a. apple
*b. table
c. banana
d. orange
Câu 2. Chọn câu đúng
a) She don't like
b) She doesn't like coffee and
tea in the morning
c) She not like *
`);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].answer, 'B');
  assert.deepEqual(r.questions[0].options, { A: 'apple', B: 'table', C: 'banana', D: 'orange' });
  assert.equal(r.questions[1].options.B, "She doesn't like coffee and tea in the morning");
  assert.equal(r.questions[1].options.C, 'She not like');
  assert.equal(r.questions[1].answer, 'C');
});

test('Đoạn văn dài trước nhóm question -> nhóm đọc hiểu; "questions 3-4" thì nhóm dừng ở câu 4', async () => {
  const { parsePastedExam } = await load();
  const passage = 'Read the passage and answer questions 3-4.\nThe city library opens at 8 a.m. on weekdays and at 10 a.m. on weekends. Members can borrow up to five books for three weeks. Late returns cost 5,000 dong per day.';
  const r = parsePastedExam(`
1. Pick one. A. a B. b
2. Pick two. A. a B. b
${passage}
3. When does the library open on Saturday?
A. 8 a.m.
B. 10 a.m.
4. How many books can members borrow?
A. three
B. five
5. Not in the passage. A. x B. y
`);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].passage, passage);
  assert.deepEqual(r.questions.map((q) => q.group), [null, null, 0, 0, null]);
});

test('Tiêu đề ngắn kết thúc nhóm; danh sách "1. 2." trong đoạn văn không bị hiểu là question', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam(`
NOTICE TO ALL STAFF
Please remember the following rules when using the meeting rooms on the third floor of our office building:
1. Book the room at least one day in advance.
2. Clean the whiteboard after use.
1. What is the notice about?
A. Parking
B. Meeting rooms
2. How early must rooms be booked?
A. One day
B. One week
PART 2. GRAMMAR
3. She ___ here. A. is B. are
`);
  assert.equal(r.questions.length, 3);
  assert.equal(r.questions[0].question, 'What is the notice about?');
  assert.equal(r.groups.length, 1);
  assert.ok(r.groups[0].passage.includes('2. Clean the whiteboard'));
  assert.deepEqual(r.questions.map((q) => q.group), [0, 0, null]);
  assert.ok(r.ignored.includes('PART 2. GRAMMAR'));
});

test('"Câu 5-8: ..." là lời dẫn, không phải question 5', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam(`
4. Pick. A. a B. b
Câu 5-8: Chọn từ đúng.
5. Pick. A. a B. b
`);
  assert.deepEqual(r.questions.map((q) => q.srcNo), [4, 5]);
  assert.equal(r.questions[1].question, 'Pick.');
});

test('Phát hiện question cần ảnh: dấu ảnh khi dán, lựa chọn trống, từ khóa (dấu hiệu yếu)', async () => {
  const { parsePastedExam, IMAGE_MARK, imageReasonOf } = await load();
  const r = parsePastedExam(`
1. What is the man doing?
${IMAGE_MARK}
A. Reading
B. Cooking
2. A B C D
3. Look at the chart. Which month had the most sales?
A. May
B. June
4. She ___ a teacher. A. is B. are
`);
  const [q1, q2, q3, q4] = r.questions;
  assert.equal(levels(q1, 'image').length, 1);
  assert.deepEqual(q2.options, { A: '', B: '', C: '', D: '' });
  assert.ok(levels(q2, 'image').length >= 1);
  assert.ok(levels(q3, 'image').some((f) => f.weak));
  assert.equal(levels(q4, 'image').length, 0);
  // AI nói không cần ảnh -> bỏ dấu hiệu yếu (từ khóa); dấu hiệu mạnh thì giữ
  assert.equal(imageReasonOf(q3, { needsImage: false }), '');
  assert.notEqual(imageReasonOf(q1, { needsImage: false }), '');
  assert.match(imageReasonOf(q4, { needsImage: true, imageReason: 'Cần ảnh người đàn ông.' }), /^AI: Cần ảnh người đàn ông$/);
});

test('Ảnh nằm giữa hai question -> đánh dấu question phía sau', async () => {
  const { parsePastedExam, IMAGE_MARK } = await load();
  const r = parsePastedExam(`1. One. A. a B. b\n${IMAGE_MARK}\n2. What do you see? A. a cat B. a dog`);
  assert.equal(levels(r.questions[0], 'image').length, 0);
  assert.equal(levels(r.questions[1], 'image').length, 1);
});

test('Bảng đáp án dán riêng: dạng "1. A 2. C" và dạng dãy chữ "AC"; đáp án khác nhau thì cảnh báo', async () => {
  const { parsePastedExam } = await load();
  const text = '11. x A. a B. b C. c\n12. y A. a B. b C. c';
  assert.deepEqual(parsePastedExam(text, { answerKey: '11. A 12. C' }).questions.map((q) => q.answer), ['A', 'C']);
  assert.deepEqual(parsePastedExam(text, { answerKey: 'a c' }).questions.map((q) => q.answer), ['A', 'C']);
  const r = parsePastedExam('1. x\nA. a\nB. b\nĐáp án: A', { answerKey: '1B' });
  assert.equal(r.questions[0].answer, 'A');
  assert.equal(levels(r.questions[0], 'warn').length, 1);
});

test('Báo lỗi: không có question, thiếu lựa chọn, lựa chọn lặp, đáp án không có trong lựa chọn', async () => {
  const { parsePastedExam } = await load();
  assert.equal(parsePastedExam('Chỉ là một đoạn chữ.').errors.length, 1);
  const r = parsePastedExam(`
Câu 1: Không có lựa chọn nào
Câu 2: Lặp. A. a B. b
A. c
Câu 3: Sai đáp án. A. a B. b
Đáp án: D
`);
  assert.ok(levels(r.questions[0], 'error').length);
  assert.ok(levels(r.questions[1], 'error').length || levels(r.questions[1], 'warn').length);
  assert.equal(r.questions[2].answer, null);
  assert.ok(levels(r.questions[2], 'error').length);
});

test('Không nhầm "2019. Sales rose" (số không nối tiếp) là question', async () => {
  const { parsePastedExam } = await load();
  const r = parsePastedExam('1. First? A. a B. b\n2019. Sales rose sharply.\n2. Second? A. a B. b');
  assert.deepEqual(r.questions.map((q) => q.srcNo), [1, 2]);
});

test('Mất xuống dòng (copy từ PDF): nhiều câu dính một dòng vẫn tách đúng từng câu', async () => {
  const { parsePastedExam } = await load();
  // Đúng như trường hợp giáo viên gặp: "Câu 2:" nằm ngay sau lựa chọn D của câu 1
  const r = parsePastedExam(`Câu 1: Hạt nhân chủ yếu của thế giới quan là gì?
A. Các quan điểm chính trị – xã hội
B. Các quan điểm kinh tế
C. Các quan điểm triết học
D. Các quan điểm mỹ học Câu 2: Điểm chung trong quan niệm về vật chất của chủ nghĩa duy vật thời cổ đại là: A. Đồng nhất vật chất với khối lượng B. Đồng nhất vật chất với nguyên tử C. Đồng nhất vật chất với vật thể cụ thể cảm tính D. Đồng nhất vật chất với thực tại khách quan`);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].options.D, 'Các quan điểm mỹ học');
  assert.equal(r.questions[1].srcNo, 2);
  assert.match(r.questions[1].question, /^Điểm chung trong quan niệm/);
  assert.deepEqual(Object.keys(r.questions[1].options), ['A', 'B', 'C', 'D']);
  assert.equal(r.questions[1].options.D, 'Đồng nhất vật chất với thực tại khách quan');

  // Cả đề trên một dòng, số câu trần "2." + đáp án nằm giữa dòng
  const one = parsePastedExam('1. She ___ to school. A. go B. goes C. going D. gone Đáp án: B 2. I have lived here ___ 2010. A. for B. since C. in D. at Đáp án: B 3. Water boils at ___ degrees. A. 90 B. 100 Đáp án: B');
  assert.deepEqual(one.questions.map((q) => [q.srcNo, Object.keys(q.options).length, q.answer]), [[1, 4, 'B'], [2, 4, 'B'], [3, 2, 'B']]);
  assert.equal(one.questions[0].options.D, 'gone');

  // Không cắt nhầm: "câu 3:" viết thường trong câu văn, số thập phân, số không phải câu kế tiếp
  const safe = parsePastedExam('1. Theo câu 3: tốc độ STM-1 là 155.52 Mb/s, gấp 4. lần? A. Đúng B. Sai');
  assert.equal(safe.questions.length, 1);
  assert.match(safe.questions[0].question, /câu 3: tốc độ STM-1 là 155.52/);
});
