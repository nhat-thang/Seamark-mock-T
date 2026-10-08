// API kết quả làm bài cho admin (mọi admin). requireAdmin được gắn ở app.js.
//   GET /api/admin/results          danh sách lượt làm bài (lọc + phân trang)
//   GET /api/admin/results/export   xuất Excel theo cùng bộ lọc
//   GET /api/admin/results/:id      chi tiết một lượt làm bài
// SĐT học viên chỉ trả ra ở các API admin này.
const express = require('express');
const ExcelJS = require('exceljs');
const { foldText } = require('../db');
const { paginate, addDateFilter } = require('../listUtils');
const { gradeAttempt } = require('../exam/grading');
const { isListening } = require('../exam/content');
const { withFileUrls } = require('../exam/files');
const { partsOf } = require('../exam/parts');
const { finalizeExpiredAttempts } = require('../exam/attempts');
const { logAudit } = require('../audit');

const EXPORT_LIMIT = 5000;

const FROM = `FROM attempts a
  JOIN students s ON s.id = a.student_id
  JOIN exam_versions v ON v.id = a.exam_version_id
  JOIN exams e ON e.id = v.exam_id`;

const SELECT = `SELECT a.id, a.status, a.started_at, a.submitted_at, a.deadline_at, a.answers_json, a.exam_version_id,
  a.listening_correct, a.reading_correct, a.listening_score, a.reading_score, a.total_score,
  a.correct_count, a.question_total, a.score10, e.exam_type,
  s.id AS student_id, s.last_name, s.first_name, s.phone,
  e.id AS exam_id, e.code AS exam_code, v.title AS exam_title, v.version_no, v.question_count`;

