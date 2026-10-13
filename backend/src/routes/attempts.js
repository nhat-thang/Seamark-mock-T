// API phía HỌC VIÊN: bắt đầu làm bài, lưu bài, nộp bài, xem kết quả.
// Học viên không đăng nhập: mỗi lượt làm bài có một mã bí mật (access_token),
// trình duyệt gửi kèm trong header "X-Attempt-Token".
//
// Hai cách bắt đầu (đã chốt):
//   Training Test    : { lastName, firstName, examId } — chỉ cần họ tên (SĐT không bắt buộc), đề loại 'exam'.
//   Class Assignment : { classStudentId, examId, password? } — học sinh bấm tên mình trong lớp, đề loại 'homework'
//                      phải được giao cho lớp đó; đề có mật khẩu thì phải nhập đúng.
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

/** "Nguyễn Văn An" -> { lastName: 'Nguyễn Văn', firstName: 'An' } (bảng students lưu họ và tên riêng) */
function splitName(fullName) {
  const words = cleanText(fullName).split(' ');
  return { lastName: words.slice(0, -1).join(' '), firstName: words.at(-1) || '' };
}

/** Mật khẩu đề: bỏ khoảng trắng hai đầu, không phân biệt hoa / thường (học sinh nhỏ hay gõ nhầm hoa thường) */
const samePassword = (typed, code) => cleanText(typed).toLowerCase() === cleanText(code).toLowerCase();

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
      classId: attempt.class_id ?? null, // làm bài của lớp: nút "Làm bài khác" quay về đúng lớp
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
    const examId = Number.parseInt(req.body?.examId, 10) || 0;
    const classStudentId = Number.parseInt(req.body?.classStudentId, 10) || 0;
    const exam = db
      .prepare(
        `SELECT e.id, e.category, e.access_code, e.published_version_id AS version_id, v.duration_minutes, v.content_json
           FROM exams e JOIN exam_versions v ON v.id = e.published_version_id
          WHERE e.id = ? AND e.status = 'published'`
      )
      .get(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Đề thi không tồn tại hoặc đã đóng. Vui lòng chọn đề khác.' });
    }

    let classStudent = null;
    let lastName;
    let firstName;
    let phone = '';
    if (classStudentId) {
      // ----- Class Assignment: học sinh đã chọn lớp và bấm tên mình -----
      if (exam.category !== 'homework') return res.status(400).json({ error: 'Đề này không phải bài của lớp.' });
      classStudent = db
        .prepare(
          `SELECT st.* FROM class_students st JOIN classes c ON c.id = st.class_id
            WHERE st.id = ? AND st.removed_at IS NULL AND c.deleted_at IS NULL`
        )
        .get(classStudentId);
      if (!classStudent) return res.status(404).json({ error: 'Không tìm thấy tên bạn trong lớp. Vui lòng chọn lại lớp và tên.' });
      if (!db.prepare('SELECT 1 FROM exam_classes WHERE exam_id = ? AND class_id = ?').get(exam.id, classStudent.class_id)) {
        return res.status(403).json({ error: 'Đề này không giao cho lớp của bạn.' });
      }
      if (exam.access_code && !samePassword(req.body?.password, exam.access_code)) {
        return res.status(403).json({
          reason: 'password',
          error: cleanText(req.body?.password) ? 'Mật khẩu đề không đúng. Hãy hỏi lại giáo viên.' : 'Đề này cần mật khẩu. Hãy nhập mật khẩu giáo viên cho.',
        });
      }
      ({ lastName, firstName } = splitName(classStudent.full_name));
    } else {
      // ----- Training Test: chỉ cần họ tên -----
      lastName = cleanText(req.body?.lastName);
      firstName = cleanText(req.body?.firstName);
      phone = String(req.body?.phone ?? '').replace(/[\s.-]/g, '');
      if (!lastName || !firstName || lastName.length > 50 || firstName.length > 30) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ và tên.' });
      }
      // SĐT không bắt buộc nữa; có gửi thì phải đúng dạng (giữ cho các trình duyệt còn bản cũ)
      if (phone && !PHONE_RE.test(phone)) {
        return res.status(400).json({ error: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.' });
      }
      if (exam.category !== 'exam') {
        return res.status(403).json({ error: 'Đề này chỉ dành cho học sinh của lớp. Hãy vào mục "Class Assignment".' });
      }
    }

    finalizeExpiredAttempts(db);

    const result = db.transaction(() => {
      const createdAt = new Date().toISOString();
      let studentId;
      // Được tự mở lại bài đang làm dở khi biết chắc là cùng một người (cùng học sinh của lớp / cùng SĐT).
      // Chỉ có họ tên thì KHÔNG: người trùng tên có thể vào nhầm bài nhau (trình duyệt tự nhớ bài dở trên máy).
      let resumable = true;
      if (classStudent) {
        const found = db.prepare('SELECT id FROM students WHERE class_student_id = ?').get(classStudent.id);
        if (found) {
          db.prepare('UPDATE students SET last_name = ?, first_name = ? WHERE id = ?').run(lastName, firstName, found.id);
          studentId = found.id;
        } else {
          studentId = db
            .prepare(`INSERT INTO students (last_name, first_name, phone, created_at, class_student_id) VALUES (?, ?, '', ?, ?)`)
            .run(lastName, firstName, createdAt, classStudent.id).lastInsertRowid;
        }
      } else if (phone) {
        // Gộp học viên theo SĐT: có rồi thì cập nhật họ tên mới nhất
        db.prepare(
          `INSERT INTO students (last_name, first_name, phone, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(phone) WHERE phone <> '' DO UPDATE SET last_name = excluded.last_name, first_name = excluded.first_name`
        ).run(lastName, firstName, phone, createdAt);
        studentId = db.prepare('SELECT id FROM students WHERE phone = ?').get(phone).id;
      } else {
        // Chỉ có họ tên: gộp theo đúng họ tên (để giáo viên xem các lần làm của cùng một người)
        const found = db
          .prepare(`SELECT id FROM students WHERE phone = '' AND class_student_id IS NULL AND last_name = ? AND first_name = ?`)
          .get(lastName, firstName);
        studentId = found
          ? found.id
          : db.prepare(`INSERT INTO students (last_name, first_name, phone, created_at) VALUES (?, ?, '', ?)`).run(lastName, firstName, createdAt).lastInsertRowid;
        resumable = false;
      }

      // Đang làm dở đúng đề này mà chưa hết giờ -> tiếp tục lượt cũ (không tính giờ lại từ đầu)
      const ongoing = resumable && db
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
