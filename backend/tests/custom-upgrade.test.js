// Test chuyển đề tự thiết kế cũ sang dạng mới (giao diện soạn đề dạng thẻ) và các thao tác thẻ.
// Hàm thao tác nằm ở frontend: frontend/src/utils/customExam.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizeContent } = require('../src/exam/contentSchema');
const { validateContent } = require('../src/exam/validate');
const { gradeAttempt } = require('../src/exam/grading');
const { toStudentContent } = require('../src/exam/content');
const { listFileRefs } = require('../src/exam/files');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'customExam.js')).href);

/** Đề soạn bằng giao diện cũ: câu lẻ -> nhóm đọc hiểu -> câu lẻ; part 2 có nhóm chưa có câu */
function oldExam() {
  return {
    examType: 'CUSTOM',
    shuffleQuestions: false,
    parts: [
      { no: 1, name: 'Đọc hiểu', directions: 'Đọc kỹ', audio: null },
      { no: 2, name: 'Nghe', directions: '', audio: 'nghe.mp3' },
    ],
    groups: [
      { code: 'N1', part: 1, kind: 'reading', passage: 'Đoạn văn 1', passageImages: ['doan.png'], image: null, audio: null },
      { code: 'N2', part: 2, kind: 'reading', passage: 'Chưa có câu', passageImages: [], image: null, audio: null },
    ],
    questions: [
      { id: 'a1', no: 1, part: 1, type: 'mcq', groupCode: null, question: 'Câu lẻ đầu', options: { A: 'x', B: 'y' }, answer: 'A', image: null, audio: null, explanation: 'vì x' },
      { id: 'a2', no: 2, part: 1, type: 'mcq', groupCode: 'N1', question: 'Ý chính?', options: { A: 'x', B: 'y', C: 'z' }, answer: 'C', image: null, audio: null, explanation: '' },
      { id: 'a3', no: 3, part: 1, type: 'mcq', groupCode: 'N1', question: 'Chi tiết?', options: { A: 'x', B: 'y' }, answer: 'B', image: null, audio: null, explanation: '' },
      { id: 'a4', no: 4, part: 1, type: 'mcq', groupCode: null, question: 'Câu lẻ sau nhóm', options: { A: 'x', B: 'y' }, answer: 'A', image: 'h.png', audio: null, explanation: '' },
      { id: 'a5', no: 5, part: 2, type: 'mcq', groupCode: null, question: 'Nghe', options: { A: 'x', B: 'y' }, answer: 'B', image: null, audio: null, explanation: '' },
    ],
  };
}

const keys = (items) => items.map((it) => (it.kind === 'part' ? `P${it.no}` : it.kind === 'group' ? it.group.code : it.question.id));

test('Đề cũ -> dạng mới (frontend): đủ trường mới, không mất dữ liệu, thứ tự thẻ đúng', async () => {
  const { upgradeContent, toItems, fromItems } = await load();
  const c = upgradeContent(oldExam());
  assert.equal(c.description, '');
  for (const q of c.questions) {
    assert.equal(q.type, 'multiple_choice');
    assert.equal(q.points, 1);
    assert.equal(q.required, false);
    assert.deepEqual(q.acceptedAnswers, []);
    assert.deepEqual(q.optionImages, {});
  }
  assert.equal(c.questions[0].explanation, 'vì x');
  assert.equal(c.questions[3].image, 'h.png');
  assert.equal(c.groups[0].blockType, 'text');
  assert.equal(c.groups[0].passage, 'Đoạn văn 1');
  // Câu lẻ sau nhóm vẫn là câu lẻ; nhóm chưa có câu nằm ở cuối part 2
  assert.deepEqual(keys(toItems(c)), ['P1', 'a1', 'N1', 'a2', 'a3', 'a4', 'P2', 'a5', 'N2']);
  // Chuyển qua lại không đổi gì
  const back = fromItems(c, toItems(c));
  assert.deepEqual(back.questions.map((q) => [q.id, q.no, q.part, q.groupCode]), c.questions.map((q) => [q.id, q.no, q.part, q.groupCode]));
  assert.deepEqual(keys(toItems(back)), keys(toItems(c)));
  // Gọi lại lần nữa không đổi
  assert.deepEqual(upgradeContent(c), c);
});

test('Đề cũ -> dạng mới (server): chuẩn hóa, kiểm tra xuất bản và chấm điểm như trước', () => {
  const c = normalizeContent(oldExam());
  assert.deepEqual(c.questions.map((q) => [q.type, q.points, q.answer]), [
    ['multiple_choice', 1, 'A'], ['multiple_choice', 1, 'C'], ['multiple_choice', 1, 'B'], ['multiple_choice', 1, 'A'], ['multiple_choice', 1, 'B'],
  ]);
  assert.equal(c.groups[0].blockType, 'text');
  assert.deepEqual(validateContent(c).errors, []);
  const r = gradeAttempt(c, { 1: 'A', 2: 'C', 5: 'A' });
  assert.equal(r.correct, 2);
  assert.equal(r.score10, 4);
});

