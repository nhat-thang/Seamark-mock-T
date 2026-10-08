// Ghi lịch sử thao tác của admin (bảng audit_log).
// detail là câu mô tả tiếng Việt để admin chính đọc trực tiếp trên trang "Lịch sử chỉnh sửa".

function logAudit(db, { adminId, action, examId = null, detail = '' }) {
  db.prepare(
    `INSERT INTO audit_log (admin_id, action, exam_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(adminId, action, examId, detail, new Date().toISOString());
}

module.exports = { logAudit };