// Giờ Việt Nam dạng "08/10/2026 14:05" (dùng trong file Excel)
const VN_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
function vnTime(iso) {
  if (!iso) return '';
  const p = Object.fromEntries(VN_FORMAT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Điều kiện lọc từ query: name, phone, examId, status, from, to */
function buildFilters(q) {
  const where = [];
  const params = [];
  const name = foldText(String(q.name || '').trim());
  if (name) {
    where.push(`fold(s.last_name || ' ' || s.first_name) LIKE ?`);
    params.push(`%${name}%`);
  }
  const phone = String(q.phone || '').replace(/\D/g, '');
  if (phone) {
    where.push('s.phone LIKE ?');
    params.push(`%${phone}%`);
  }
  const examId = Number.parseInt(q.examId, 10);
  if (examId) {
    where.push('e.id = ?');
    params.push(examId);
  }
  if (q.status === 'submitted' || q.status === 'in_progress') {
    where.push('a.status = ?');
    params.push(q.status);
  }
  addDateFilter(q, 'a.started_at', where, params);
  return { where, params };
}

function resultsRouter(db) {
  const router = express.Router();

  // Nội dung các bản đề (đọc 1 lần cho mỗi version, dùng để đếm số câu từng phần / chấm chi tiết)
  function versionContents(versionIds) {
    const map = new Map();
    const stmt = db.prepare('SELECT content_json FROM exam_versions WHERE id = ?');
    for (const id of new Set(versionIds)) map.set(id, JSON.parse(stmt.get(id).content_json));
    return map;
  }

  function sectionTotals(content) {
    let listening = 0;
    let reading = 0;
    for (const q of content.questions) (isListening(q.part) ? listening++ : reading++);
    return { listening, reading };
  }

  function listItem(r, content) {
    const totals = sectionTotals(content);
    const answers = JSON.parse(r.answers_json || '{}');
    const end = r.submitted_at || null;
    return {
      id: r.id,
      status: r.status,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
      minutesUsed: end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(r.started_at)) / 60000)) : null,
      student: { id: r.student_id, lastName: r.last_name, firstName: r.first_name, phone: r.phone },
      exam: { id: r.exam_id, code: r.exam_code, title: r.exam_title, versionNo: r.version_no, examType: r.exam_type },
      answered: Object.keys(answers).length,
      questionCount: r.question_count,
      listening: { correct: r.listening_correct, total: totals.listening, score: r.listening_score },
      reading: { correct: r.reading_correct, total: totals.reading, score: r.reading_score },
      totalScore: r.total_score,
      // Chung cho mọi loại đề (đề tự thiết kế chỉ dùng phần này)
      correct: r.correct_count,
      total: r.question_total ?? r.question_count,
      score10: r.score10,
    };
  }

  // GET /api/admin/results
  router.get('/', (req, res) => {
    finalizeExpiredAttempts(db); // bài đã hết giờ mà chưa nộp -> chấm luôn để danh sách đúng
    const { where, params } = buildFilters(req.query);
    const result = paginate(db, { select: SELECT, from: FROM, where, params, orderBy: 'a.started_at DESC, a.id DESC', page: req.query.page });
    const contents = versionContents(result.rows.map((r) => r.exam_version_id));
    res.json({
      items: result.rows.map((r) => listItem(r, contents.get(r.exam_version_id))),
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  });

  // GET /api/admin/results/export — file Excel
  router.get('/export', async (req, res) => {
    finalizeExpiredAttempts(db);
    const { where, params } = buildFilters(req.query);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(`${SELECT} ${FROM} ${whereSql} ORDER BY a.started_at DESC, a.id DESC LIMIT ?`)
      .all(...params, EXPORT_LIMIT);
    const contents = versionContents(rows.map((r) => r.exam_version_id));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark TOEIC';

    // ----- Trang 1: mỗi lượt làm bài một dòng -----
    const ws = wb.addWorksheet('Kết quả', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Bắt đầu', key: 'started', width: 17 },
      { header: 'Nộp bài', key: 'submitted', width: 17 },
      { header: 'Họ', key: 'last', width: 18 },
      { header: 'Tên', key: 'first', width: 12 },
      { header: 'SĐT', key: 'phone', width: 13 },
      { header: 'Mã đề', key: 'code', width: 14 },
      { header: 'Tên đề', key: 'title', width: 30 },
      { header: 'Lần xuất bản', key: 'ver', width: 8 },
      { header: 'Trạng thái', key: 'status', width: 12 },
      { header: 'Listening đúng', key: 'lc', width: 10 },
      { header: 'Reading đúng', key: 'rc', width: 10 },
      { header: 'Điểm Listening (ước tính)', key: 'ls', width: 12 },
      { header: 'Điểm Reading (ước tính)', key: 'rs', width: 12 },
      { header: 'Tổng điểm TOEIC (ước tính)', key: 'ts', width: 12 },
      { header: 'Số câu đúng', key: 'cc', width: 10 },
      { header: 'Điểm thang 10', key: 's10', width: 9 },
    ];
    rows.forEach((r, i) => {
      const item = listItem(r, contents.get(r.exam_version_id));
      ws.addRow({
        stt: i + 1,
        started: vnTime(r.started_at),
        submitted: vnTime(r.submitted_at),
        last: r.last_name,
        first: r.first_name,
        phone: r.phone, // giữ dạng chữ để không mất số 0 ở đầu
        code: r.exam_code,
        title: r.exam_title,
        ver: r.version_no,
        status: r.status === 'submitted' ? 'Đã nộp' : 'Đang làm',
        lc: item.listening.total ? `${item.listening.correct ?? ''}/${item.listening.total}` : '',
        rc: item.reading.total ? `${item.reading.correct ?? ''}/${item.reading.total}` : '',
        ls: r.listening_score ?? '',
        rs: r.reading_score ?? '',
        ts: r.total_score ?? '',
        cc: item.correct !== null ? `${item.correct}/${item.total}` : '',
        s10: r.score10 ?? '',
      });
    });
    styleHeader(ws.getRow(1));

    // ----- Trang 2: học viên chọn gì ở từng câu (xanh = đúng, đỏ = sai) -----
    const detail = wb.addWorksheet('Đáp án từng câu', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
    const allNos = [...new Set([...contents.values()].flatMap((c) => c.questions.map((q) => q.no)))].sort((a, b) => a - b);
    detail.addRow(['Họ tên', 'SĐT', 'Đề', ...allNos.map((n) => `Câu ${n}`)]);
    // Dòng 2: đáp án đúng (nếu chỉ lọc 1 đề)
    const singleVersion = contents.size === 1 ? [...contents.values()][0] : null;
    const keyRow = detail.addRow([
      'Đáp án đúng', '', singleVersion ? '' : '(nhiều đề — xem màu ô)',
      ...allNos.map((n) => singleVersion?.questions.find((q) => q.no === n)?.answer || ''),
    ]);
    keyRow.font = { bold: true, color: { argb: 'FF1E7B4F' } };
    for (const r of rows) {
      const content = contents.get(r.exam_version_id);
      const g = gradeAttempt(content, JSON.parse(r.answers_json || '{}'));
      const byNo = new Map(g.details.map((d) => [d.no, d]));
      const row = detail.addRow([`${r.last_name} ${r.first_name}`, r.phone, r.exam_code, ...allNos.map((n) => byNo.get(n)?.chosen || '')]);
      allNos.forEach((n, i) => {
        const d = byNo.get(n);
        if (!d) return;
        const cell = row.getCell(4 + i);
        cell.alignment = { horizontal: 'center' };
        if (d.chosen) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: d.isCorrect ? 'FFE6F5EC' : 'FFFDECEA' } };
        }
      });
    }
    detail.getColumn(1).width = 24;
    detail.getColumn(2).width = 13;
    detail.getColumn(3).width = 14;
    for (let i = 4; i < 4 + allNos.length; i++) detail.getColumn(i).width = 7;
    styleHeader(detail.getRow(1));

    logAudit(db, {
      adminId: req.admin.id,
      action: 'export_results',
      detail: `Xuất Excel ${rows.length} lượt làm bài${rows.length === EXPORT_LIMIT ? ` (giới hạn ${EXPORT_LIMIT} dòng)` : ''}`,
    });

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ket-qua-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // GET /api/admin/results/:id — chi tiết một lượt làm bài (luôn có đáp án, kể cả khi học viên không được xem)
  router.get('/:id', (req, res) => {
    finalizeExpiredAttempts(db);
    const r = db.prepare(`${SELECT} ${FROM} WHERE a.id = ?`).get(Number.parseInt(req.params.id, 10) || 0);
    if (!r) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });

    const content = JSON.parse(db.prepare('SELECT content_json FROM exam_versions WHERE id = ?').get(r.exam_version_id).content_json);
    const answers = JSON.parse(r.answers_json || '{}');
    const g = gradeAttempt(content, answers);

    // Các lần làm khác của cùng học viên (gộp theo SĐT)
    const others = db
      .prepare(
        `SELECT a.id, a.status, a.started_at, a.reading_correct, a.listening_correct, a.total_score, v.title
           FROM attempts a JOIN exam_versions v ON v.id = a.exam_version_id
          WHERE a.student_id = ? AND a.id != ? ORDER BY a.started_at DESC LIMIT 50`
      )
      .all(r.student_id, r.id)
      .map((o) => ({
        id: o.id, status: o.status, startedAt: o.started_at, examTitle: o.title,
        listeningCorrect: o.listening_correct, readingCorrect: o.reading_correct, totalScore: o.total_score,
      }));

    res.json({
      attempt: listItem(r, content),
      deadlineAt: r.deadline_at,
      result: {
        listeningCorrect: g.listeningCorrect,
        listeningTotal: g.listeningTotal,
        readingCorrect: g.readingCorrect,
        readingTotal: g.readingTotal,
        listeningScore: r.status === 'submitted' ? g.listeningScore : null,
        readingScore: r.status === 'submitted' ? g.readingScore : null,
        totalScore: r.status === 'submitted' ? g.totalScore : null,
        examType: content.examType || 'TOEIC_LR',
        correct: g.correct,
        total: g.total,
        score10: g.score10,
        parts: g.parts,
        details: g.details,
        content: { ...withFileUrls(content), parts: partsOf(content) },
      },
      otherAttempts: others,
    });
  });

  return router;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4FA8' } };
  });
}

module.exports = resultsRouter;
