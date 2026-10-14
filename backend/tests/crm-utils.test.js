// Test các hàm của bảng CSKH ở trình duyệt (frontend/src/utils/crm.js — JavaScript thuần nên test được ở đây):
// đọc ngày / học phí gõ tay, chép / dán kiểu Excel, đoán cột khi dán cả bảng, lọc / sắp xếp, cảnh báo SĐT.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'crm.js')).href);
const TODAY = '2026-10-14';

test('Đọc ngày gõ tay: dd/mm/yyyy, dd/mm (năm nay), chữ "hôm nay", "+3", kiểu Mỹ khi rõ ràng', async () => {
  const { parseDateInput } = await load();
  const v = (t) => parseDateInput(t, TODAY).value;
  assert.equal(v('13/10/2026'), '2026-10-13');
  assert.equal(v('3/1/2027'), '2027-01-03');
  assert.equal(v('13-10-26'), '2026-10-13');
  assert.equal(v('13.10'), '2026-10-13');
  assert.equal(v('13 10'), '2026-10-13');
  assert.equal(v('ngày 13 tháng 10 năm 2026'), '2026-10-13');
  assert.equal(v('2026-10-13'), '2026-10-13');
  assert.equal(v('10/13/2026'), '2026-10-13', 'kiểu Mỹ (tháng/ngày) khi số thứ hai > 12');
  assert.equal(v('Hôm nay'), TODAY);
  assert.equal(v('mai'), '2026-10-15');
  assert.equal(v('hôm qua'), '2026-10-13');
  assert.equal(v('+3'), '2026-10-17');
  assert.equal(v('+1 tuần'), '2026-10-21');
  assert.equal(v('+1 tháng'), '2026-11-14');
  assert.equal(parseDateInput('+1 tháng', '2026-01-31').value, '2026-02-28', 'tháng sau không có ngày 31');
  assert.equal(v('46308'), '2026-10-13', 'số ngày kiểu Excel');
  assert.equal(v(''), null);
  assert.equal(v('   '), null);
  assert.ok(parseDateInput('30/02/2026', TODAY).error, 'ngày không có thật');
  assert.ok(parseDateInput('abc', TODAY).error);
  assert.ok(parseDateInput('13/13/2026', TODAY).error);
});

test('Đọc học phí: có dấu chấm, phẩy, "tr", "k", "triệu", "củ", chữ đ', async () => {
  const { parseMoneyInput } = await load();
  const v = (t) => parseMoneyInput(t).value;
  assert.equal(v('1500000'), 1500000);
  assert.equal(v('1.500.000'), 1500000);
  assert.equal(v('1,500,000'), 1500000);
  assert.equal(v('1.500.000đ'), 1500000);
  assert.equal(v('1.500.000 VNĐ'), 1500000);
  assert.equal(v('1tr5'), 1500000);
  assert.equal(v('2tr'), 2000000);
  assert.equal(v('2tr250'), 2250000);
  assert.equal(v('1.5tr'), 1500000);
  assert.equal(v('1,5 triệu'), 1500000);
  assert.equal(v('800k'), 800000);
  assert.equal(v('800 nghìn'), 800000);
  assert.equal(v('2 củ'), 2000000);
  assert.equal(v(''), null);
  assert.ok(parseMoneyInput('1.5').error, 'không rõ là 1,5 hay 15');
  assert.ok(parseMoneyInput('abc').error);
  assert.ok(parseMoneyInput('5000tr').error, 'quá 1 tỷ');
});

