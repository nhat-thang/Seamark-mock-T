// API quản lý đề cho admin (mọi admin đều dùng được). requireAdmin được gắn ở app.js.
//
// Quy tắc an toàn khi nhiều người cùng sửa:
// - Mọi thay đổi ghi vào bản nháp (draft_json + các cột của bảng exams).
// - Muốn lưu phải đang giữ khóa của đề, và gửi kèm "version" mình đang sửa.
//   Nếu version trên server đã khác (người khác vừa lưu) hoặc mình mất khóa -> từ chối (409), không ghi đè âm thầm.
// - Học viên chỉ thấy bản đã xuất bản (exam_versions), bản này không bao giờ bị sửa.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const { validateContent } = require('../exam/validate');
const { getLock, acquireLock, heartbeat, takeOverLock, releaseLock } = require('../exam/locks');
const { normalizeContent, ContentError, emptyContent } = require('../exam/contentSchema');
const { parseExamWorkbook } = require('../exam/excelImport');
const { buildFilesMap } = require('../exam/files');
const { toStructure, fromStructure } = require('../exam/templates');
const { finalizeExpiredAttempts } = require('../exam/attempts');
const ExcelJS = require('exceljs');
const { byGivenName } = require('../classes/students');
const { accessOf } = require('../classes/access');
const { styleHeader, fillRow, sendWorkbook } = require('../utils/excel');
const { vnDate, formatDate } = require('../classes/time');
const {
  mediaUpload, excelUpload, uploadErrorMessage, requireSameOrigin, signatureMatches, readHead, originalName, extOf,
} = require('../upload');

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;
const EXAM_TYPES = ['TOEIC_LR', 'CUSTOM'];
// Mục đích của đề (bên trong đề giống hệt nhau):
//   'exam'     = Training Test: cho mọi người, học viên chỉ nhập họ tên
//   'homework' = Class Assignment: đề riêng của lớp (bảng exam_classes), có thể có mật khẩu
//                (giá trị 'homework' giữ nguyên trong database; giao diện gọi là "Class Assignment")
const CATEGORIES = ['exam', 'homework'];
const ASSIGNMENT_PREFIX = 'Class Assignment - ';
const ACCESS_CODE_MAX = 30;
/** Nội dung nháp của đề (đề cũ chưa có nội dung -> nội dung trống đúng loại) */
const draftOf = (exam) => JSON.parse(exam.draft_json || 'null') || emptyContent(exam.exam_type);

// Tên dễ đọc của các trường, dùng trong lịch sử chỉnh sửa
const FIELD_LABELS = {
  code: 'mã đề',
  title: 'tên đề',
  durationMinutes: 'thời gian làm bài',
  internalNote: 'ghi chú nội bộ',
  allowSeekAudio: 'cho tua audio',
  showAnswersAfter: 'cho xem đáp án',
};

// Các lần tự động lưu liên tiếp của cùng một người chỉ ghi 1 dòng lịch sử mỗi 10 phút
const AUDIT_MERGE_MS = 10 * 60 * 1000;

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Tên đề Class Assignment luôn bắt đầu bằng "Class Assignment - " (đã chốt với người dùng):
 * giáo viên gõ "đề lớp 1a" -> "Class Assignment - đề lớp 1a". Lỡ gõ "class assignment ..." / "homework ..." ở đầu
 * cũng không bị lặp chữ. Trả về chuỗi rỗng nếu phần tên giáo viên đặt bị trống.
 */
const PREFIX_RE = /^(class\s*assignment|homework)\b\s*[-–—:_.]*\s*/i;
function assignmentTitle(raw) {
  let name = cleanText(raw);
  while (PREFIX_RE.test(name)) name = name.replace(PREFIX_RE, '');
  return name ? `${ASSIGNMENT_PREFIX}${name}` : '';
}

/** Kiểm tra + chuẩn hóa thông tin đề. Trả về { settings } hoặc { error }. */
function parseSettings(body) {
  const code = cleanText(body?.code).toUpperCase();
  const title = cleanText(body?.title);
  const durationMinutes = Number(body?.durationMinutes);
  const internalNote = String(body?.internalNote ?? '').trim();

  if (!CODE_RE.test(code)) {
    return { error: 'Mã đề dài 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu gạch ngang hoặc gạch dưới. Ví dụ: READING-01.' };
  }
  if (!title || title.length > 200) return { error: 'Vui lòng nhập tên đề (tối đa 200 ký tự).' };
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    return { error: 'Thời gian làm bài phải là số phút, từ 1 đến 600.' };
  }
  if (internalNote.length > 5000) return { error: 'Ghi chú nội bộ quá dài (tối đa 5000 ký tự).' };
  return {
    settings: {
      code,
      title,
      durationMinutes,
      internalNote,
      allowSeekAudio: body?.allowSeekAudio === true,
      showAnswersAfter: body?.showAnswersAfter === true,
    },
  };
}

function settingsOf(row) {
  return {
    code: row.code,
    title: row.title,
    durationMinutes: row.duration_minutes,
    internalNote: row.internal_note,
    allowSeekAudio: row.allow_seek_audio === 1,
    showAnswersAfter: row.show_answers_after === 1,
  };
}