test('Trường mới được giữ khi lưu; đáp án câu trả lời ngắn không gửi cho học viên', () => {
  const raw = oldExam();
  Object.assign(raw.questions[0], { points: 3, required: true, description: 'gợi ý', imageAlign: 'center', optionImages: { B: 'b.png', Z: 'z.png' } });
  Object.assign(raw.questions[4], { type: 'short_answer', acceptedAnswers: ['Ha Noi', ' ha  noi ', '', 'Hà Nội'], answer: 'A', othersWrong: false });
  raw.groups[1] = { ...raw.groups[1], blockType: 'audio', title: 'Bài nghe', afterId: 'a5', passage: '' };
  raw.description = 'Mô tả đề';
  const c = normalizeContent(raw);
  const q1 = c.questions[0];
  assert.deepEqual([q1.points, q1.required, q1.description, q1.imageAlign], [3, true, 'gợi ý', 'center']);
  assert.deepEqual(q1.optionImages, { B: 'b.png' }, 'chỉ giữ ảnh của lựa chọn có thật');
  const q5 = c.questions[4];
  assert.equal(q5.type, 'short_answer');
  assert.equal(q5.answer, null, 'câu trả lời ngắn không có đáp án chữ cái');
  assert.deepEqual(q5.acceptedAnswers, ['Ha Noi', 'Hà Nội'], 'bỏ ô trống, bỏ trùng (không phân biệt hoa thường, khoảng trắng)');
  assert.equal(q5.othersWrong, false);
  assert.deepEqual([c.groups[1].blockType, c.groups[1].title, c.groups[1].afterId], ['audio', 'Bài nghe', 'a5']);
  assert.equal(c.description, 'Mô tả đề');
  assert.equal(normalizeContent({ ...raw, questions: [{ ...raw.questions[0], points: 999 }] }).questions[0].points, 100);

  assert.ok(listFileRefs(c).some((r) => r.name === 'b.png'), 'ảnh lựa chọn phải được kiểm tra đã tải lên');
  const student = toStudentContent(c);
  assert.equal(student.description, 'Mô tả đề');
  assert.ok(student.questions.every((q) => !('acceptedAnswers' in q) && !('answer' in q) && !('explanation' in q)));
  // Mốc A: câu trả lời ngắn / dài chưa xuất bản được
  assert.ok(validateContent(c).errors.some((e) => e.startsWith('Question 5 là câu "Trả lời ngắn"')));
});

