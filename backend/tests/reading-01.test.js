// Kiểm tra dữ liệu đề Reading 1: đúng cấu trúc, đáp án khớp đáp án gốc, không lệch câu.
const test = require('node:test');
const assert = require('node:assert/strict');
const exam = require('../src/seed-data/reading-01');

// Đáp án gốc người dùng cung cấp (chép nguyên văn "số câu + đáp án")
const ANSWER_TEXT = `
101 D 102 B 103 C 104 A 105 C 106 B 107 A 108 D 109 A 110 B
111 A 112 C 113 D 114 C 115 D 116 C 117 A 118 A 119 C 120 C
121 C 122 C 123 D 124 D 125 B 126 A 127 B 128 C 129 B 130 C
131 B 132 D 133 C 134 A 135 C 136 C 137 A 138 D 139 C 140 B
141 A 142 A 143 D 144 B 145 A 146 C
147 A 148 C 149 C 150 B 151 D 152 B 153 A 154 C 155 B 156 C
157 B 158 C 159 A 160 D 161 C 162 C 163 B 164 A 165 D 166 A
167 C 168 B 169 C 170 A 171 C 172 C 173 B 174 D 175 C 176 B
177 C 178 C 179 C 180 C 181 A 182 C 183 B 184 C 185 D 186 D
187 C 188 C 189 D 190 B 191 B 192 A 193 C 194 D 195 B 196 C
197 B 198 C 199 B 200 C`;
const ANSWER_KEY = Object.fromEntries([...ANSWER_TEXT.matchAll(/(\d+) ([A-D])/g)].map((m) => [Number(m[1]), m[2]]));

const { groups, questions } = exam.content;
const byCode = new Map(groups.map((g) => [g.code, g]));

test('Đủ 100 câu, số câu 101–200 liên tục, đúng Part', () => {
  assert.equal(questions.length, 100);
  questions.forEach((q, i) => {
    assert.equal(q.no, 101 + i);
    const expectedPart = q.no <= 130 ? 5 : q.no <= 146 ? 6 : 7;
    assert.equal(q.part, expectedPart, `câu ${q.no}`);
    assert.equal(q.type, 'mcq');
  });
});

test('Đáp án khớp đúng đáp án gốc từng câu', () => {
  assert.equal(Object.keys(ANSWER_KEY).length, 100);
  for (const q of questions) assert.equal(q.answer, ANSWER_KEY[q.no], `câu ${q.no}`);
});

test('Mỗi câu đủ 4 lựa chọn, có giải thích; Part 5 và 7 có câu hỏi', () => {
  for (const q of questions) {
    assert.deepEqual(Object.keys(q.options), ['A', 'B', 'C', 'D'], `câu ${q.no}`);
    for (const t of Object.values(q.options)) assert.ok(t.trim(), `câu ${q.no} có lựa chọn rỗng`);
    assert.ok(q.explanation.length > 20, `câu ${q.no} thiếu giải thích`);
    if (q.part !== 6) assert.ok(q.question.trim(), `câu ${q.no} thiếu đề`);
  }
});

test('Nhóm câu: mã nhóm tồn tại, khoảng câu khớp, đoạn văn có đủ chỗ trống / số văn bản', () => {
  for (const q of questions) {
    if (q.part === 5) {
      assert.equal(q.groupCode, null);
      continue;
    }
    const g = byCode.get(q.groupCode);
    assert.ok(g, `câu ${q.no}: không có nhóm ${q.groupCode}`);
    assert.ok(q.no >= g.from && q.no <= g.to, `câu ${q.no} nằm ngoài nhóm ${g.code}`);
    assert.equal(g.part, q.part);
    // Part 6: đoạn văn phải có đúng chỗ trống của câu này
    if (q.part === 6) assert.ok(g.passage.includes(`__(${q.no})__`), `thiếu chỗ trống (${q.no})`);
  }
  for (const g of groups) {
    const inGroup = questions.filter((q) => q.groupCode === g.code).map((q) => q.no);
    const expected = Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i);
    assert.deepEqual(inGroup, expected, `nhóm ${g.code}`);
    const docs = g.passage.split(/\n---\n/).length;
    const expectedDocs = { double: 2, triple: 3 }[g.kind] || 1;
    assert.equal(docs, expectedDocs, `nhóm ${g.code} phải có ${expectedDocs} văn bản`);
  }
  const kinds = groups.filter((g) => g.part === 7).map((g) => g.kind);
  assert.equal(kinds.filter((k) => k === 'single').length, 10);
  assert.equal(kinds.filter((k) => k === 'double').length, 2);
  assert.equal(kinds.filter((k) => k === 'triple').length, 3);
});
