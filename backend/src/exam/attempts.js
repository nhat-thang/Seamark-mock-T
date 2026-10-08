// Xử lý lượt làm bài: đọc, chốt bài (nộp), tự nộp khi hết giờ.
const { gradeAttempt } = require('./grading');
const { withFileUrls } = require('./files');
const { orderedQuestions } = require('./content');
const { partsOf } = require('./parts');

// Sau giờ hết hạn vẫn nhận thêm vài giây cho request đang trên đường tới server (mạng chậm)
const GRACE_MS = 5000;

const nowIso = () => new Date().toISOString();

/** Đọc một lượt làm bài kèm thông tin đề (bản xuất bản mà lượt này đang làm). */
function getAttempt(db, attemptId) {
  const row = db
    .prepare(
      `SELECT a.*, v.title AS exam_title, v.duration_minutes, v.content_json,
              v.show_answers_after, v.allow_seek_audio,
              s.last_name, s.first_name
         FROM attempts a
         JOIN exam_versions v ON v.id = a.exam_version_id
         JOIN students s ON s.id = a.student_id
        WHERE a.id = ?`
    )
    .get(attemptId);
  if (!row) return null;
  row.content = JSON.parse(row.content_json);
  row.answers = JSON.parse(row.answers_json || '{}');
  row.flagged = JSON.parse(row.flagged_json || '[]');
  row.order = row.question_order ? JSON.parse(row.question_order) : null; // thứ tự câu khi đề xáo trộn
  return row;
}

/** Đã quá giờ (kể cả thời gian du di) chưa? */
function isPastDeadline(attempt, graceMs = 0) {
  return Date.now() > Date.parse(attempt.deadline_at) + graceMs;
}

/**
 * Chốt bài: chấm điểm và chuyển sang "submitted".
 * auto = true khi hệ thống tự nộp lúc hết giờ: thời điểm nộp ghi bằng giờ hết hạn.
 */
function finalizeAttempt(db, attempt, { auto = false } = {}) {
  const r = gradeAttempt(attempt.content, attempt.answers);
  const submittedAt = auto ? attempt.deadline_at : nowIso();
  db.prepare(
    `UPDATE attempts
        SET status = 'submitted', submitted_at = ?,
            listening_correct = ?, reading_correct = ?,
            listening_score = ?, reading_score = ?, total_score = ?,
            correct_count = ?, question_total = ?, score10 = ?
      WHERE id = ? AND status = 'in_progress'`
  ).run(
    submittedAt, r.listeningCorrect, r.readingCorrect, r.listeningScore, r.readingScore, r.totalScore,
    r.correct, r.total, r.score10, attempt.id
  );
  return getAttempt(db, attempt.id);
}

/** Tự nộp mọi lượt đã hết giờ mà học viên chưa nộp (ví dụ đóng trình duyệt giữa chừng). */
function finalizeExpiredAttempts(db) {
  const limit = new Date(Date.now() - GRACE_MS).toISOString();
  const ids = db
    .prepare(`SELECT id FROM attempts WHERE status = 'in_progress' AND deadline_at < ?`)
    .all(limit)
    .map((r) => r.id);
  for (const id of ids) finalizeAttempt(db, getAttempt(db, id), { auto: true });
  return ids.length;
}

/** Lưu câu trả lời + danh sách câu đánh dấu. */
function saveAnswers(db, attemptId, answers, flagged) {
  db.prepare('UPDATE attempts SET answers_json = ?, flagged_json = ? WHERE id = ? AND status = ?').run(
    JSON.stringify(answers), JSON.stringify(flagged), attemptId, 'in_progress'
  );
}

/**
 * Kết quả gửi cho học viên sau khi nộp.
 * Đáp án và giải thích chỉ gửi khi đề cho phép xem đáp án (show_answers_after).
 */
function buildResult(attempt) {
  const r = gradeAttempt(attempt.content, attempt.answers);
  const showAnswers = attempt.show_answers_after === 1;
  // Hiện đáp án theo đúng thứ tự (và số câu) học viên đã thấy khi làm bài
  const content = { ...attempt.content, questions: orderedQuestions(attempt.content, attempt.order) };
  const detailByNo = new Map(r.details.map((d) => [d.no, d]));
  return {
    examType: attempt.content.examType || 'TOEIC_LR',
    correct: r.correct,
    total: r.total,
    score10: r.score10,
    parts: r.parts,
    listeningCorrect: r.listeningCorrect,
    listeningTotal: r.listeningTotal,
    readingCorrect: r.readingCorrect,
    readingTotal: r.readingTotal,
    listeningScore: r.listeningScore,
    readingScore: r.readingScore,
    totalScore: r.totalScore,
    showAnswers,
    // Nội dung đề đầy đủ (có đáp án + giải thích) — chỉ khi được phép và đã nộp bài
    content: showAnswers ? { ...withFileUrls(content), parts: partsOf(content) } : null,
    details: showAnswers ? content.questions.map((q) => ({ ...detailByNo.get(q.no), displayNo: q.displayNo })) : null,
  };
}

module.exports = { GRACE_MS, getAttempt, isPastDeadline, finalizeAttempt, finalizeExpiredAttempts, saveAnswers, buildResult };
