// Test bảng chăm sóc khách hàng (CSKH): chỉ admin chính; thêm / sửa ô / xóa / khôi phục;
// trạng thái tự thêm; thêm vào lớp; tải Excel; lịch sử chỉnh sửa.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { setup, createClient, testConfig } = require('./helpers');

async function setupOwner() {
  const ctx = await setup();
  const owner = createClient(ctx.base);
  await owner.login(testConfig.ownerUsername, testConfig.ownerPassword);
  const add = async (rows) => (await owner.post('/api/admin/crm', { rows })).body.contacts;
  const cells = (changes) => owner.post('/api/admin/crm/cells', { changes });
  return { ...ctx, owner, add, cells };
}

test('Chỉ admin chính dùng được CSKH (giáo viên bị chặn 403)', async () => {
  const { owner, base, close } = await setupOwner();
  await owner.post('/api/admin/accounts', { username: 'lan', displayName: 'Cô Lan', password: 'matkhau-lan' });
  const lan = createClient(base);
  await lan.login('lan', 'matkhau-lan');
  const routes = [
    ['GET', '/api/admin/crm'],
    ['POST', '/api/admin/crm'],
    ['POST', '/api/admin/crm/cells'],
    ['POST', '/api/admin/crm/delete'],
    ['POST', '/api/admin/crm/restore'],
    ['GET', '/api/admin/crm/deleted'],
    ['GET', '/api/admin/crm/export'],
    ['GET', '/api/admin/crm/1/history'],
    ['POST', '/api/admin/crm/1/enroll'],
    ['POST', '/api/admin/crm/statuses'],
    ['POST', '/api/admin/crm/statuses/1/update'],
    ['POST', '/api/admin/crm/statuses/1/delete'],
  ];
  for (const [method, path] of routes) {
    const r = method === 'GET' ? await lan.get(path) : await lan.post(path, { rows: [{ studentName: 'X' }] });
    assert.equal(r.status, 403, `${method} ${path} trả ${r.status}`);
  }
  await close();
});

test('Thêm khách hàng: chuẩn hóa SĐT, CCCD, trạng thái, ghi chú; dòng trống; dữ liệu sai bị chặn', async () => {
  const { owner, add, db, close } = await setupOwner();
  const res = await owner.post('/api/admin/crm', {
    rows: [
      {
        studentName: '  Nguyễn   An ', parentName: 'Trần Thị Lan', phone: '+84 912 345 678', idNumber: '79123456789',
        contactDate: '2026-10-13', staff: 'Hương', status: 'đã chốt', tuition: 1500000, followUp: '2026-10-15', note: 'Dòng 1\n\n\n\n  Dòng   2 ',
      },
      { studentName: 'Bé Bình', phone: '0901234567 0912345678', idNumber: 'abc', status: 'Đã cọc' },
      {},
    ],
  });
  assert.equal(res.status, 201);
  const [an, binh, blank] = res.body.contacts;
  assert.equal(an.studentName, 'Nguyễn An');
  assert.equal(an.phone, '0912345678', 'đổi +84 thành 0');
  assert.equal(an.idNumber, '079123456789', 'thêm lại số 0 Excel làm mất');
  assert.equal(an.status, 'Đã chốt', 'chữ thường vẫn nhận ra trạng thái cố định');
  assert.equal(an.tuition, 1500000);
  assert.equal(an.note, 'Dòng 1\n\nDòng 2');
  assert.equal(binh.phone, '0901234567 / 0912345678', 'hai số viết liền được tách ra');
  assert.equal(binh.idNumber, 'abc', 'sai mẫu thì giữ nguyên chữ (giao diện cảnh báo)');
  assert.equal(binh.status, 'Đã cọc');
  assert.deepEqual(res.body.newStatuses, ['Đã cọc'], 'trạng thái chưa có được tự thêm vào danh sách');
  assert.equal(blank.studentName, '');
  assert.equal(blank.contactDate, null);

  // Ngày / học phí phải ở dạng chuẩn (trình duyệt đã đổi chữ gõ vào)
  assert.equal((await owner.post('/api/admin/crm', { rows: [{ contactDate: '13/10/2026' }] })).status, 400);
  assert.match((await owner.post('/api/admin/crm', { rows: [{ tuition: 'abc' }] })).body.error, /Học phí/);
  assert.equal((await owner.post('/api/admin/crm', { rows: [] })).status, 400);

  const list = (await owner.get('/api/admin/crm')).body;
  assert.equal(list.contacts.length, 3);
  assert.deepEqual(list.statuses.map((s) => [s.name, s.count]), [['Đã cọc', 1]]);
  assert.deepEqual(list.staffNames, ['Hương']);
  assert.ok(list.today);

  const log = db.prepare(`SELECT detail FROM audit_log WHERE action = 'crm_add'`).all();
  assert.equal(log.length, 1);
  assert.match(log[0].detail, /Thêm 3 khách hàng vào bảng CSKH: Nguyễn An, Bé Bình/);
  assert.match(log[0].detail, /Thêm trạng thái mới: "Đã cọc"/);

  await add([{}]);
  assert.match(db.prepare(`SELECT detail FROM audit_log WHERE action = 'crm_add' ORDER BY id DESC`).get().detail, /Thêm một dòng mới/);
  await close();
});

