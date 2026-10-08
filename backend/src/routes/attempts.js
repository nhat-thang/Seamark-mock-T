// API phía HỌC VIÊN: bắt đầu làm bài, lưu bài, nộp bài, xem kết quả.
// Học viên không đăng nhập: mỗi lượt làm bài có một mã bí mật (access_token),
// trình duyệt gửi kèm trong header "X-Attempt-Token".
const crypto = require('crypto');
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { rateLimit } = require('../rateLimit');
const { toStudentContent, sanitizeAnswers, sanitizeFlagged, makeQuestionOrder } = require('../exam/content');
const {
  GRACE_MS, getAttempt, isPastDeadline, finalizeAttempt, finalizeExpiredAttempts, saveAnswers, buildResult,
} = require('../exam/attempts');

const PHONE_RE = /^0\d{9}$/;
const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** So sánh mã an toàn (thời gian so sánh không phụ thuộc nội dung). */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function attemptsRouter(db) {
  const router = express.Router();
  router.use(requireJson);

  // Đọc lượt làm bài theo :id và kiểm tra mã. Trả về null nếu đã gửi lỗi.
  function loadOwnAttempt(req, res) {
    const attempt = getAttempt(db, Number.parseInt(req.params.id, 10) || 0);
    if (!attempt || !sameToken(req.get('x-attempt-token'), attempt.access_token)) {
      res.status(404).json({ error: 'Không tìm thấy bài làm. Có thể bạn đã mở bài trên một máy hoặc trình duyệt khác.' });
      return null;
    }
    return attempt;
  }

  // Thông tin trả về cho trình duyệt, tùy theo bài đang làm hay đã nộp
  function attemptView(attempt) {
    const base = {
      id: attempt.id,
      status: attempt.status,
      examTitle: attempt.exam_title,
      durationMinutes: attempt.duration_minutes,
      student: { lastName: attempt.last_name, firstName: attempt.first_name },
    };
    if (attempt.status === 'submitted') {
      return { ...base, submittedAt: attempt.submitted_at, result: buildResult(attempt) };
    }
    return {
      ...base,
      deadlineAt: attempt.deadline_at,
      serverNow: new Date().toISOString(), // để trình duyệt chỉnh đồng hồ đếm ngược cho khớp server
      allowSeekAudio: attempt.allow_seek_audio === 1,
      content: toStudentContent(attempt.content, attempt.order), // KHÔNG có đáp án; đã sắp theo thứ tự của học viên
      answers: attempt.answers,
      flagged: attempt.flagged,
    };
  }

  // Chống tạo hàng loạt lượt làm bài rác (cả lớp chung một IP vẫn thoải mái)
  const startLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 120,
    message: 'Có quá nhiều lượt bắt đầu làm bài từ mạng này. Vui lòng đợi vài phút rồi thử lại.',
  });

  // POST /api/attempts — bắt đầu (hoặc tiếp tục) làm một đề
  router.post('/', startLimit, (req, res) => {
    const lastName = cleanText(req.body?.lastName);
    const firstName = cleanText(req.body?.firstName);
    const phone = String(req.body?.phone ?? '').replace(/[\s.-]/g, '');
    const examId = Number.parseInt(req.body?.examId, 10) || 0;

    if (!lastName || !firstName || lastName.length > 50 || firstName.length > 30) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ và tên.' });
    }
    if (!PHONE_RE.test(phone)) {
      return res.status(400).json({ error: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.' });
    }

    const exam = db
      .prepare(
        `SELECT e.published_version_id AS version_id, v.duration_minutes, v.content_json
           FROM exams e JOIN exam_versions v ON v.id = e.published_version_id
          WHERE e.id = ? AND e.status = 'published'`
      )
      .get(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Đề thi không tồn tại hoặc đã đóng. Vui lòng chọn đề khác.' });
    }

    finalizeExpiredAttempts(db);

    const result = db.transaction(() => {
      // Gộp học viên theo SĐT: có rồi thì cập nhật họ tên mới nhất
      db.prepare(
        `INSERT INTO students (last_name, first_name, phone, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(phone) DO UPDATE SET last_name = excluded.last_name, first_name = excluded.first_name`
      ).run(lastName, firstName, phone, new Date().toISOString());
      const studentId = db.prepare('SELECT id FROM students WHERE phone = ?').get(phone).id;

      // Đang làm dở đúng đề này mà chưa hết giờ -> tiếp tục lượt cũ (không tính giờ lại từ đầu)
      const ongoing = db
        .prepare(
          `SELECT id, access_token FROM attempts
            WHERE student_id = ? AND exam_version_id = ? AND status = 'in_progress' AND deadline_at > ?
            ORDER BY id DESC LIMIT 1`
        )
        .get(studentId, exam.version_id, new Date().toISOString());
      if (ongoing) return { attemptId: ongoing.id, token: ongoing.access_token, resumed: true };

      // Thời gian làm bài tính ở SERVER
      const now = Date.now();
      const token = crypto.randomBytes(24).toString('base64url');
      const id = db
        .prepare(
          `INSERT INTO attempts (student_id, exam_version_id, started_at, deadline_at, access_token, question_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          studentId, exam.version_id,
          new Date(now).toISOString(),
          new Date(now + exam.duration_minutes * 60 * 1000).toISOString(),
          token,
          // Đề bật xáo trộn: mỗi lượt làm bài một thứ tự câu riêng
          (() => {
            const order = makeQuestionOrder(JSON.parse(exam.content_json));
            return order ? JSON.stringify(order) : null;
          })()
        ).lastInsertRowid;
      return { attemptId: id, token, resumed: false };
    })();

    res.status(201).json(result);
  });

  // GET /api/attempts/:id — nội dung bài đang làm, hoặc kết quả nếu đã nộp
  router.get('/:id', (req, res) => {
    let attempt = loadOwnAttempt(req, res);
    if (!attempt) return;
    // Hết giờ mà chưa nộp -> tự nộp ngay
    if (attempt.status === 'in_progress' && isPastDeadline(attempt)) {
      attempt = finalizeAttempt(db, attempt, { auto: true });
    }
    res.json(attemptView(attempt));
  });

  // POST /api/attempts/:id/save — tự động lưu câu trả lời
  router.post('/:id/save', (req, res) => {
    let attempt = loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === 'in_progress' && isPastDeadline(attempt, GRACE_MS)) {
      attempt = finalizeAttempt(db, attempt, { auto: true });
    }
    if (attempt.status === 'submitted') {
      // Hết giờ: server không nhận thêm câu trả lời
      return res.status(409).json({ error: 'Đã hết giờ làm bài. Bài của bạn đã được nộp.', submitted: true });
    }
    saveAnswers(db, attempt.id, sanitizeAnswers(attempt.content, req.body?.answers), sanitizeFlagged(attempt.content, req.body?.flagged));
    res.json({ savedAt: new Date().toISOString() });
  });

  // POST /api/attempts/:id/submit — nộp bài (kèm câu trả lời mới nhất)
  router.post('/:id/submit', (req, res) => {
    let attempt = loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === 'in_progress') {
      const late = isPastDeadline(attempt, GRACE_MS);
      // Còn trong giờ thì nhận câu trả lời gửi kèm; quá giờ thì chỉ chấm phần đã lưu
      if (!late && req.body?.answers) {
        saveAnswers(db, attempt.id, sanitizeAnswers(attempt.content, req.body.answers), sanitizeFlagged(attempt.content, req.body.flagged));
        attempt = getAttempt(db, attempt.id);
      }
      attempt = finalizeAttempt(db, attempt, { auto: late });
    }
    res.json(attemptView(attempt));
  });

  return router;
}

module.exports = attemptsRouter;
