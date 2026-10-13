// Phân quyền theo lớp (đã chốt với người dùng):
// - owner (admin chính): mọi lớp, mọi thông tin.
// - admin (giáo viên): chỉ các lớp mình phụ trách (bảng class_teachers). Giáo viên được owner xếp dạy một buổi
//   của lớp tự thành giáo viên phụ trách lớp đó.

function accessOf(db, admin) {
  const isOwner = admin.role === 'owner';
  const classIds = isOwner
    ? null
    : new Set(db.prepare('SELECT class_id FROM class_teachers WHERE admin_id = ?').all(admin.id).map((r) => r.class_id));
  return {
    isOwner,
    /** Lớp này có thuộc người đang đăng nhập không */
    canSeeClass: (classId) => isOwner || classIds.has(classId),
    classIds,
  };
}

/** Thêm giáo viên phụ trách lớp (bỏ qua nếu đã có) */
function addClassTeachers(db, classId, adminIds) {
  const add = db.prepare('INSERT OR IGNORE INTO class_teachers (class_id, admin_id) VALUES (?, ?)');
  for (const id of adminIds) add.run(classId, id);
}

module.exports = { accessOf, addClassTeachers };
