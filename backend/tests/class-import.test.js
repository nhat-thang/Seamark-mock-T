// Test nhập danh sách lớp từ Excel (file tự do, tên cột khác nhau) + tải danh sách lớp về Excel.
// Phần ghép cột nằm ở frontend: frontend/src/utils/rosterImport.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const ExcelJS = require('exceljs');
const { setup, createClient, testConfig } = require('./helpers');
const { fieldFromHeader, guessColumns } = require('../src/classes/rosterExcel');

const loadImport = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'rosterImport.js')).href);

/** Tạo file Excel từ mảng các dòng (mỗi dòng một mảng ô) */
async function xlsx(rows, { sheets = null, merges = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  for (const [name, data] of sheets || [['Sheet1', rows]]) {
    const ws = wb.addWorksheet(name);
    data.forEach((r) => ws.addRow(r));
    merges.forEach((m) => ws.mergeCells(m));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function setupClass() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const cls = (await owner.post('/api/admin/classes', { name: 'Lớp nhập Excel', feeEvery: 10 })).body.class;
  const preview = async (buf, name = 'ds.xlsx', query = '') =>
    owner.upload(`/api/admin/classes/${cls.id}/import/preview${query}`, 'file', [
      { name, data: buf, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ]);
  return { ...ctx, owner, cls, preview };
}

const fieldsOf = (p) => p.columns.map((c) => c.field);

test('Nhận cột họ tên với nhiều cách đặt tên cột', () => {
  const names = ['Họ và tên', 'HỌ TÊN', 'Ho ten', 'Name', 'Full name', 'Student Name', 'Tên học sinh', 'Học sinh', 'Tên HS', 'Họ và tên học viên', 'Tên bé'];
  for (const h of names) assert.equal(fieldFromHeader(h), 'fullName', h);
  // Có chữ "tên" nhưng là của người / thứ khác -> cột lạ (gộp vào ghi chú)
  for (const h of ['Tên phụ huynh', 'Họ tên mẹ', 'Họ tên PH', 'Parent name', 'Tên lớp', 'Tên trường', 'School name', 'Ngày sinh', 'Giới tính']) {
    assert.equal(fieldFromHeader(h), 'extra', h);
  }
  assert.deepEqual(
    ['SĐT', 'Số ĐT mẹ', 'Điện thoại', 'Phone', 'Zalo', 'Ngày nhập học', 'Ngày vào học', 'Ghi chú', 'STT', 'Họ đệm', 'Tên'].map(fieldFromHeader),
    ['phone', 'phone', 'phone', 'phone', 'phone', 'joinedOn', 'joinedOn', 'note', 'skip', 'lastName', 'firstName']
  );
  // "Tên" đứng một mình (không có cột "Họ") chính là họ tên
  assert.deepEqual(guessColumns(['STT', 'Tên', 'SĐT'], [['1', 'Nguyễn An', '0901234567']]).map((g) => g.field), ['skip', 'fullName', 'phone']);
});

test('File có dòng tiêu đề, tên cột lạ, SĐT bị mất số 0, ô ngày, cột lạ -> đoán đúng và ghép đúng', async () => {
  const { preview, close } = await setupClass();
  const buf = await xlsx([
    ['DANH SÁCH LỚP TOEIC K12 – NĂM 2026'],
    [],
    ['STT', 'Name', 'Số ĐT mẹ', 'Ngày nhập học', 'Ngày sinh', 'Trường', 'Ghi chú'],
    [1, 'NGUYỄN VĂN AN', 912345678, new Date(Date.UTC(2026, 8, 7)), new Date(Date.UTC(2012, 4, 2)), 'THCS Lê Lợi', 'Học bù'],
    [2, 'trần thị bình', '+84 98 765 4321', '15/09/2026', '', '', ''],
    [3, 'Lê Minh Châu', '0901234567 / 0912 345 678', 'không rõ', '', 'THCS Lê Lợi', ''],
    [4, '', '0909999999', '', '', '', 'Dòng thiếu tên'],
    [],
  ]);
  const r = await preview(buf);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = r.body;
  assert.equal(p.headerRowNumber, 3);
  assert.deepEqual(fieldsOf(p), ['skip', 'fullName', 'phone', 'joinedOn', 'extra', 'extra', 'note']);
  assert.equal(p.rows.length, 4);
  assert.deepEqual(p.rows[0].cells.slice(1, 5), ['NGUYỄN VĂN AN', '912345678', '07/09/2026', '02/05/2012']);

  const { buildStudents } = await loadImport();
  const out = buildStudents({ columns: p.columns, rows: p.rows, fields: fieldsOf(p), defaultJoinedOn: '2026-10-13', existing: [] });
  assert.deepEqual(
    out.map((s) => [s.fullName, s.phone, s.joinedOn, s.note, s.include]),
    [
      ['Nguyễn Văn An', '0912345678', '2026-09-07', 'Học bù; Ngày sinh: 02/05/2012; Trường: THCS Lê Lợi', true],
      ['Trần Thị Bình', '0987654321', '2026-09-15', '', true],
      ['Lê Minh Châu', '0901234567', '2026-10-13', 'SĐT khác: 0912345678; Trường: THCS Lê Lợi', true],
      ['', '0909999999', '2026-10-13', 'Dòng thiếu tên', false],
    ]
  );
  assert.match(out[2].warnings[0], /ngày vào học "không rõ"/);
  assert.deepEqual(out[3].problems, ['Thiếu họ tên']);
  await close();
});

test('Họ và tên tách 2 cột: "Họ đệm" + "Tên", hoặc ô "Họ và tên" gộp qua 2 cột', async () => {
  const { preview, close } = await setupClass();
  const { buildStudents } = await loadImport();

  const split = (await preview(await xlsx([['Họ đệm', 'Tên', 'SĐT'], ['Nguyễn Văn', 'An', '0901234567']]))).body;
  assert.deepEqual(fieldsOf(split), ['lastName', 'firstName', 'phone']);
  assert.equal(buildStudents({ ...split, fields: fieldsOf(split), defaultJoinedOn: '2026-10-13' })[0].fullName, 'Nguyễn Văn An');

  // Ô "Họ và tên" gộp B1:C1, không có tên cột riêng cho phần "Tên"
  const merged = (await preview(await xlsx([['STT', 'Họ và tên', '', 'Điện thoại'], [1, 'Trần Thị', 'Bình', '0912345678'], [2, 'Lê', 'Châu', '']], { merges: ['B1:C1'] }))).body;
  assert.deepEqual(fieldsOf(merged), ['skip', 'lastName', 'firstName', 'phone']);
  assert.deepEqual(buildStudents({ ...merged, fields: fieldsOf(merged), defaultJoinedOn: '2026-10-13' }).map((s) => s.fullName), ['Trần Thị Bình', 'Lê Châu']);

  // Tên cột 2 tầng: dòng 1 "Họ và tên" gộp ô, dòng 2 "Họ đệm | Tên"
  const twoRows = (await preview(await xlsx([['STT', 'Họ và tên', '', 'SĐT'], ['', 'Họ đệm', 'Tên', ''], [1, 'Phạm Gia', 'Huy', '']], { merges: ['B1:C1'] }))).body;
  assert.deepEqual(fieldsOf(twoRows), ['skip', 'lastName', 'firstName', 'phone']);
  assert.equal(twoRows.rows.length, 1);
  await close();
});

test('Không có dòng tên cột / tên cột không nhận ra: đoán cột họ tên theo nội dung', async () => {
  const { preview, close } = await setupClass();
  const noHeader = (await preview(await xlsx([['Nguyễn Văn An', '0901234567'], ['Trần Thị Bình', '0912345678'], ['Lê Châu', '']]))).body;
  assert.equal(noHeader.headerRowNumber, null);
  assert.deepEqual(noHeader.columns.map((c) => [c.field, c.guessedBy]), [['fullName', 'content'], ['phone', 'content']]);
  assert.equal(noHeader.rows.length, 3);

  // Tên cột lạ ("Thành viên") -> vẫn tìm ra cột giống tên người nhất
  const odd = (await preview(await xlsx([['Mã', 'Thành viên', 'SĐT'], ['A1', 'Nguyễn Văn An', ''], ['A2', 'Trần Bình', '']]))).body;
  assert.deepEqual(odd.columns.map((c) => [c.field, c.guessedBy]), [['extra', 'header'], ['fullName', 'content'], ['phone', 'header']]);
  await close();
});

test('Ghép cột: bắt buộc có cột họ tên; mỗi loại một cột; báo trùng với học sinh đã có và trùng trong file', async () => {
  const { mappingError, buildStudents, normalizePhone, parseDate, tidyName } = await loadImport();
  assert.match(mappingError(['phone', 'extra']), /Họ và tên/);
  assert.match(mappingError(['fullName', 'phone', 'phone']), /2 cột/);
  assert.equal(mappingError(['lastName', 'firstName', 'note', 'note', 'extra']), '');

  const rows = [
    { rowNumber: 2, cells: ['Nguyễn Văn An', '0901234567'] },
    { rowNumber: 3, cells: ['nguyen van an', ''] },
    { rowNumber: 4, cells: ['Trần Bình', '0912345678'] },
    { rowNumber: 5, cells: ['Trần Bình', '0912345678'] },
  ];
  const out = buildStudents({
    columns: [{ header: 'Họ tên', letter: 'A' }, { header: 'SĐT', letter: 'B' }],
    rows,
    fields: ['fullName', 'phone'],
    defaultJoinedOn: '2026-10-13',
    existing: [{ fullName: 'Nguyễn Văn An', phone: '0901234567' }],
  });
  assert.deepEqual(out.map((s) => [s.duplicate, s.include]), [
    ['Đã có trong lớp', false],
    ['Đã có trong lớp', false],
    ['', true],
    ['Trùng với dòng 4', false],
  ]);

  assert.deepEqual(normalizePhone('84912345678'), { phone: '0912345678', others: [], invalid: '' });
  assert.deepEqual(normalizePhone('0901234567 0912345678'), { phone: '0901234567', others: ['0912345678'], invalid: '' });
  assert.equal(normalizePhone('2838123456').phone, '02838123456');
  assert.equal(normalizePhone('chưa có').invalid, 'chưa có');
  assert.deepEqual(['13/10/2026', '1/2/26', '2026-10-13', '31/02/2026', '46308'].map(parseDate), ['2026-10-13', '2026-02-01', '2026-10-13', null, '2026-10-13']);
  assert.deepEqual(['LÊ THỊ HỒNG ĐÀO', '1. Phạm Huy', 'McDonald Anh'].map(tidyName), ['Lê Thị Hồng Đào', 'Phạm Huy', 'McDonald Anh']);
});

test('Nhập: lưu kèm tên file vào lịch sử; file .xls / không phải Excel bị từ chối với lời nhắc', async () => {
  const { owner, cls, preview, close } = await setupClass();
  const r = await owner.post(`/api/admin/classes/${cls.id}/students`, {
    fileName: 'ds-k12.xlsx',
    students: [{ fullName: 'An', note: 'x'.repeat(450) }, { fullName: 'Bình' }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.students.find((s) => s.fullName === 'An').note.length, 450);
  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items[0];
  assert.equal(log.action, 'import_students');
  assert.match(log.detail, /Nhập từ file Excel "ds-k12.xlsx" 2 học sinh/);

  const xls = await owner.upload(`/api/admin/classes/${cls.id}/import/preview`, 'file', [{ name: 'cu.xls', data: Buffer.from('x'), type: 'application/vnd.ms-excel' }]);
  assert.equal(xls.status, 400);
  assert.match(xls.body.error, /Lưu thành/);
  const fake = await preview(Buffer.from('không phải excel'), 'gia.xlsx');
  assert.equal(fake.status, 400);
  await close();
});

test('Tải danh sách lớp về Excel; file tải về nhập lại được (đúng cột, bỏ qua cột thống kê)', async () => {
  const { owner, cls, preview, base, close } = await setupClass();
  const lan = (await owner.get('/api/admin/schedule/teachers')).body.teachers[0];
  await owner.post(`/api/admin/classes/${cls.id}/students`, {
    students: [
      { fullName: 'Nguyễn Văn An', phone: '0901234567', joinedOn: '2026-09-01', note: 'Học bù' },
      { fullName: 'Trần Bình', joinedOn: '2026-09-01' },
    ],
  });
  const sid = (await owner.post('/api/admin/schedule', { classId: cls.id, date: '2026-09-02', startTime: '18:00', endTime: '19:30', teacherId: lan.id })).body.ids[0];
  const roster = (await owner.get(`/api/admin/schedule/${sid}`)).body.students;
  await owner.post(`/api/admin/schedule/${sid}/attendance`, {
    records: roster.map((s, i) => ({ studentId: s.id, status: i === 0 ? 'present' : 'absent', bonus: i === 0 ? 2 : 0 })),
  });

  // Tải về bằng cookie đăng nhập của admin
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: testConfig.ownerUsername, password: testConfig.ownerPassword }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await fetch(`${base}/api/admin/classes/${cls.id}/export`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const buf = Buffer.from(await res.arrayBuffer());

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Danh sách lớp');
  assert.equal(ws.getRow(1).getCell(2).value, 'Họ và tên');
  assert.equal(ws.getRow(2).getCell(2).value, 'Nguyễn Văn An');
  assert.equal(ws.getRow(2).getCell(3).value, '0901234567');
  assert.equal(ws.getRow(2).getCell(11).value, 2); // điểm cộng
  assert.equal(ws.getRow(3).getCell(10).value, 1); // vắng không phép
  const att = wb.getWorksheet('Điểm danh');
  assert.deepEqual([att.getRow(2).getCell(2).value, att.getRow(3).getCell(2).value], ['C +2', 'V']);

  // Nhập lại chính file vừa tải về
  const p = (await preview(buf, 'tai-ve.xlsx')).body;
  assert.equal(p.columns.find((c) => c.header === 'Họ và tên').field, 'fullName');
  assert.equal(p.columns.find((c) => c.header === 'Ngày vào học').field, 'joinedOn');
  assert.equal(p.columns.find((c) => c.header === 'Tổng số buổi').field, 'skip');
  assert.equal(p.columns.find((c) => c.header === 'Ghi chú').field, 'note');
  const { buildStudents } = await loadImport();
  const out = buildStudents({ ...p, fields: fieldsOf(p), defaultJoinedOn: '2026-10-13', existing: [] });
  assert.deepEqual(out.map((s) => [s.fullName, s.phone, s.joinedOn, s.note]), [
    ['Nguyễn Văn An', '0901234567', '2026-09-01', 'Học bù'],
    ['Trần Bình', '', '2026-09-01', ''],
  ]);

  const log = (await owner.get(`/api/admin/history/audit?classId=${cls.id}`)).body.items[0];
  assert.equal(log.action, 'export_class');
  await close();
});