test('Thao tác thẻ: thêm câu vào khối, thêm khối giữa khối, thêm part, kéo thả, tách / xóa khối', async () => {
  const { upgradeContent, toItems, insertQuestions, insertBlock, insertPart, moveItem, nudgeItem, deleteItem, detachFromBlock, blockAbove, duplicateItem, deleteQuestions } = await load();
  const c = upgradeContent(oldExam());

  // Thêm câu ngay sau thẻ khối -> thuộc khối
  const [c1, k1] = insertQuestions(c, 'g:N1', 2);
  const items1 = toItems(c1);
  const newId = k1.slice(2);
  assert.equal(c1.questions.find((q) => q.id === newId).groupCode, 'N1');
  assert.equal(c1.questions.filter((q) => q.groupCode === 'N1').length, 4);
  assert.equal(keys(items1).indexOf(newId), 3);
  // Thêm sau câu lẻ -> câu lẻ
  const [c2, k2] = insertQuestions(c, 'q:a4');
  assert.equal(c2.questions.find((q) => q.id === k2.slice(2)).groupCode, null);

  // Thêm khối giữa khối N1 (sau a2): a3 chuyển sang khối mới, a2 vẫn ở N1
  const [c3, k3] = insertBlock(c, 'q:a2', 'image');
  assert.equal(k3, 'g:N3');
  assert.deepEqual(keys(toItems(c3)), ['P1', 'a1', 'N1', 'a2', 'N3', 'a3', 'a4', 'P2', 'a5', 'N2']);
  assert.equal(c3.questions.find((q) => q.id === 'a3').groupCode, 'N3');
  // Khối mới sau câu lẻ: khối trống, giữ đúng vị trí khi mở lại
  const [c4] = insertBlock(c, 'q:a1');
  assert.deepEqual(keys(toItems(c4)), ['P1', 'a1', 'N3', 'N1', 'a2', 'a3', 'a4', 'P2', 'a5', 'N2']);
  assert.equal(c4.groups.find((g) => g.code === 'N3').afterId, 'a1');

  // Thêm part sau a2 (giữa khối): không cắt khối -> part mới bắt đầu sau a3
  const [c5, k5] = insertPart(c, 'q:a2');
  assert.equal(k5, 'p:2');
  assert.deepEqual(keys(toItems(c5)), ['P1', 'a1', 'N1', 'a2', 'a3', 'P2', 'a4', 'P3', 'a5', 'N2']);
  assert.deepEqual(c5.questions.map((q) => q.part), [1, 1, 1, 2, 3]);

  // Kéo a4 lên ngay sau thẻ khối N1 -> vào khối; kéo a2 ra sau a4 (câu lẻ) -> thành câu lẻ
  const items = toItems(c);
  const c6 = moveItem(c, 'q:a4', keys(items).indexOf('a2'));
  assert.equal(c6.questions.find((q) => q.id === 'a4').groupCode, 'N1');
  const c7 = moveItem(c, 'q:a2', keys(items).indexOf('a4') + 1);
  assert.deepEqual(keys(toItems(c7)), ['P1', 'a1', 'N1', 'a3', 'a4', 'a2', 'P2', 'a5', 'N2']);
  assert.equal(c7.questions.find((q) => q.id === 'a2').groupCode, null);
  // Kéo cả khối N1 (kèm câu) xuống part 2
  const c8 = moveItem(c, 'g:N1', items.length);
  assert.deepEqual(keys(toItems(c8)), ['P1', 'a1', 'a4', 'P2', 'a5', 'N2', 'N1', 'a2', 'a3']);
  assert.ok(c8.questions.filter((q) => q.groupCode === 'N1').every((q) => q.part === 2));
  // Bàn phím: a1 xuống 1 bậc -> ngay sau thẻ N1 (vào khối); khối N1 lên 1 bậc -> trước a1
  assert.equal(nudgeItem(c, 'q:a1', 1).questions.find((q) => q.id === 'a1').groupCode, 'N1');
  assert.deepEqual(keys(toItems(nudgeItem(c, 'g:N1', -1))), ['P1', 'N1', 'a2', 'a3', 'a1', 'a4', 'P2', 'a5', 'N2']);

  // Tách a2 khỏi khối: xuống dưới khối, thành câu lẻ; gắn lại
  const c9 = detachFromBlock(c, 'a2');
  assert.deepEqual(keys(toItems(c9)), ['P1', 'a1', 'N1', 'a3', 'a2', 'a4', 'P2', 'a5', 'N2']);
  assert.equal(blockAbove(c9, 'a2'), 'N1');
  assert.equal(blockAbove(c, 'a1'), null);

  // Xóa khối: câu vẫn còn (thành câu lẻ); xóa part 1: thẻ gộp vào part còn lại
  const c10 = deleteItem(c, 'g:N1');
  assert.equal(c10.questions.length, 5);
  assert.ok(c10.questions.every((q) => q.groupCode === null || q.groupCode === undefined || q.groupCode === null));
  const c11 = deleteItem(c, 'p:1');
  assert.equal(c11.parts.length, 1);
  assert.equal(c11.parts[0].name, 'Nghe');
  assert.deepEqual(keys(toItems(c11)), ['P1', 'a1', 'N1', 'a2', 'a3', 'a4', 'a5', 'N2']);
  assert.equal(deleteItem(c11, 'p:1'), c11, 'không xóa part cuối cùng');

  // Nhân bản câu: ngay dưới, cùng khối, id mới; xóa nhiều câu
  const [c12, k12] = duplicateItem(c, 'q:a2');
  const copy = c12.questions.find((q) => q.id === k12.slice(2));
  assert.deepEqual([copy.no, copy.groupCode, copy.question], [3, 'N1', 'Ý chính?']);
  assert.deepEqual(deleteQuestions(c, ['a1', 'a5']).questions.map((q) => [q.id, q.no]), [['a2', 1], ['a3', 2], ['a4', 3]]);
});

test('Lựa chọn: thêm / xóa ở giữa đánh lại chữ, đáp án và ảnh đi theo lựa chọn', async () => {
  const { insertOptionAfter, removeOptionAt } = await load();
  const q = { options: { A: 'a', B: 'b', C: 'c' }, optionImages: { C: 'c.png' }, answer: 'C' };
  const [patch, letter] = insertOptionAfter(q, 'A');
  assert.equal(letter, 'B');
  assert.deepEqual(patch.options, { A: 'a', B: '', C: 'b', D: 'c' });
  assert.deepEqual(patch.optionImages, { D: 'c.png' });
  assert.equal(patch.answer, 'D');
  const removed = removeOptionAt(q, 'A');
  assert.deepEqual(removed, { options: { A: 'b', B: 'c' }, optionImages: { B: 'c.png' }, answer: 'B' });
  assert.equal(removeOptionAt({ options: { A: '', B: '' }, answer: null }, 'A'), null, 'giữ tối thiểu 2 lựa chọn');
});