function adminExamsRouter(db, config) {
  const router = express.Router();
  // Upload file (multipart) kiểm tra Origin; mọi request khác phải là JSON
  router.use((req, res, next) => (req.is('multipart/form-data') ? requireSameOrigin(req, res, next) : requireJson(req, res, next)));

  const uploadMedia = mediaUpload(config);
  const uploadExcel = excelUpload(config);
  const uploadsDir = path.join(config.dataDir, 'uploads');

  // Chạy middleware multer, đổi lỗi sang tiếng Việt
  const runUpload = (mw) => (req, res, next) =>
    mw(req, res, (err) => (err ? res.status(400).json({ error: uploadErrorMessage(err, config) }) : next()));

  /** File đang dùng được của đề (chưa bị xóa) */
  const activeMedia = (examId) =>
    db.prepare('SELECT * FROM media WHERE exam_id = ? AND deleted_at IS NULL ORDER BY original_name COLLATE NOCASE').all(examId);

  const findExam = (id) => db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  const codeTaken = (code, exceptId = 0) =>
    !!db.prepare('SELECT 1 FROM exams WHERE code = ? AND id != ?').get(code, exceptId);

  /** Mã đề tự đặt cho Class Assignment: CA-001, CA-002... (giáo viên không phải nghĩ mã) */
  function nextAssignmentCode() {
    const used = db.prepare(`SELECT code FROM exams WHERE code LIKE 'CA-%'`).all()
      .map((r) => Number.parseInt(r.code.slice(3), 10)).filter(Number.isFinite);
    return `CA-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
  }

  const authorName = (id) => (id ? db.prepare('SELECT display_name FROM admins WHERE id = ?').get(id)?.display_name ?? null : null);

  /** Các lớp được giao đề */
  const classesOf = (examId) =>
    db.prepare(
      `SELECT c.id, c.name, c.color FROM exam_classes ec JOIN classes c ON c.id = ec.class_id
        WHERE ec.exam_id = ? AND c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE`
    ).all(examId);

  /**
   * Đọc + kiểm tra lớp được giao và mật khẩu đề từ dữ liệu gửi lên.
   * Giáo viên (không phải admin chính) chỉ giao / bỏ giao các lớp mình phụ trách; lớp khác đã được giao thì giữ nguyên.
   * Trả về { classIds, accessCode } hoặc { error }.
   */
  function readAssignment(body, admin, before = []) {
    let ids = [...new Set((Array.isArray(body?.classIds) ? body.classIds : []).map((v) => Number.parseInt(v, 10)).filter(Boolean))];
    for (const id of ids) {
      if (!db.prepare('SELECT 1 FROM classes WHERE id = ? AND deleted_at IS NULL').get(id)) {
        return { error: 'Có lớp đã chọn không còn tồn tại. Hãy tải lại trang rồi chọn lại.' };
      }
    }
    const access = accessOf(db, admin);
    if (!access.isOwner) {
      if (ids.some((id) => !access.canSeeClass(id) && !before.includes(id))) return { error: 'Bạn chỉ giao đề được cho lớp mình phụ trách.' };
      ids = [...new Set([...ids.filter((id) => access.canSeeClass(id)), ...before.filter((id) => !access.canSeeClass(id))])];
    }
    const accessCode = cleanText(body?.accessCode);
    if (accessCode.length > ACCESS_CODE_MAX) return { error: `Mật khẩu đề tối đa ${ACCESS_CODE_MAX} ký tự.` };
    return { classIds: ids, accessCode };
  }

  function saveAssignment(examId, { classIds, accessCode }) {
    db.transaction(() => {
      db.prepare('DELETE FROM exam_classes WHERE exam_id = ?').run(examId);
      const add = db.prepare('INSERT INTO exam_classes (exam_id, class_id) VALUES (?, ?)');
      for (const id of classIds) add.run(examId, id);
      db.prepare('UPDATE exams SET access_code = ? WHERE id = ?').run(accessCode, examId);
    })();
  }
  const classNames = (ids) => ids.map((id) => db.prepare('SELECT name FROM classes WHERE id = ?').get(id)?.name).filter(Boolean);

  // Lấy đề theo :id; gửi 404 và trả null nếu không có
  function loadExam(req, res) {
    const exam = findExam(Number.parseInt(req.params.id, 10) || 0);
    if (!exam) {
      res.status(404).json({ error: 'Không tìm thấy đề thi. Có thể đề đã bị xóa.' });
      return null;
    }
    return exam;
  }

  function publishedInfo(exam) {
    if (!exam.published_version_id) return null;
    const v = db
      .prepare(
        `SELECT v.version_no, v.published_at, v.source_version, a.display_name
           FROM exam_versions v LEFT JOIN admins a ON a.id = v.published_by WHERE v.id = ?`
      )
      .get(exam.published_version_id);
    return v
      ? { versionNo: v.version_no, publishedAt: v.published_at, publishedBy: v.display_name, sourceVersion: v.source_version }
      : null;
  }

  function lockView(lock, adminId) {
    return lock ? { displayName: lock.displayName, since: lock.since, isMine: lock.adminId === adminId } : null;
  }

  /** Phải đang giữ khóa (khóa trống thì tự nhận lại). Gửi 409 và trả false nếu không. */
  function checkLockHolder(req, res, exam) {
    const lock = getLock(db, exam.id);
    if (lock && lock.adminId !== req.admin.id) {
      res.status(409).json({
        reason: 'lock',
        error: `${lock.displayName} đã giành quyền chỉnh sửa đề này. Thay đổi của bạn chưa được lưu.`,
        lock: lockView(lock, req.admin.id),
      });
      return false;
    }
    if (!lock) acquireLock(db, exam.id, req.admin.id);
    return true;
  }

  /**
   * Kiểm tra quyền lưu: phải giữ khóa (hoặc khóa đang trống thì tự nhận lại) và đúng version.
   * Gửi 409 và trả false nếu không được lưu.
   */
  function checkCanWrite(req, res, exam) {
    const lock = getLock(db, exam.id);
    if (lock && lock.adminId !== req.admin.id) {
      res.status(409).json({
        reason: 'lock',
        error: `${lock.displayName} đã giành quyền chỉnh sửa đề này. Thay đổi của bạn chưa được lưu.`,
        lock: lockView(lock, req.admin.id),
      });
      return false;
    }
    if (Number(req.body?.version) !== exam.version) {
      res.status(409).json({
        reason: 'version',
        error: 'Đề vừa được lưu ở nơi khác (máy khác hoặc người khác). Hãy tải lại trang để xem bản mới nhất.',
      });
      return false;
    }
    // Khóa đã hết hạn (ví dụ máy ngủ) mà chưa ai lấy -> nhận lại khóa
    if (!lock) acquireLock(db, exam.id, req.admin.id);
    return true;
  }

  // GET /api/admin/exams — danh sách đề
  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT e.id, e.code, e.title, e.exam_type, e.status, e.version, e.updated_at, e.published_version_id,
                e.lock_admin_id, e.lock_expires_at, la.display_name AS lock_name,
                ua.display_name AS updated_by_name, e.category, ca.display_name AS author_name,
                (SELECT GROUP_CONCAT(c.name, ', ') FROM exam_classes ec JOIN classes c ON c.id = ec.class_id
                  WHERE ec.exam_id = e.id AND c.deleted_at IS NULL) AS class_names,
                COALESCE(json_array_length(e.draft_json, '$.questions'), 0) AS question_count,
                (SELECT COUNT(*) FROM attempts a JOIN exam_versions av ON av.id = a.exam_version_id WHERE av.exam_id = e.id) AS attempt_count,
                v.source_version, v.version_no
           FROM exams e
           LEFT JOIN admins ua ON ua.id = e.updated_by
           LEFT JOIN admins ca ON ca.id = e.created_by
           LEFT JOIN admins la ON la.id = e.lock_admin_id
           LEFT JOIN exam_versions v ON v.id = e.published_version_id
          ORDER BY e.updated_at DESC`
      )
      .all();
    const now = new Date().toISOString();
    res.json({
      exams: rows.map((r) => ({
        id: r.id,
        code: r.code,
        examType: r.exam_type,
        category: r.category,
        author: r.author_name,
        classNames: r.class_names || '',
        title: r.title,
        status: r.status,
        questionCount: r.question_count,
        attemptCount: r.attempt_count,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by_name,
        everPublished: !!r.published_version_id,
        publishedVersionNo: r.version_no ?? null,
        hasUnpublishedChanges: !!r.published_version_id && r.version > r.source_version,
        editingBy: r.lock_admin_id && r.lock_expires_at > now && r.lock_admin_id !== req.admin.id ? r.lock_name : null,
      })),
    });
  });

  // POST /api/admin/exams — tạo đề mới (bản nháp trống)
  router.post('/', (req, res) => {
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'exam';
    const body = { ...req.body, internalNote: req.body?.internalNote ?? '' };
    let assignment = null;
    if (category === 'homework') {
      body.title = assignmentTitle(req.body?.title);
      if (!body.title) return res.status(400).json({ error: 'Vui lòng đặt tên cho đề Class Assignment (ví dụ: Đề lớp 1A).' });
      if (!cleanText(req.body?.code)) body.code = nextAssignmentCode();
      assignment = readAssignment(req.body, req.admin);
      if (assignment.error) return res.status(400).json({ error: assignment.error });
    }
    // Giáo viên ra đề: mặc định là người tạo; chọn được giáo viên khác (tài khoản đang hoạt động)
    let authorId = req.admin.id;
    if (req.body?.authorId) {
      const a = db.prepare('SELECT id FROM admins WHERE id = ? AND is_active = 1').get(Number.parseInt(req.body.authorId, 10) || 0);
      if (!a) return res.status(400).json({ error: 'Giáo viên ra đề không tồn tại hoặc đã bị vô hiệu hóa.' });
      authorId = a.id;
    }
    const parsed = parseSettings(body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const s = parsed.settings;
    let examType = EXAM_TYPES.includes(req.body?.examType) ? req.body.examType : 'TOEIC_LR';
    // Tạo từ khung mẫu: đề tự thiết kế, cấu trúc lấy từ khung (nội dung để trống)
    let initialContent = null;
    let template = null;
    if (req.body?.templateId) {
      template = db.prepare('SELECT * FROM exam_templates WHERE id = ?').get(Number.parseInt(req.body.templateId, 10) || 0);
      if (!template) return res.status(404).json({ error: 'Không tìm thấy khung mẫu. Có thể khung đã bị xóa.' });
      examType = 'CUSTOM';
      initialContent = fromStructure(JSON.parse(template.structure_json));
    }
    if (codeTaken(s.code)) return res.status(409).json({ error: `Mã đề "${s.code}" đã có. Vui lòng chọn mã khác.` });

    const id = db
      .prepare(
        `INSERT INTO exams (code, title, exam_type, category, created_by, duration_minutes, internal_note, allow_seek_audio,
                            show_answers_after, status, draft_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
      .run(s.code, s.title, examType, category, authorId, s.durationMinutes, s.internalNote, s.allowSeekAudio ? 1 : 0,
        s.showAnswersAfter ? 1 : 0, JSON.stringify(initialContent || emptyContent(examType)), req.admin.id, new Date().toISOString()).lastInsertRowid;
    if (assignment) saveAssignment(id, assignment);
    const kind = template ? `từ khung mẫu "${template.name}"` : examType === 'CUSTOM' ? 'tự thiết kế' : 'TOEIC';
    const what = category === 'homework' ? `đề Class Assignment (${kind})` : `đề Training Test (${kind})`;
    const by = authorId !== req.admin.id ? `, giáo viên ra đề: ${authorName(authorId)}` : '';
    const forClasses = assignment?.classIds.length ? `, giao cho lớp: ${classNames(assignment.classIds).join(', ')}` : '';
    const pw = assignment?.accessCode ? ', có mật khẩu' : '';
    logAudit(db, { adminId: req.admin.id, action: 'create_exam', examId: id, detail: `Tạo ${what} "${s.title}" (${s.code})${by}${forClasses}${pw}` });
    res.status(201).json({ id, code: s.code, title: s.title });
  });

  // GET /api/admin/exams/:id — chi tiết đề (bản nháp + thông tin xuất bản + khóa)
  router.get('/:id', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const published = publishedInfo(exam);
    const updatedBy = exam.updated_by
      ? db.prepare('SELECT display_name FROM admins WHERE id = ?').get(exam.updated_by)?.display_name
      : null;
    const versions = db
      .prepare(
        `SELECT v.version_no, v.published_at, v.question_count, a.display_name
           FROM exam_versions v LEFT JOIN admins a ON a.id = v.published_by
          WHERE v.exam_id = ? ORDER BY v.version_no DESC`
      )
      .all(exam.id)
      .map((v) => ({ versionNo: v.version_no, publishedAt: v.published_at, questionCount: v.question_count, publishedBy: v.display_name }));

    res.json({
      exam: {
        id: exam.id,
        ...settingsOf(exam),
        examType: exam.exam_type,
        category: exam.category,
        author: authorName(exam.created_by),
        // Class Assignment: lớp được giao + mật khẩu (admin xem được để đọc cho học sinh)
        classes: exam.category === 'homework' ? classesOf(exam.id) : [],
        accessCode: exam.category === 'homework' ? exam.access_code : '',
        status: exam.status,
        version: exam.version,
        updatedAt: exam.updated_at,
        updatedBy,
      },
      content: draftOf(exam),
      published,
      hasUnpublishedChanges: !!published && exam.version > published.sourceVersion,
      versions,
      media: activeMedia(exam.id).map(mediaView),
      template: (() => {
        const t = db.prepare('SELECT id, name, updated_at FROM exam_templates WHERE source_exam_id = ?').get(exam.id);
        return t ? { id: t.id, name: t.name, updatedAt: t.updated_at } : null;
      })(),
      attemptCount: db
        .prepare('SELECT COUNT(*) AS n FROM attempts a JOIN exam_versions v ON v.id = a.exam_version_id WHERE v.exam_id = ?')
        .get(exam.id).n,
      lock: lockView(getLock(db, exam.id), req.admin.id),
    });
  });

  function mediaView(m) {
    return {
      id: m.id,
      name: m.original_name,
      url: `/api/files/${m.stored_name}`,
      mime: m.mime,
      size: m.size,
      createdAt: m.created_at,
    };
  }

  // ---------- Khóa chỉnh sửa ----------

  // GET /api/admin/exams/:id/lock — ai đang sửa?
  router.get('/:id/lock', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    res.json({ lock: lockView(getLock(db, exam.id), req.admin.id) });
  });

  // POST /api/admin/exams/:id/lock — xin quyền sửa
  router.post('/:id/lock', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const r = acquireLock(db, exam.id, req.admin.id);
    res.json({ ok: r.ok, lock: lockView(r.lock, req.admin.id) });
  });

  // POST /api/admin/exams/:id/heartbeat — gia hạn khóa (trình duyệt gửi mỗi 30 giây)
  router.post('/:id/heartbeat', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (heartbeat(db, exam.id, req.admin.id)) return res.json({ ok: true });
    // Mất khóa: thử nhận lại nếu chưa ai lấy
    const r = acquireLock(db, exam.id, req.admin.id);
    res.json({ ok: r.ok, lock: lockView(r.lock, req.admin.id) });
  });

  // POST /api/admin/exams/:id/takeover — giành quyền chỉnh sửa
  router.post('/:id/takeover', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const previous = takeOverLock(db, exam.id, req.admin.id);
    if (previous) {
      logAudit(db, {
        adminId: req.admin.id,
        action: 'takeover_lock',
        examId: exam.id,
        detail: `Giành quyền chỉnh sửa từ ${previous.displayName}`,
      });
    }
    res.json({ ok: true, lock: lockView(getLock(db, exam.id), req.admin.id) });
  });

  // POST /api/admin/exams/:id/unlock — trả khóa khi rời trang
  router.post('/:id/unlock', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    releaseLock(db, exam.id, req.admin.id);
    res.json({ ok: true });
  });

  // ---------- Lưu, kiểm tra, xuất bản ----------

  /** Ghi lịch sử, gộp các lần tự lưu liên tiếp cùng loại của một người (mỗi 10 phút một dòng) */
  function logMerged(adminId, examId, action, detail) {
    const recent = db
      .prepare(
        `SELECT id FROM audit_log WHERE admin_id = ? AND exam_id = ? AND action = ? AND created_at > ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(adminId, examId, action, new Date(Date.now() - AUDIT_MERGE_MS).toISOString());
    if (!recent) logAudit(db, { adminId, action, examId, detail });
  }

  // Nguồn thay đổi nội dung -> ghi lịch sử thế nào
  const CONTENT_SOURCES = {
    import: 'import_excel',
    answers: 'update_answers',
    editor: 'update_content',
    files: 'update_files',
  };

  // POST /api/admin/exams/:id/save — lưu bản nháp
  // body: { version, settings, content?, source?, sourceName? }
  //   content: toàn bộ nội dung đề (chỉ gửi khi có thay đổi nội dung)
  //   source : 'import' | 'answers' | 'editor' | 'files' — để ghi lịch sử cho dễ hiểu
  router.post('/:id/save', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (!checkCanWrite(req, res, exam)) return;

    const parsed = parseSettings(req.body?.settings);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const s = parsed.settings;
    if (exam.category === 'homework') {
      s.title = assignmentTitle(s.title);
      if (!s.title) return res.status(400).json({ error: 'Vui lòng đặt tên cho đề (phần sau chữ "Class Assignment -").' });
    }
    if (codeTaken(s.code, exam.id)) {
      return res.status(409).json({ reason: 'code', error: `Mã đề "${s.code}" đã được dùng cho đề khác.` });
    }

    // Nội dung đề (nếu có gửi): chuẩn hóa trước khi lưu
    let draftJson = exam.draft_json;
    let contentChanged = false;
    let content = null;
    if (req.body?.content !== undefined) {
      try {
        content = normalizeContent({ ...req.body.content, examType: exam.exam_type });
      } catch (err) {
        if (err instanceof ContentError) return res.status(400).json({ error: err.message });
        throw err;
      }
      const json = JSON.stringify(content);
      contentChanged = json !== exam.draft_json;
      draftJson = json;
    }

    const before = settingsOf(exam);
    const changed = Object.keys(FIELD_LABELS).filter((k) => before[k] !== s[k]);
    if (changed.length === 0 && !contentChanged) return res.json({ version: exam.version, updatedAt: exam.updated_at });

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `UPDATE exams SET code = ?, title = ?, duration_minutes = ?, internal_note = ?,
                          allow_seek_audio = ?, show_answers_after = ?, draft_json = ?,
                          version = version + 1, updated_by = ?, updated_at = ?
          WHERE id = ? AND version = ?`
      )
      .run(s.code, s.title, s.durationMinutes, s.internalNote, s.allowSeekAudio ? 1 : 0, s.showAnswersAfter ? 1 : 0,
        draftJson, req.admin.id, now, exam.id, exam.version);
    // Phòng trường hợp 2 request đến cùng lúc: điều kiện "version = ?" đảm bảo chỉ một request thắng
    if (info.changes !== 1) {
      return res.status(409).json({ reason: 'version', error: 'Đề vừa được lưu ở nơi khác. Hãy tải lại trang.' });
    }

    // Lịch sử chỉnh sửa
    if (changed.length) logMerged(req.admin.id, exam.id, 'update_exam', `Sửa ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`);
    if (contentChanged) {
      const source = CONTENT_SOURCES[req.body?.source] ? req.body.source : 'editor';
      if (source === 'import') {
        const fileLabel = String(req.body?.sourceName || '').slice(0, 120);
        logAudit(db, {
          adminId: req.admin.id,
          action: 'import_excel',
          examId: exam.id,
          detail: `Import file Excel${fileLabel ? ` "${fileLabel}"` : ''}: ${content.questions.length} câu, ${content.groups.length} nhóm`,
        });
      } else {
        const detail = {
          answers: 'Nhập nhanh đáp án',
          editor: 'Sửa câu hỏi / đoạn văn',
          files: 'Gán file ảnh / audio',
        }[source];
        logMerged(req.admin.id, exam.id, CONTENT_SOURCES[source], detail);
      }
    }

    res.json({ version: exam.version + 1, updatedAt: now });
  });

  // Tên các file đã tải lên cho đề (để kiểm tra file được nhắc tới trong đề)
  const uploadedFilesOf = (examId) => new Set(activeMedia(examId).map((m) => m.original_name));

  // ---------- Import Excel ----------

  // POST /api/admin/exams/:id/import/preview — đọc file Excel, trả về bản xem trước + lỗi. CHƯA ghi gì.
  router.post('/:id/import/preview', runUpload(uploadExcel.single('file')), async (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (exam.exam_type === 'CUSTOM') {
      return res.status(400).json({ error: 'Đề tự thiết kế không dùng file Excel mẫu TOEIC. Hãy soạn câu hỏi ở tab "Soạn đề".' });
    }
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file Excel.' });
    if (!signatureMatches('xlsx', req.file.buffer)) {
      return res.status(400).json({ error: 'File không phải file Excel (.xlsx) hợp lệ.' });
    }

    const result = await parseExamWorkbook(req.file.buffer);
    if (result.settings.code && codeTaken(result.settings.code, exam.id)) {
      result.errors.push(`Trang «Thông tin đề»: mã đề "${result.settings.code}" đã được dùng cho đề khác.`);
    }
    // Chỉ khi file không có lỗi mới kiểm tra "đủ để xuất bản chưa"
    let publishIssues = [];
    if (result.errors.length === 0) {
      const check = validateContent(result.content, { uploadedFiles: uploadedFilesOf(exam.id) });
      publishIssues = check.errors;
      result.warnings.push(...check.warnings);
    }
    res.json({
      fileName: originalName(req.file),
      settings: result.settings,
      content: result.content,
      errors: result.errors,
      publishIssues,
      warnings: result.warnings,
    });
  });

  // ---------- Ảnh / audio ----------

  // POST /api/admin/exams/:id/media — tải lên nhiều file (trường "files")
  // File trùng tên với file đã có -> thay file cũ (bản nháp dùng file mới).
  router.post('/:id/media', runUpload(uploadMedia.array('files', 50)), (req, res) => {
    const removeAll = () => (req.files || []).forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    const exam = loadExam(req, res);
    if (!exam) return removeAll();
    if (!checkLockHolder(req, res, exam)) return removeAll();
    if (!req.files?.length) return res.status(400).json({ error: 'Chưa chọn file nào.' });

    const accepted = [];
    const rejected = [];
    const now = new Date().toISOString();
    for (const f of req.files) {
      const name = originalName(f);
      // Kiểm tra thêm nội dung thật của file (không chỉ dựa vào đuôi)
      if (!signatureMatches(extOf(name), readHead(f.path))) {
        fs.rm(f.path, { force: true }, () => {});
        rejected.push(`${name}: nội dung file không đúng loại ${extOf(name)}.`);
        continue;
      }
      db.transaction(() => {
        // Ẩn file cũ cùng tên (không xóa trên đĩa vì bản đã xuất bản có thể đang dùng)
        db.prepare(
          'UPDATE media SET deleted_at = ? WHERE exam_id = ? AND deleted_at IS NULL AND lower(original_name) = lower(?)'
        ).run(now, exam.id, name);
        db.prepare(
          `INSERT INTO media (exam_id, original_name, stored_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(exam.id, name, path.basename(f.path), f.mimetype, f.size, now);
      })();
      accepted.push(name);
    }

    if (accepted.length) {
      logMerged(req.admin.id, exam.id, 'upload_files', `Tải lên ${accepted.length} file: ${accepted.slice(0, 5).join(', ')}${accepted.length > 5 ? '…' : ''}`);
    }
    res.json({ accepted, rejected, media: activeMedia(exam.id).map(mediaView) });
  });

  // POST /api/admin/exams/:id/media/:mediaId/delete — xóa file khỏi bản nháp
  router.post('/:id/media/:mediaId/delete', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (!checkLockHolder(req, res, exam)) return;
    const m = db
      .prepare('SELECT * FROM media WHERE id = ? AND exam_id = ? AND deleted_at IS NULL')
      .get(Number.parseInt(req.params.mediaId, 10) || 0, exam.id);
    if (!m) return res.status(404).json({ error: 'Không tìm thấy file.' });
    db.prepare('UPDATE media SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), m.id);
    logAudit(db, { adminId: req.admin.id, action: 'delete_file', examId: exam.id, detail: `Xóa file "${m.original_name}"` });
    res.json({ media: activeMedia(exam.id).map(mediaView) });
  });

  // GET /api/admin/exams/:id/check — kiểm tra bản nháp trước khi xuất bản
  router.get('/:id/check', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const content = draftOf(exam);
    res.json(validateContent(content, { uploadedFiles: uploadedFilesOf(exam.id) }));
  });

  // POST /api/admin/exams/:id/publish — xuất bản bản nháp hiện tại { version }
  router.post('/:id/publish', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (!checkCanWrite(req, res, exam)) return;

    const content = draftOf(exam);
    const { errors, warnings } = validateContent(content, { uploadedFiles: uploadedFilesOf(exam.id) });
    if (errors.length) {
      return res.status(422).json({ error: 'Đề chưa xuất bản được vì còn lỗi. Hãy sửa các lỗi bên dưới.', errors, warnings });
    }

    // Ghi kèm bảng "tên file -> file lưu trên đĩa" để bản xuất bản không phụ thuộc bản nháp nữa
    const versionJson = JSON.stringify({ ...content, files: buildFilesMap(content, activeMedia(exam.id)) });

    const versionNo = db.transaction(() => {
      const next = db.prepare('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM exam_versions WHERE exam_id = ?').get(exam.id).n;
      // Bản xuất bản là BẤT BIẾN: chụp lại nội dung + cài đặt tại thời điểm này
      const versionId = db
        .prepare(
          `INSERT INTO exam_versions (exam_id, version_no, title, duration_minutes, question_count, content_json,
                                      published_at, published_by, allow_seek_audio, show_answers_after, source_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(exam.id, next, exam.title, exam.duration_minutes, content.questions.length, versionJson,
          new Date().toISOString(), req.admin.id, exam.allow_seek_audio, exam.show_answers_after, exam.version).lastInsertRowid;
      db.prepare(`UPDATE exams SET status = 'published', published_version_id = ? WHERE id = ?`).run(versionId, exam.id);
      return next;
    })();

    logAudit(db, {
      adminId: req.admin.id,
      action: 'publish_exam',
      examId: exam.id,
      detail: `Xuất bản lần ${versionNo} (${content.questions.length} câu)`,
    });
    res.json({ ok: true, versionNo, warnings });
  });

  // POST /api/admin/exams/:id/delete — XÓA HẲN đề (mọi admin; có ghi lịch sử) { confirmCode }
  // Xóa cả các bản xuất bản, mọi lượt làm bài, file ảnh/audio. Không hoàn tác được.
  router.post('/:id/delete', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (String(req.body?.confirmCode ?? '').trim().toUpperCase() !== exam.code) {
      return res.status(400).json({ error: `Mã đề nhập lại không khớp. Hãy gõ đúng "${exam.code}" để xác nhận xóa.` });
    }
    const lock = getLock(db, exam.id);
    if (lock && lock.adminId !== req.admin.id) {
      return res.status(409).json({
        reason: 'lock',
        error: `${lock.displayName} đang chỉnh sửa đề này. Hãy đợi người đó xong (hoặc giành quyền chỉnh sửa) rồi mới xóa.`,
      });
    }

    const media = db.prepare('SELECT stored_name FROM media WHERE exam_id = ?').all(exam.id);
    const result = db.transaction(() => {
      const versionIds = db.prepare('SELECT id FROM exam_versions WHERE exam_id = ?').all(exam.id).map((v) => v.id);
      const studentIds = versionIds.length
        ? db.prepare(`SELECT DISTINCT student_id FROM attempts WHERE exam_version_id IN (${versionIds.map(() => '?').join(',')})`)
          .all(...versionIds).map((r) => r.student_id)
        : [];
      let attempts = 0;
      for (const vid of versionIds) attempts += db.prepare('DELETE FROM attempts WHERE exam_version_id = ?').run(vid).changes;
      db.prepare('UPDATE exams SET published_version_id = NULL WHERE id = ?').run(exam.id);
      db.prepare('DELETE FROM exam_versions WHERE exam_id = ?').run(exam.id);
      db.prepare('DELETE FROM media WHERE exam_id = ?').run(exam.id);
      // Giữ lịch sử cũ nhưng bỏ liên kết tới đề (đề sắp mất), ghi thêm mã đề để còn tra được
      db.prepare(`UPDATE audit_log SET exam_id = NULL, detail = COALESCE(detail, '') || ' [đề ' || ? || ']' WHERE exam_id = ?`)
        .run(exam.code, exam.id);
      db.prepare('DELETE FROM exams WHERE id = ?').run(exam.id);
      // Học viên không còn bài làm nào khác thì xóa luôn (không giữ SĐT không cần thiết)
      let students = 0;
      for (const sid of studentIds) {
        if (!db.prepare('SELECT 1 FROM attempts WHERE student_id = ?').get(sid)) {
          students += db.prepare('DELETE FROM students WHERE id = ?').run(sid).changes;
        }
      }
      return { attempts, students };
    })();

    // Xóa file trên đĩa (sau khi database đã xóa xong)
    for (const m of media) fs.rm(path.join(uploadsDir, m.stored_name), { force: true }, () => {});

    logAudit(db, {
      adminId: req.admin.id,
      action: 'delete_exam',
      detail: `Xóa đề "${exam.title}" (${exam.code}): ${result.attempts} lượt làm bài, ${media.length} file`,
    });
    res.json({ ok: true, ...result, files: media.length });
  });

  // POST /api/admin/exams/:id/template — lưu (hoặc cập nhật) đề tự thiết kế thành khung mẫu { name }
  // Lấy cấu trúc từ bản nháp hiện tại. Không cần giữ khóa vì không đổi nội dung đề.
  router.post('/:id/template', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (exam.exam_type !== 'CUSTOM') {
      return res.status(400).json({ error: 'Chỉ đề tự thiết kế mới lưu được thành khung mẫu.' });
    }
    const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'Vui lòng đặt tên khung mẫu (tối đa 80 ký tự).' });
    const existing = db.prepare('SELECT id FROM exam_templates WHERE source_exam_id = ?').get(exam.id);
    // So tên không phân biệt hoa/thường (làm bằng JavaScript vì lower() của SQLite không xử lý chữ có dấu tiếng Việt)
    const key = (s) => s.normalize('NFC').toLocaleLowerCase('vi');
    const dup = db
      .prepare('SELECT id, name FROM exam_templates')
      .all()
      .find((t) => t.id !== existing?.id && key(t.name) === key(name));
    if (dup) return res.status(409).json({ error: `Đã có khung mẫu tên "${name}". Vui lòng chọn tên khác.` });
    const content = draftOf(exam);
    if (content.questions.length === 0) {
      return res.status(400).json({ error: 'Đề chưa có question nào nên chưa làm khung mẫu được.' });
    }

    const now = new Date().toISOString();
    const json = JSON.stringify(toStructure(content));
    if (existing) {
      db.prepare('UPDATE exam_templates SET name = ?, structure_json = ?, duration_minutes = ?, updated_at = ? WHERE id = ?')
        .run(name, json, exam.duration_minutes, now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO exam_templates (name, structure_json, duration_minutes, source_exam_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(name, json, exam.duration_minutes, exam.id, req.admin.id, now, now);
    }
    logAudit(db, {
      adminId: req.admin.id,
      action: 'save_template',
      examId: exam.id,
      detail: `${existing ? 'Cập nhật' : 'Lưu'} khung mẫu "${name}" (${content.parts.length} part, ${content.questions.length} question)`,
    });
    const t = db.prepare('SELECT id, name, updated_at FROM exam_templates WHERE source_exam_id = ?').get(exam.id);
    res.json({ template: { id: t.id, name: t.name, updatedAt: t.updated_at } });
  });

  // POST /api/admin/exams/:id/template/remove — bỏ khung mẫu của đề này (các đề đã tạo từ khung không ảnh hưởng)
  router.post('/:id/template/remove', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const t = db.prepare('SELECT * FROM exam_templates WHERE source_exam_id = ?').get(exam.id);
    if (t) {
      db.prepare('DELETE FROM exam_templates WHERE id = ?').run(t.id);
      logAudit(db, { adminId: req.admin.id, action: 'delete_template', examId: exam.id, detail: `Bỏ khung mẫu "${t.name}"` });
    }
    res.json({ ok: true });
  });

  // POST /api/admin/exams/:id/unpublish — ngừng mở đề cho học viên { version }
  router.post('/:id/unpublish', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (!checkCanWrite(req, res, exam)) return;
    if (exam.status !== 'published') return res.json({ ok: true });
    db.prepare(`UPDATE exams SET status = 'draft' WHERE id = ?`).run(exam.id);
    logAudit(db, { adminId: req.admin.id, action: 'unpublish_exam', examId: exam.id, detail: 'Ngừng mở đề cho học viên' });
    res.json({ ok: true });
  });

  // ---------- Class Assignment: lớp được giao + mật khẩu ----------

  // POST /api/admin/exams/:id/assignment — { classIds: [...], accessCode: '' }
  // Có hiệu lực NGAY (không cần xuất bản lại): học sinh lớp mới được giao thấy đề luôn.
  router.post('/:id/assignment', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    if (exam.category !== 'homework') return res.status(400).json({ error: 'Chỉ đề Class Assignment mới giao cho lớp và đặt mật khẩu.' });
    if (!checkLockHolder(req, res, exam)) return;
    const before = classesOf(exam.id).map((c) => c.id);
    const a = readAssignment(req.body, req.admin, before);
    if (a.error) return res.status(400).json({ error: a.error });

    saveAssignment(exam.id, a);
    const changes = [];
    const added = a.classIds.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !a.classIds.includes(id));
    if (added.length) changes.push(`giao thêm cho lớp ${classNames(added).join(', ')}`);
    if (removed.length) changes.push(`bỏ lớp ${classNames(removed).join(', ')}`);
    if (a.accessCode !== exam.access_code) {
      changes.push(!a.accessCode ? 'bỏ mật khẩu đề' : exam.access_code ? 'đổi mật khẩu đề' : 'đặt mật khẩu đề');
    }
    if (changes.length) logAudit(db, { adminId: req.admin.id, action: 'update_assignment', examId: exam.id, detail: `Class Assignment: ${changes.join('; ')}` });
    res.json({ classes: classesOf(exam.id), accessCode: a.accessCode });
  });

  // ---------- Hoạt động: ai đã làm đề, lúc nào, mấy lần ----------

  // GET /api/admin/exams/:id/activity
  // Class Assignment: theo từng lớp được giao, đủ mọi học sinh (kể cả chưa làm).
  // Giáo viên chỉ thấy các lớp mình phụ trách (admin chính thấy mọi lớp).
  // Ngoài ra (Training Test, học sinh lớp khác...): theo từng người làm bài.
  function activityOf(exam, admin) {
    finalizeExpiredAttempts(db); // bài hết giờ chưa nộp -> chấm luôn để số liệu đúng
    const rows = db
      .prepare(
        `SELECT a.id, a.status, a.started_at, a.submitted_at, a.correct_count, a.question_total, a.score10, a.total_score,
                s.id AS student_id, s.last_name, s.first_name, s.phone, s.class_student_id
           FROM attempts a
           JOIN exam_versions v ON v.id = a.exam_version_id
           JOIN students s ON s.id = a.student_id
          WHERE v.exam_id = ?
          ORDER BY a.started_at`
      )
      .all(exam.id);
    const view = (r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
      correct: r.correct_count,
      total: r.question_total,
      score10: r.score10,
      totalScore: r.total_score,
    });
    const byClassStudent = new Map();
    for (const r of rows) {
      if (!r.class_student_id) continue;
      if (!byClassStudent.has(r.class_student_id)) byClassStudent.set(r.class_student_id, []);
      byClassStudent.get(r.class_student_id).push(view(r));
    }

    const access = accessOf(db, admin);
    const assigned = exam.category === 'homework' ? classesOf(exam.id) : [];
    const hidden = new Set(); // học sinh của lớp giáo viên này không phụ trách
    const shown = new Set();
    const classes = [];
    for (const c of assigned) {
      // Học sinh đang học + học sinh đã nghỉ nhưng có làm bài này
      const students = db
        .prepare('SELECT id, full_name AS fullName, removed_at FROM class_students WHERE class_id = ?')
        .all(c.id)
        .filter((st) => !st.removed_at || byClassStudent.has(st.id))
        .sort(byGivenName); // xếp theo tên như sổ điểm danh
      if (!access.canSeeClass(c.id)) {
        students.forEach((st) => hidden.add(st.id));
        continue;
      }
      classes.push({
        ...c,
        students: students.map((st) => {
          shown.add(st.id);
          return { classStudentId: st.id, fullName: st.fullName, isActive: !st.removed_at, attempts: byClassStudent.get(st.id) || [] };
        }),
      });
    }

    // Người làm bài không thuộc các lớp trên: gom theo từng người
    const others = new Map();
    for (const r of rows) {
      if (r.class_student_id && (shown.has(r.class_student_id) || hidden.has(r.class_student_id))) continue;
      if (!others.has(r.student_id)) {
        others.set(r.student_id, { studentId: r.student_id, name: `${r.last_name} ${r.first_name}`.trim(), phone: r.phone, attempts: [] });
      }
      others.get(r.student_id).attempts.push(view(r));
    }
    return {
      category: exam.category,
      examType: exam.exam_type,
      classes,
      others: [...others.values()],
      hiddenClasses: assigned.length - classes.length, // số lớp được giao mà giáo viên này không phụ trách
    };
  }

  router.get('/:id/activity', (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    res.json(activityOf(exam, req.admin));
  });

  // GET /api/admin/exams/:id/activity/export — tải tab Hoạt động về Excel
  router.get('/:id/activity/export', async (req, res) => {
    const exam = loadExam(req, res);
    if (!exam) return;
    const act = activityOf(exam, req.admin);
    const at = (iso) => (iso ? `${formatDate(vnDate(Date.parse(iso)))} ${new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(11, 16)}` : '');
    const result = (a) => {
      if (!a) return '';
      if (a.status !== 'submitted') return 'Đang làm';
      const score = a.totalScore !== null && a.totalScore !== undefined ? ` · ${a.totalScore} điểm TOEIC` : a.score10 !== null && a.score10 !== undefined ? ` · ${a.score10}/10` : '';
      return `${a.correct ?? 0}/${a.total ?? 0} câu${score}`;
    };
    const best = (list) => list.filter((a) => a.status === 'submitted').sort((a, b) => (b.correct ?? 0) - (a.correct ?? 0))[0];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';
    const ws = wb.addWorksheet('Hoạt động', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Lớp', key: 'cls', width: 16 },
      { header: 'Học sinh', key: 'name', width: 26 },
      { header: 'Số lần làm', key: 'count', width: 10 },
      { header: 'Lần đầu', key: 'first', width: 17 },
      { header: 'Lần gần nhất', key: 'last', width: 17 },
      { header: 'Kết quả gần nhất', key: 'result', width: 26 },
      { header: 'Kết quả cao nhất', key: 'best', width: 26 },
    ];
    const add = (cls, name, attempts, inactive = false) =>
      ws.addRow({
        cls,
        name: `${name}${inactive ? ' (đã nghỉ)' : ''}`,
        count: attempts.length || 'Chưa làm',
        first: at(attempts[0]?.startedAt),
        last: at(attempts.at(-1)?.startedAt),
        result: result(attempts.at(-1)),
        best: result(best(attempts)),
      });
    for (const c of act.classes) {
      fillRow(ws.addRow({ cls: c.name, name: `${c.students.filter((st) => st.attempts.length).length}/${c.students.length} học sinh đã làm` }), 'FFE6EFFF');
      for (const st of c.students) add(c.name, st.fullName, st.attempts, !st.isActive);
    }
    if (act.others.length) {
      if (act.classes.length) fillRow(ws.addRow({ cls: 'Người làm khác', name: `${act.others.length} người` }), 'FFE6EFFF');
      for (const o of act.others) add('', o.name, o.attempts);
    }
    styleHeader(ws.getRow(1));
    logAudit(db, { adminId: req.admin.id, action: 'export_activity', examId: exam.id, detail: `Tải hoạt động của đề "${exam.title}" về Excel` });
    await sendWorkbook(res, wb, `Hoat dong ${exam.code}.xlsx`);
  });

  return router;
}

module.exports = adminExamsRouter;
