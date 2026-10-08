// Lệnh seed: `npm run seed`
// - Tạo tài khoản admin chính (owner) từ OWNER_USERNAME / OWNER_PASSWORD / OWNER_DISPLAY_NAME trong .env
// - Tạo 2 đề mẫu đã xuất bản để thử giao diện
// Chạy nhiều lần không bị trùng: cái gì đã có thì bỏ qua.
const { hashPasswordSync } = require('./auth/password');

// Cấu trúc chuẩn TOEIC Listening + Reading: part -> [từ câu, đến câu]
const TOEIC_PARTS = [
  { part: 1, from: 1, to: 6 },
  { part: 2, from: 7, to: 31 },
  { part: 3, from: 32, to: 70 },
  { part: 4, from: 71, to: 100 },
  { part: 5, from: 101, to: 130 },
  { part: 6, from: 131, to: 146 },
  { part: 7, from: 147, to: 200 },
];

/** Tạo một câu trắc nghiệm giả (chỉ để thử giao diện). */
function sampleQuestion(no, part) {
  const choices = part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  const options = {};
  for (const c of choices) options[c] = `Lựa chọn ${c} của câu ${no}`;
  return {
    no,
    part,
    type: 'mcq', // để sau này thêm loại câu khác (tự luận, ghi âm...)
    groupCode: null,
    question: part === 1 || part === 2 ? '' : `Câu hỏi mẫu số ${no}`,
    options,
    answer: choices[no % choices.length],
    image: null,
    explanation: '',
  };
}

/** Tạo nội dung đề mẫu gồm các câu thuộc những Part được chọn. */
function buildSampleContent(parts) {
  const questions = [];
  for (const p of TOEIC_PARTS) {
    if (!parts.includes(p.part)) continue;
    for (let no = p.from; no <= p.to; no++) questions.push(sampleQuestion(no, p.part));
  }
  return { examType: 'TOEIC_LR', audio: { full: null, parts: {} }, groups: [], questions };
}

const SAMPLE_EXAMS = [
  {
    code: 'DE-MAU-1',
    title: 'Đề mẫu 1',
    durationMinutes: 120,
    note: 'Đề mẫu tạo bởi lệnh seed (đủ 200 câu, nội dung giả).',
    showAnswersAfter: true,
    content: buildSampleContent([1, 2, 3, 4, 5, 6, 7]),
  },
  {
    code: 'DE-MAU-2',
    title: 'Đề mẫu 2',
    durationMinutes: 20,
    note: 'Đề mẫu tạo bởi lệnh seed (chỉ Part 5, nội dung giả).',
    showAnswersAfter: true,
    content: buildSampleContent([5]),
  },
  // Đề thật: Reading Part 5–7, có đáp án và giải thích (xem src/seed-data/reading-01.js)
  require('./seed-data/reading-01'),
];

function seedOwner(db, { username: rawUsername, password, displayName }, log) {
  // Tên đăng nhập luôn lưu chữ thường (lúc đăng nhập cũng đổi về chữ thường)
  const username = String(rawUsername || '').trim().toLowerCase();
  if (!username || !password) {
    throw new Error('Thiếu OWNER_USERNAME hoặc OWNER_PASSWORD trong file .env');
  }
  const name = String(displayName || '').trim() || 'Admin chính';

  const existing = db.prepare('SELECT id, display_name FROM admins WHERE username = ?').get(username);
  if (existing) {
    // Không đụng tới mật khẩu (có thể admin đã tự đổi trên web), chỉ cập nhật tên hiển thị
    if (existing.display_name !== name) {
      db.prepare('UPDATE admins SET display_name = ? WHERE id = ?').run(name, existing.id);
      log(`- Tài khoản "${username}" đã có, cập nhật tên hiển thị thành "${name}".`);
    } else {
      log(`- Tài khoản "${username}" đã có, bỏ qua.`);
    }
    log('  (Mật khẩu KHÔNG đổi theo OWNER_PASSWORD trong .env. Muốn đặt lại mật khẩu: npm run reset-password -- <tên đăng nhập> <mật khẩu mới>)');
    return existing.id;
  }
  const weak = password === 'doi-mat-khau-nay' || password.length < 8;
  if (weak && process.env.NODE_ENV === 'production') {
    throw new Error('OWNER_PASSWORD trong .env đang là mật khẩu mặc định hoặc ngắn hơn 8 ký tự. Hãy đặt mật khẩu mạnh rồi chạy lại.');
  }
  if (weak) {
    log('  [cảnh báo] Mật khẩu admin chính trong .env là mật khẩu mặc định / quá ngắn. Hãy đổi trước khi đưa lên mạng!');
  }
  const hash = hashPasswordSync(password);
  const info = db
    .prepare(
      `INSERT INTO admins (username, password_hash, display_name, role)
       VALUES (?, ?, ?, 'owner')`
    )
    .run(username, hash, name);
  log(`- Đã tạo tài khoản admin chính "${username}" (${name}).`);
  return info.lastInsertRowid;
}

function seedSampleExams(db, ownerId, log) {
  const findExam = db.prepare('SELECT id FROM exams WHERE code = ?');
  const insertExam = db.prepare(
    `INSERT INTO exams (code, title, duration_minutes, internal_note, show_answers_after, status, draft_json, updated_by)
     VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`
  );
  const insertVersion = db.prepare(
    `INSERT INTO exam_versions (exam_id, version_no, title, duration_minutes, question_count, content_json, published_by,
                                show_answers_after, source_version)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1)`
  );
  const linkVersion = db.prepare('UPDATE exams SET published_version_id = ? WHERE id = ?');

  for (const ex of SAMPLE_EXAMS) {
    if (findExam.get(ex.code)) {
      log(`- Đề "${ex.title}" đã có, bỏ qua.`);
      continue;
    }
    const json = JSON.stringify(ex.content);
    // Tạo đề + bản xuất bản trong cùng một transaction
    db.transaction(() => {
      const examId = insertExam.run(
        ex.code, ex.title, ex.durationMinutes, ex.note, ex.showAnswersAfter ? 1 : 0, json, ownerId
      ).lastInsertRowid;
      const versionId = insertVersion.run(
        examId, ex.title, ex.durationMinutes, ex.content.questions.length, json, ownerId, ex.showAnswersAfter ? 1 : 0
      ).lastInsertRowid;
      linkVersion.run(versionId, examId);
    })();
    log(`- Đã tạo "${ex.title}" (${ex.content.questions.length} câu, ${ex.durationMinutes} phút).`);
  }
}

function seed(db, config, log = console.log) {
  const ownerId = seedOwner(
    db,
    { username: config.ownerUsername, password: config.ownerPassword, displayName: config.ownerDisplayName },
    log
  );
  seedSampleExams(db, ownerId, log);
}

module.exports = { seed, buildSampleContent };

// Chạy trực tiếp bằng `node src/seed.js`
if (require.main === module) {
  const config = require('./config');
  const { openDb } = require('./db');
  const { runMigrations } = require('./db/migrate');

  try {
    const db = openDb(config.dbFile);
    runMigrations(db);
    console.log(`Database: ${config.dbFile}`);
    seed(db, config);
    db.close();
    console.log('Seed xong.');
  } catch (err) {
    console.error('Seed thất bại:', err.message);
    process.exit(1);
  }
}
