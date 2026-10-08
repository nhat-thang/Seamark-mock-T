// Test mốc 7: admin xem kết quả, lọc, chi tiết, xuất Excel.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { setup, createClient, testConfig } = require('./helpers');

async function startAndSubmit(base, examId, student, answers) {
  const s = await (await fetch(`${base}/api/attempts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...student, examId }),
  })).json();
  if (answers) {
    await fetch(`${base}/api/attempts/${s.attemptId}/submit`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-attempt-token': s.token },
      body: JSON.stringify({ answers, flagged: [] }),
    });
  }
  return s.attemptId;
}

async function setupWithAttempts() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const exams = (await owner.get('/api/admin/exams')).body.exams;
  const reading = exams.find((e) => e.code === 'READING-01').id;
  const mau2 = exams.find((e) => e.code === 'DE-MAU-2').id;
  const ids = {
    an: await startAndSubmit(ctx.base, reading, { lastName: 'Nguyễn Văn', firstName: 'An', phone: '0901111111' }, { 101: 'D', 102: 'B', 103: 'A' }),
    binh: await startAndSubmit(ctx.base, reading, { lastName: 'Trần Thị', firstName: 'Bình', phone: '0902222222' }, { 101: 'A' }),
    anMau2: await startAndSubmit(ctx.base, mau2, { lastName: 'Nguyễn Văn', firstName: 'An', phone: '0901111111' }, {}),
    dangLam: await startAndSubmit(ctx.base, reading, { lastName: 'Lê', firstName: 'Cường', phone: '0903333333' }, null),
  };
  return { ...ctx, owner, reading, mau2, ids };
}

test('Chưa đăng nhập admin thì không xem được kết quả (có SĐT học viên)', async () => {
  const { base, close } = await setup();
  assert.equal((await fetch(`${base}/api/admin/results`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/results/export`)).status, 401);
  await close();
});

test('Danh sách: đủ lượt, mới nhất trước, có điểm và SĐT', async () => {
  const { owner, ids, close } = await setupWithAttempts();
  const r = (await owner.get('/api/admin/results')).body;
  assert.equal(r.total, 4);
  const an = r.items.find((i) => i.id === ids.an);
  assert.equal(an.student.phone, '0901111111');
  assert.equal(an.status, 'submitted');
  assert.deepEqual(an.reading, { correct: 2, total: 100, score: 15 });
  assert.equal(an.listening.total, 0);
  const dang = r.items.find((i) => i.id === ids.dangLam);
  assert.equal(dang.status, 'in_progress');
  await close();
});

test('Lọc: tên không dấu, SĐT một phần, đề, trạng thái', async () => {
  const { owner, mau2, ids, close } = await setupWithAttempts();
  const q = async (qs) => (await owner.get(`/api/admin/results?${qs}`)).body.items.map((i) => i.id).sort();

  assert.deepEqual(await q('name=nguyen%20van%20an'), [ids.an, ids.anMau2].sort());
  assert.deepEqual(await q(`name=${encodeURIComponent('BÌNH')}`), [ids.binh]);
  assert.deepEqual(await q('phone=090-222'), [ids.binh]);
  assert.deepEqual(await q(`examId=${mau2}`), [ids.anMau2]);
  assert.deepEqual(await q('status=in_progress'), [ids.dangLam]);
  assert.deepEqual(await q('from=2000-01-01&to=2000-01-02'), []);
  await close();
});

test('Chi tiết: từng câu chọn gì, đúng/sai, có giải thích; có các lần làm khác của học viên', async () => {
  const { owner, ids, close } = await setupWithAttempts();
  const d = (await owner.get(`/api/admin/results/${ids.an}`)).body;
  assert.equal(d.attempt.student.firstName, 'An');
  const byNo = new Map(d.result.details.map((x) => [x.no, x]));
  assert.deepEqual([byNo.get(101).chosen, byNo.get(101).isCorrect], ['D', true]);
  assert.deepEqual([byNo.get(103).chosen, byNo.get(103).answer, byNo.get(103).isCorrect], ['A', 'C', false]);
  assert.equal(byNo.get(104).chosen, null);
  assert.ok(d.result.content.questions.find((q) => q.no === 103).explanation.length > 0);
  assert.deepEqual(d.otherAttempts.map((o) => o.id), [ids.anMau2]);
  assert.equal((await owner.get('/api/admin/results/99999')).status, 404);
  await close();
});

test('Xuất Excel: 2 trang, đúng số dòng, SĐT giữ số 0, ô đúng/sai tô màu', async () => {
  const { base, owner, reading, close } = await setupWithAttempts();
  const cookie = (await owner.login(testConfig.ownerUsername, testConfig.ownerPassword)).setCookie.split(';')[0];
  const res = await fetch(`${base}/api/admin/results/export?examId=${reading}&status=submitted`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="ket-qua-\d{8}\.xlsx"/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const ws = wb.getWorksheet('Kết quả');
  assert.equal(ws.rowCount, 1 + 2); // tiêu đề + An + Bình
  const phones = [ws.getRow(2).getCell(6).value, ws.getRow(3).getCell(6).value].sort();
  assert.deepEqual(phones, ['0901111111', '0902222222']);

  const detail = wb.getWorksheet('Đáp án từng câu');
  assert.equal(detail.getRow(1).getCell(4).value, 'Câu 101');
  assert.equal(detail.getRow(2).getCell(4).value, 'D'); // đáp án đúng câu 101
  const anRow = [3, 4].map((n) => detail.getRow(n)).find((r) => String(r.getCell(1).value).includes('An'));
  assert.equal(anRow.getCell(4).value, 'D');
  assert.equal(anRow.getCell(4).fill.fgColor.argb, 'FFE6F5EC'); // đúng: xanh
  assert.equal(anRow.getCell(6).fill.fgColor.argb, 'FFFDECEA'); // câu 103 sai: đỏ

  const audit = (await owner.get('/api/admin/history/audit')).body.items;
  assert.equal(audit[0].action, 'export_results');
  await close();
});
