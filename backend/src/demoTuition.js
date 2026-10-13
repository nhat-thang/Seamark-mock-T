// DỮ LIỆU MẪU học phí theo buổi — CHỈ để thử trên máy dev: `npm run demo:hoc-phi` (thêm `-- --reset` để làm lại từ đầu).
//
// An toàn (đã chốt: không được chạy trên database thật):
// - Luôn ghi vào database RIÊNG: <thư mục dự án>/data-demo/toeic.sqlite (không dùng DATA_DIR trong .env).
// - Từ chối chạy khi NODE_ENV=production, khi database mẫu trùng database thật, hoặc khi database mẫu đã có lớp
//   (trừ khi có --reset: chỉ xóa đúng file trong data-demo/).
// Chạy web với dữ liệu mẫu: đặt DATA_DIR=./data-demo khi chạy backend (xem CLAUDE.md).
//
// Tạo 5 lớp (ngày tính theo hôm nay, giờ Việt Nam; buổi đã qua / sắp tới đếm từ hôm qua / ngày mai):
//  1. TOEIC 550 K12  — kì 8 buổi, còn 3 buổi hết kì -> cảnh báo VÀNG; đã thu / chưa thu / nợ kì trước, giảm giá,
//                      học sinh vào giữa kì, học sinh thiếu thông tin phụ huynh.
//  2. IELTS Nền tảng — kì 36 buổi, kì 1 đã thu hết, kì 2 hạn tháng sau -> tháng này "Chưa đến hạn".
//  3. Tiếng Anh Thiếu nhi — 2 giáo viên, vừa sang kì 2 mà chưa đóng -> ĐỎ; học sinh vào giữa kì; một học sinh đã tắt cảnh báo.
//  4. TOEIC 750 Cấp tốc — còn 1 buổi hết kì -> CAM (một học sinh đã đóng trước).
//  5. Ngữ pháp cơ bản — kì 8 buổi mà lịch mới xếp 6 buổi -> chưa thu được, nhắc "mới xếp 6/8 buổi".
//  6. Luyện nói (chưa cài học phí).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { openDb } = require('./db');
const { runMigrations } = require('./db/migrate');
const { seed } = require('./seed');
const { hashPasswordSync } = require('./auth/password');
const { vnDate, toInstant, addDays, weekdayOf } = require('./classes/time');
const { classTuition } = require('./classes/tuitionData');
const { loadStudents } = require('./classes/students');

const DEMO_DIR = path.join(config.rootDir, 'data-demo');
const DEMO_DB = path.join(DEMO_DIR, 'toeic.sqlite');

function fail(msg) {
  console.error(`\n[KHÔNG CHẠY] ${msg}\n`);
  process.exit(1);
}

if (config.isProduction || process.env.NODE_ENV === 'production') fail('Đang ở môi trường production (NODE_ENV=production). Dữ liệu mẫu chỉ dùng trên máy dev.');
if (path.resolve(DEMO_DB) === path.resolve(config.dbFile)) fail('Database mẫu trùng với database thật (DATA_DIR đang trỏ vào data-demo). Hãy bỏ DATA_DIR rồi chạy lại.');

const reset = process.argv.includes('--reset');
fs.mkdirSync(DEMO_DIR, { recursive: true });
if (reset) {
  for (const f of ['toeic.sqlite', 'toeic.sqlite-wal', 'toeic.sqlite-shm']) fs.rmSync(path.join(DEMO_DIR, f), { force: true });
}

const db = openDb(DEMO_DB);
runMigrations(db, { log: () => {} });
if (db.prepare('SELECT COUNT(*) AS n FROM classes').get().n > 0) {
  fail(`Database mẫu ${DEMO_DB} đã có lớp học. Muốn làm lại từ đầu: npm run demo:hoc-phi -- --reset`);
}
seed(db, { ...config, ownerUsername: config.ownerUsername || 'owner', ownerPassword: config.ownerPassword || 'matkhau-owner' }, () => {});

const now = Date.now();
const nowIso = new Date(now).toISOString();
const today = vnDate(now);
const owner = db.prepare("SELECT id FROM admins WHERE role = 'owner' LIMIT 1").get().id;