test('Sửa ô: nhiều ô một lần, ô sai bị bỏ qua (các ô khác vẫn lưu); lịch sử từng khách hàng', async () => {
  const { owner, add, cells, db, close } = await setupOwner();
  const [a, b] = await add([{ studentName: 'An' }, { studentName: 'Bình' }]);
  const r = await cells([
    { id: a.id, field: 'status', value: 'chờ chốt' },
    { id: a.id, field: 'tuition', value: 2000000 },
    { id: b.id, field: 'contactDate', value: '2026-02-30' },
    { id: b.id, field: 'created_by', value: 1 },
    { id: 99999, field: 'note', value: 'x' },
    { id: b.id, field: 'followUp', value: '2026-10-20' },
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.errors.map((e) => e.field), ['contactDate', 'created_by', 'note']);
  const byId = Object.fromEntries(r.body.contacts.map((c) => [c.id, c]));
  assert.equal(byId[a.id].status, 'Đang chờ chốt');
  assert.equal(byId[a.id].tuition, 2000000);
  assert.equal(byId[b.id].followUp, '2026-10-20');
  assert.equal(byId[b.id].contactDate, null, 'ngày sai không được lưu');

  // Giá trị không đổi -> không ghi gì
  const same = await cells([{ id: a.id, field: 'tuition', value: '2000000' }]);
  assert.equal(same.body.contacts.length, 0);

  const h = (await owner.get(`/api/admin/crm/${a.id}/history`)).body;
  assert.deepEqual(h.changes.map((c) => c.field).sort(), ['create', 'status', 'tuition']);
  const st = h.changes.find((c) => c.field === 'status');
  assert.equal(st.oldValue, '');
  assert.equal(st.newValue, 'Đang chờ chốt');
  assert.equal(st.by, 'Thom Tran');

  const log = db.prepare(`SELECT detail FROM audit_log WHERE action = 'crm_update'`).all();
  assert.equal(log.length, 1);
  assert.match(log[0].detail, /Sửa 3 ô trong bảng CSKH \(2 khách hàng: An, Bình\)/);
  await close();
});

test('Lịch sử chỉnh sửa: sửa liên tiếp một khách hàng gộp mỗi 10 phút, đổi trạng thái luôn ghi', async () => {
  const { add, cells, db, close } = await setupOwner();
  const [a] = await add([{ studentName: 'An' }]);
  await cells([{ id: a.id, field: 'note', value: 'Gọi lần 1' }]);
  await cells([{ id: a.id, field: 'note', value: 'Gọi lần 2' }]);
  await cells([{ id: a.id, field: 'phone', value: '0901234567' }]);
  let log = db.prepare(`SELECT detail FROM audit_log WHERE action = 'crm_update' ORDER BY id`).all();
  assert.equal(log.length, 1);
  assert.match(log[0].detail, /CSKH "An": Ghi chú \(trống\) → "Gọi lần 1"/);
  await cells([{ id: a.id, field: 'status', value: 'Fail' }]);
  log = db.prepare(`SELECT detail FROM audit_log WHERE action = 'crm_update' ORDER BY id`).all();
  assert.equal(log.length, 2);
  assert.match(log[1].detail, /Trạng thái \(trống\) → "Fail"/);
  await close();
});

test('Xóa nhiều dòng, khôi phục (hoàn tác), danh sách đã xóa', async () => {
  const { owner, add, cells, db, close } = await setupOwner();
  const [a, b] = await add([{ studentName: 'An' }, { studentName: 'Bình' }]);
  assert.equal((await owner.post('/api/admin/crm/delete', { ids: [] })).status, 400);
  assert.deepEqual((await owner.post('/api/admin/crm/delete', { ids: [a.id, 'x', a.id] })).body.ids, [a.id]);
  assert.equal((await owner.get('/api/admin/crm')).body.contacts.length, 1);
  assert.deepEqual((await owner.get('/api/admin/crm/deleted')).body.contacts.map((c) => c.studentName), ['An']);
  // Dòng đã xóa không sửa được
  assert.equal((await cells([{ id: a.id, field: 'note', value: 'x' }])).body.errors.length, 1);

  const restored = await owner.post('/api/admin/crm/restore', { ids: [a.id, b.id] });
  assert.deepEqual(restored.body.contacts.map((c) => c.id), [a.id], 'chỉ khôi phục dòng đã xóa');
  assert.equal((await owner.get('/api/admin/crm')).body.contacts.length, 2);
  const actions = db.prepare(`SELECT action, detail FROM audit_log WHERE action IN ('crm_delete', 'crm_restore') ORDER BY id`).all();
  assert.deepEqual(actions.map((x) => x.action), ['crm_delete', 'crm_restore']);
  assert.match(actions[0].detail, /Xóa 1 khách hàng khỏi bảng CSKH: An/);
  await close();
});

test('Trạng thái tự thêm: không trùng, đổi tên (khách hàng đổi theo), chỉ xóa khi không còn ai dùng', async () => {
  const { owner, add, cells, close } = await setupOwner();
  const created = await owner.post('/api/admin/crm/statuses', { name: 'Tư vấn', color: 'purple' });
  assert.equal(created.status, 201);
  const st = created.body.statuses[0];
  assert.deepEqual([st.name, st.color, st.count], ['Tư vấn', 'purple', 0]);
  assert.equal((await owner.post('/api/admin/crm/statuses', { name: 'tu van' })).status, 409, 'trùng (không dấu)');
  assert.equal((await owner.post('/api/admin/crm/statuses', { name: 'ĐÃ CHỐT' })).status, 409, 'trùng trạng thái cố định');
  assert.equal((await owner.post('/api/admin/crm/statuses', { name: '  ' })).status, 400);

  const [a] = await add([{ studentName: 'An', status: 'tư vấn' }]);
  assert.equal(a.status, 'Tư vấn');
  const renamed = await owner.post(`/api/admin/crm/statuses/${st.id}/update`, { name: 'Đang tư vấn', color: 'teal' });
  assert.equal(renamed.body.renamed, 1);
  assert.equal((await owner.get('/api/admin/crm')).body.contacts[0].status, 'Đang tư vấn');
  assert.equal((await owner.post(`/api/admin/crm/statuses/${st.id}/update`, { name: 'Fail' })).status, 409);

  const blocked = await owner.post(`/api/admin/crm/statuses/${st.id}/delete`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /đang dùng cho 1 khách hàng/);
  await cells([{ id: a.id, field: 'status', value: '' }]);
  assert.equal((await owner.post(`/api/admin/crm/statuses/${st.id}/delete`)).body.statuses.length, 0);
  await close();
});

test('Thêm vào lớp: gắn học sinh vừa tạo, tự chuyển "Đã chốt"; SĐT đã là phụ huynh học sinh', async () => {
  const { owner, add, close } = await setupOwner();
  const cls = (await owner.post('/api/admin/classes', { name: 'TOEIC 550' })).body.class;
  const [c] = await add([{ studentName: 'Lê Chi', parentName: 'Phạm Mai', phone: '0901234567', idNumber: '079123456789', status: 'Đang chờ chốt' }]);
  const st = await owner.post(`/api/admin/classes/${cls.id}/students`, {
    students: [{ fullName: 'Lê Chi', parentName: 'Phạm Mai', parentPhone: '0901234567', parentIdNumber: '079123456789' }],
  });
  assert.equal(st.status, 201);
  assert.equal((await owner.post(`/api/admin/crm/${c.id}/enroll`, { classStudentId: 99999 })).status, 400);
  const r = await owner.post(`/api/admin/crm/${c.id}/enroll`, { classStudentId: st.body.ids[0] });
  assert.equal(r.status, 200);
  assert.equal(r.body.contact.status, 'Đã chốt');
  assert.deepEqual(
    { className: r.body.contact.enrolled.className, studentName: r.body.contact.enrolled.studentName, inactive: r.body.contact.enrolled.inactive },
    { className: 'TOEIC 550', studentName: 'Lê Chi', inactive: false }
  );
  const list = (await owner.get('/api/admin/crm')).body;
  assert.deepEqual(list.knownPhones['0901234567'], [{ studentId: st.body.ids[0], studentName: 'Lê Chi', className: 'TOEIC 550' }]);
  const h = (await owner.get(`/api/admin/crm/${c.id}/history`)).body;
  assert.ok(h.changes.some((x) => x.field === 'enroll' && x.newValue === 'TOEIC 550'));
  await close();
});

test('Tải Excel CSKH: đủ cột, SĐT giữ số 0, có trang thống kê', async () => {
  const { base, add, close } = await setupOwner();
  await add([
    { studentName: 'An', phone: '0901234567', contactDate: '2026-10-13', status: 'Đã chốt', tuition: 1500000, staff: 'Hương' },
    { studentName: 'Bình', contactDate: '2026-10-14', status: 'Fail', staff: 'Hương' },
  ]);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: testConfig.ownerUsername, password: testConfig.ownerPassword }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await fetch(`${base}/api/admin/crm/export`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const ws = wb.getWorksheet('CSKH');
  assert.deepEqual(ws.getRow(1).values.slice(1, 5), ['Học sinh', 'Phụ huynh', 'SĐT', 'CCCD']);
  assert.equal(ws.getRow(2).getCell(1).value, 'Bình', 'ngày mới nhất lên trước');
  assert.equal(ws.getRow(3).getCell(3).value, '0901234567');
  assert.equal(ws.getRow(3).getCell(8).value, 1500000);
  const stats = wb.getWorksheet('Thống kê');
  const text = [];
  stats.eachRow((row) => text.push(row.values.slice(1).join(' | ')));
  assert.ok(text.some((t) => t.startsWith('Hương | 2 | 1 | 0.5')), text.join('\n'));
  await close();
});
