// Ghi lịch sử thao tác của admin (bảng audit_log).
// detail là câu mô tả tiếng Việt để admin chính đọc trực tiếp trên trang "Lịch sử chỉnh sửa".
// classId: lớp liên quan (thao tác về lớp học, học sinh, lịch học, điểm danh) để xem lịch sử riêng từng lớp.

function logAudit(db, { adminId, action, examId = null, classId = null, detail = '' }) {
  db.prepare(
    `INSERT INTO audit_log (admin_id, action, exam_id, class_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(adminId, action, examId, classId, detail, new Date().toISOString());
}

module.exports = { logAudit };