function teacher(username, displayName, password) {
  const row = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (row) return row.id;
  return db
    .prepare("INSERT INTO admins (username, display_name, password_hash, role, is_active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)")
    .run(username, displayName, hashPasswordSync(password), nowIso).lastInsertRowid;
}
const lan = teacher('lan', 'Cô Lan', 'matkhau-lan');
const minh = teacher('minh', 'Thầy Minh', 'matkhau-minh');

// Số giả ổn định theo thứ tự (không phải số thật của ai)
let seq = 0;
const fakePhone = () => `09${String(10000000 + (seq * 7919) % 90000000).padStart(8, '0')}`;
const fakeId = () => `0792${String(10000000 + (seq * 104729) % 90000000).padStart(8, '0')}`;

function makeClass({ name, color, cycle, price, teachers }) {
  const id = db
    .prepare('INSERT INTO classes (name, color, note, cycle_sessions, price_per_session, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, color, 'Lớp mẫu để thử tính năng học phí', cycle, price, owner, nowIso, nowIso).lastInsertRowid;
  for (const t of teachers) db.prepare('INSERT OR IGNORE INTO class_teachers (class_id, admin_id) VALUES (?, ?)').run(id, t);
  return db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
}

/**
 * Xếp lịch vào các thứ trong tuần: `passed` buổi đã qua (tính lùi từ hôm qua) + `future` buổi sắp tới (từ ngày mai).
 * Bỏ qua hôm nay để số buổi đã qua không phụ thuộc giờ chạy script.
 */
function schedule(cls, { weekdays, start, end, passed, future, teachers }) {
  const dates = [];
  for (let d = addDays(today, -1); dates.length < passed; d = addDays(d, -1)) if (weekdays.includes(weekdayOf(d))) dates.unshift(d);
  for (let d = addDays(today, 1); dates.length < passed + future; d = addDays(d, 1)) if (weekdays.includes(weekdayOf(d))) dates.push(d);
  const ids = [];
  const created = new Date(Date.parse(toInstant(dates[0], '00:00')) - 86400000).toISOString(); // xếp từ trước ngày học
  for (const d of dates) {
    const sid = db
      .prepare(
        `INSERT INTO class_sessions (class_id, date, start_time, end_time, starts_at, ends_at, teacher_admin_id, teacher_name, room, note,
                                     created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', 'P.2', '', ?, ?, ?)`
      )
      .run(cls.id, d, start, end, toInstant(d, start), toInstant(d, end), teachers[0] ?? null, owner, created, created).lastInsertRowid;
    for (const t of teachers) db.prepare('INSERT INTO session_teachers (session_id, admin_id) VALUES (?, ?)').run(sid, t);
    ids.push(sid);
  }
  return db.prepare('SELECT * FROM class_sessions WHERE class_id = ? ORDER BY starts_at').all(cls.id);
}

function addStudent(cls, fullName, sessionsList, startNo, { discount = 0, discountNote = '', missing = false, note = '' } = {}) {
  seq += 1;
  const start = sessionsList[startNo - 1];
  return db
    .prepare(
      `INSERT INTO class_students (class_id, full_name, parent_name, phone, parent_id_number, note, discount_percent, discount_note,
                                   start_at, joined_on, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cls.id, fullName, missing ? '' : `Phụ huynh ${fullName.split(' ').at(-1)}`, missing ? '' : fakePhone(), missing ? '' : fakeId(), note,
      discount, discountNote, start.starts_at, start.date, owner, nowIso, nowIso).lastInsertRowid;
}

/** Điểm danh các buổi đã qua (có vài buổi vắng) */
function attendance(cls, sessionsList) {
  const students = db.prepare('SELECT id, start_at FROM class_students WHERE class_id = ?').all(cls.id);
  for (const [i, s] of sessionsList.entries()) {
    if (Date.parse(s.ends_at) > now) break;
    for (const st of students) {
      if (st.start_at > s.starts_at) continue;
      const r = (st.id * 31 + i * 17) % 23;
      const status = r === 0 ? 'absent' : r === 1 ? 'excused' : r === 2 ? 'late' : 'present';
      db.prepare('INSERT INTO attendance (session_id, student_id, status, bonus, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        s.id, st.id, status, r % 5 === 0 ? 1 : 0, lan, s.ends_at
      );
    }
    db.prepare('UPDATE class_sessions SET started_at = ?, attendance_at = ?, attendance_by = ? WHERE id = ?').run(s.starts_at, s.ends_at, lan, s.id);
  }
}

/** Ghi "Đã thu" cho các kì (theo đúng cách web tính) */
function pay(cls, studentId, cycleNos, method = 'cash') {
  const students = loadStudents(db, cls);
  const { map, tl } = classTuition(db, cls, students, now);
  const t = map.get(studentId);
  const st = students.find((s) => s.id === studentId);
  for (const k of cycleNos) {
    const cy = t.cycles.find((c) => c.cycleNo === k);
    if (!cy) continue;
    const paidOn = cy.dueDate < today ? cy.dueDate : today;
    db.prepare(
      `INSERT INTO tuition_payments (student_id, cycle_no, session_count, due_amount, amount, price_per_session, discount_percent,
                                     session_ids, paid_on, method, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
    ).run(studentId, k, cy.sessionCount, cy.amount, cy.amount, tl.pricePerSession, st.discountPercent, JSON.stringify(cy.sessions.map((s) => s.id)),
      paidOn, method, owner, nowIso);
    db.prepare(
      "INSERT INTO tuition_events (student_id, cycle_no, action, amount, paid_on, method, note, created_by, created_at) VALUES (?, ?, 'pay', ?, ?, ?, '', ?, ?)"
    ).run(studentId, k, cy.amount, paidOn, method, owner, nowIso);
  }
}

function snooze(studentId, cycleNo) {
  db.prepare('INSERT INTO tuition_alert_snoozes (student_id, cycle_no, created_by, created_at) VALUES (?, ?, ?, ?)').run(studentId, cycleNo, owner, nowIso);
  db.prepare("INSERT INTO tuition_events (student_id, cycle_no, action, note, created_by, created_at) VALUES (?, ?, 'snooze', 'Phụ huynh hẹn cuối tháng', ?, ?)").run(
    studentId, cycleNo, owner, nowIso
  );
}

db.transaction(() => {
  // 1. TOEIC 550 K12: T2-T4-T6, kì 8 buổi. Đã qua 13 buổi -> đang ở kì 2, còn 3 buổi -> kì 3 chưa đóng là VÀNG.
  const c1 = makeClass({ name: 'TOEIC 550 K12', color: 'teal', cycle: 8, price: 150000, teachers: [lan] });
  const s1 = schedule(c1, { weekdays: [1, 3, 5], start: '18:00', end: '19:30', passed: 13, future: 11, teachers: [lan] });
  const an = addStudent(c1, 'Nguyễn Văn An', s1, 1);
  const binh = addStudent(c1, 'Trần Thị Bình', s1, 1, { discount: 10, discountNote: 'Anh em học cùng trung tâm' });
  const chau = addStudent(c1, 'Lê Minh Châu', s1, 1);
  const huy = addStudent(c1, 'Phạm Gia Huy', s1, 6, { note: 'Vào học giữa kì 1 (từ buổi 6)' });
  addStudent(c1, 'Đỗ Ngọc Linh', s1, 1, { missing: true, note: 'Nhập từ Excel, chưa có thông tin phụ huynh' });
  attendance(c1, s1);
  pay(c1, an, [1, 2, 3], 'transfer'); // đóng trước cả kì 3
  pay(c1, binh, [1, 2]);
  pay(c1, chau, [1]); // còn nợ kì 2
  pay(c1, huy, [1, 2]);

  // 2. IELTS Nền tảng: kì 36 buổi (3 buổi / tuần ~ 12 tuần), kì 1 đã thu, kì 2 hạn tháng sau -> "Chưa đến hạn"
  const c2 = makeClass({ name: 'IELTS Nền tảng', color: 'purple', cycle: 36, price: 200000, teachers: [minh] });
  const s2 = schedule(c2, { weekdays: [2, 4, 6], start: '19:00', end: '20:30', passed: 18, future: 54, teachers: [minh] });
  const ielts = ['Vũ Hoàng Nam', 'Bùi Thanh Mai', 'Hoàng Quốc Bảo'].map((n) => addStudent(c2, n, s2, 1));
  attendance(c2, s2);
  for (const id of ielts) pay(c2, id, [1], 'transfer');

  // 3. Tiếng Anh Thiếu nhi: 2 giáo viên dạy cùng, T3-T7, kì 8 buổi. Đã qua 9 buổi -> vừa sang kì 2, chưa đóng là ĐỎ.
  const c3 = makeClass({ name: 'Tiếng Anh Thiếu nhi', color: 'orange', cycle: 8, price: 120000, teachers: [lan, minh] });
  const s3 = schedule(c3, { weekdays: [2, 6], start: '17:00', end: '18:00', passed: 9, future: 7, teachers: [lan, minh] });
  const ngoc = addStudent(c3, 'Ngô Bảo Ngọc', s3, 1);
  const khang = addStudent(c3, 'Đặng Minh Khang', s3, 1);
  const han = addStudent(c3, 'Trịnh Gia Hân', s3, 4, { note: 'Vào học giữa kì (từ buổi 4)' });
  const kiet = addStudent(c3, 'Lý Tuấn Kiệt', s3, 1, { discount: 20, discountNote: 'Con giáo viên' });
  attendance(c3, s3);
  pay(c3, ngoc, [1]);
  pay(c3, han, [1]);
  pay(c3, khang, [1]);
  pay(c3, kiet, [1, 2]);
  snooze(khang, 2); // Khang: chưa đóng kì 2 nhưng admin chính đã tắt cảnh báo

  // 4. TOEIC 750 Cấp tốc: kì 10 buổi, đã qua 9 -> còn 1 buổi -> kì 2 chưa đóng là CAM
  const c4 = makeClass({ name: 'TOEIC 750 Cấp tốc', color: 'blue', cycle: 10, price: 180000, teachers: [minh] });
  const s4 = schedule(c4, { weekdays: [1, 2, 3, 4, 5], start: '07:00', end: '08:30', passed: 9, future: 11, teachers: [minh] });
  const fast = ['Mai Anh Thư', 'Cao Đức Long', 'Tạ Phương Vy'].map((n) => addStudent(c4, n, s4, 1));
  attendance(c4, s4);
  for (const id of fast) pay(c4, id, [1]);
  pay(c4, fast[0], [2]); // Thư đã đóng trước kì 2

  // 5. Ngữ pháp cơ bản: kì 8 buổi nhưng mới xếp 6 buổi -> nhắc admin chính xếp tiếp lịch
  const c5 = makeClass({ name: 'Ngữ pháp cơ bản', color: 'green', cycle: 8, price: 100000, teachers: [lan] });
  const s5 = schedule(c5, { weekdays: [2, 5], start: '18:00', end: '19:00', passed: 5, future: 1, teachers: [lan] });
  ['Hồ Thị Lan Anh', 'Kiều Văn Tú'].forEach((n) => addStudent(c5, n, s5, 1));
  attendance(c5, s5);

  // 6. Luyện nói: chưa cài học phí
  const c6 = makeClass({ name: 'Luyện nói buổi tối', color: 'pink', cycle: null, price: null, teachers: [lan] });
  const s6 = schedule(c6, { weekdays: [3], start: '20:00', end: '21:00', passed: 1, future: 3, teachers: [lan] });
  addStudent(c6, 'Phan Thu Trang', s6, 1);
  attendance(c6, s6);
})();

db.close();
console.log(`Đã tạo dữ liệu mẫu học phí trong ${DEMO_DB}`);
console.log('Đăng nhập: admin chính (theo .env, hoặc owner / matkhau-owner) · Cô Lan: lan / matkhau-lan · Thầy Minh: minh / matkhau-minh');
console.log('Chạy web với dữ liệu mẫu: DATA_DIR=./data-demo npm start (trong thư mục backend)');