test('Chép ra Excel và dán vào: Tab / xuống dòng / dấu " trong ô', async () => {
  const { toTsv, parseTsv } = await load();
  const grid = [['Nguyễn An', 'Gọi lần 1\nGọi lần 2', 'Mẹ "Lan"'], ['', '0901234567', '']];
  const text = toTsv(grid);
  assert.equal(text, 'Nguyễn An\t"Gọi lần 1\nGọi lần 2"\t"Mẹ ""Lan"""\r\n\t0901234567\t');
  assert.deepEqual(parseTsv(text), grid);
  // Excel luôn thêm xuống dòng ở cuối; dòng trống cuối bị bỏ
  assert.deepEqual(parseTsv('A\tB\r\nC\tD\r\n\r\n'), [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(parseTsv('một ô'), [['một ô']]);
  assert.deepEqual(parseTsv(''), []);
  // Chữ tình cờ bắt đầu bằng dấu " (không phải ô bọc "") vẫn giữ nguyên
  assert.deepEqual(parseTsv('"Bé" Na\tx'), [['"Bé" Na', 'x']]);
});

test('Dán cả bảng Excel kèm dòng tên cột: đoán đúng cột, cột lạ bỏ qua, ngày / tiền sai ghi vào Ghi chú', async () => {
  const { detectHeader, rowToContact, guessField } = await load();
  const rows = [
    ['STT', 'Họ tên HS', 'Tên PH', 'Số điện thoại', 'CCCD/CMND', 'Ngày tư vấn', 'Tình trạng', 'Học phí dự kiến', 'Hẹn gọi lại', 'Ghi chú'],
    ['1', 'Nguyễn An', 'Trần Lan', '0901234567', '079123456789', '13/10/2026', 'chốt', '1tr5', 'mai', 'Muốn học tối'],
    ['2', 'Lê Bình', '', '912345678', '', 'tuần sau', 'Đang chờ', 'liên hệ', '', ''],
  ];
  const mapping = detectHeader(rows);
  assert.deepEqual(mapping, [null, 'studentName', 'parentName', 'phone', 'idNumber', 'contactDate', 'status', 'tuition', 'followUp', 'note']);
  const a = rowToContact(rows[1], mapping, TODAY);
  assert.deepEqual(a.contact, {
    studentName: 'Nguyễn An', parentName: 'Trần Lan', phone: '0901234567', idNumber: '079123456789', contactDate: '2026-10-13',
    status: 'chốt', tuition: 1500000, followUp: '2026-10-15', note: 'Muốn học tối',
  });
  const b = rowToContact(rows[2], mapping, TODAY);
  assert.equal(b.contact.contactDate, undefined);
  assert.equal(b.contact.tuition, undefined);
  assert.equal(b.contact.note, 'Ngày CSKH: tuần sau\nHọc phí: liên hệ');
  assert.equal(b.warnings.length, 2);
  // Dòng dữ liệu thường không bị nhầm là dòng tên cột
  assert.equal(detectHeader([['Nguyễn An', 'Trần Lan', '0901234567']]), null);
  assert.equal(detectHeader([['Bé Bình', 'Mẹ Lan']]), null);
  assert.equal(guessField('Họ và tên'), 'studentName');
  assert.equal(guessField('Tên bố/mẹ'), 'parentName');
  assert.equal(guessField('SĐT Zalo'), 'phone');
  assert.equal(guessField('Ngày hẹn'), 'followUp');
  assert.equal(guessField('NV CSKH'), 'staff');
  assert.equal(guessField('STT'), null);
});

test('Lọc theo trạng thái / cần gọi lại / tìm kiếm; sắp xếp theo ngày (ô trống cuối)', async () => {
  const { computeView, NO_STATUS } = await load();
  const contacts = [
    { id: 1, studentName: 'Nguyễn An', phone: '0901234567', contactDate: '2026-10-10', status: 'Đã chốt', followUp: null },
    { id: 2, studentName: 'Lê Bình', phone: '0912345678', contactDate: '2026-10-12', status: 'Đang chờ chốt', followUp: '2026-10-14' },
    { id: 3, studentName: 'Trần Chi', parentName: 'Phạm Mai', contactDate: null, status: '', followUp: '2026-10-20', note: 'Ở gần trung tâm' },
    { id: 4, studentName: 'Đỗ Dũng', contactDate: '2026-10-12', status: 'Fail', followUp: '2026-10-01' },
  ];
  const view = (filter, sort = { key: 'contactDate', dir: 'desc' }) =>
    computeView(contacts, { status: '', followUp: false, search: '', ...filter }, sort, TODAY);
  assert.deepEqual(view({}), [4, 2, 1, 3], 'mới nhất trước, cùng ngày thì thêm sau lên trước, chưa có ngày ở cuối');
  assert.deepEqual(view({}, { key: 'contactDate', dir: 'asc' }), [1, 2, 4, 3]);
  assert.deepEqual(view({ status: 'Đã chốt' }), [1]);
  assert.deepEqual(view({ status: NO_STATUS }), [3]);
  assert.deepEqual(view({ followUp: true }), [4, 2], 'hẹn hôm nay hoặc đã quá hẹn');
  assert.deepEqual(view({ search: 'nguyen' }), [1]);
  assert.deepEqual(view({ search: 'mai' }), [3], 'tìm cả tên phụ huynh');
  assert.deepEqual(view({ search: '0912 345' }), [2], 'gõ số thì tìm theo SĐT');
  assert.deepEqual(view({}, { key: 'studentName', dir: 'asc' }), [1, 2, 3, 4], 'tên xếp theo chữ cuối: An, Bình, Chi, Dũng');
});

test('Cảnh báo SĐT / CCCD: sai mẫu, trùng khách hàng khác, đã là phụ huynh học sinh', async () => {
  const { computeWarnings } = await load();
  const contacts = [
    { id: 1, studentName: 'An', phone: '0901234567', idNumber: '079123456789' },
    { id: 2, studentName: 'Bình', phone: '0901234567 / 0912345678', idNumber: '079123456789' },
    { id: 3, studentName: 'Chi', phone: '12345', idNumber: '123' },
    { id: 4, studentName: 'Dũng', phone: '0987654321', enrolled: null },
    { id: 5, studentName: 'Em', phone: '0977777777', enrolled: { studentId: 9 } },
  ];
  const known = { '0987654321': [{ studentId: 8, studentName: 'Hà', className: 'TOEIC 550' }], '0977777777': [{ studentId: 9, studentName: 'Em', className: 'Lớp A' }] };
  const w = computeWarnings(contacts, known);
  assert.equal(w.get(1).phone.tone, 'dup');
  assert.match(w.get(1).phone.text, /trùng với: Bình/);
  assert.equal(w.get(2).idNumber.tone, 'dup');
  assert.equal(w.get(3).phone.tone, 'error');
  assert.equal(w.get(3).idNumber.tone, 'error');
  assert.equal(w.get(4).phone.tone, 'known');
  assert.match(w.get(4).phone.text, /Hà \(lớp TOEIC 550\)/);
  assert.equal(w.has(5), false, 'chính học sinh đã thêm từ dòng này thì không cảnh báo');
});

test('Ô trạng thái: gợi ý theo chữ đã gõ, thêm trạng thái mới khi chưa có', async () => {
  const { statusOptions, allStatuses } = await load();
  const statuses = allStatuses([{ id: 1, name: 'Đã cọc', color: 'blue' }]);
  assert.deepEqual(statusOptions(statuses, 'da').map((o) => [o.kind, o.name]), [
    ['status', 'Đã chốt'], ['status', 'Đang chờ chốt'], ['status', 'Đã cọc'], ['new', 'da'],
  ]);
  assert.deepEqual(statusOptions(statuses, 'coc').map((o) => o.name), ['Đã cọc', 'coc']);
  // Gõ "chờ" (có dấu) / "cho" (không dấu): "Đang chờ chốt" lên đầu, không chọn nhầm "Đã chốt"
  assert.equal(statusOptions(statuses, 'chờ')[0].name, 'Đang chờ chốt');
  assert.equal(statusOptions(statuses, 'cho')[0].name, 'Đang chờ chốt');
  assert.equal(statusOptions(statuses, 'chốt')[0].name, 'Đã chốt');
  assert.equal(statusOptions(statuses, 'đã c')[0].name, 'Đã chốt');
  assert.deepEqual(statusOptions(statuses, 'f').map((o) => o.name), ['Fail', 'f'], 'chỉ trạng thái có chữ đã gõ');
  assert.deepEqual(statusOptions(statuses, 'hẹn test').map((o) => [o.kind, o.name]), [['new', 'hẹn test']]);
  assert.equal(statusOptions(statuses, 'fail').at(-1).kind, 'status', 'gõ đúng tên thì không hiện "thêm mới"');
  assert.equal(statusOptions(statuses, '').at(-1).kind, 'clear');
});
