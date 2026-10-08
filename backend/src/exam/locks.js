// Khóa chỉnh sửa đề: mỗi đề chỉ một admin sửa tại một thời điểm.
//
// - Mở trang sửa -> xin khóa (giữ 2 phút).
// - Trình duyệt gửi "heartbeat" mỗi 30 giây để gia hạn.
// - Đóng trang / mất mạng quá 2 phút -> khóa tự hết hạn, người khác sửa được.
// - Người khác có thể "giành quyền chỉnh sửa" (sau khi được cảnh báo).

const LOCK_MS = 2 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + LOCK_MS).toISOString();

/** Thông tin khóa hiện tại của đề (null nếu không ai giữ hoặc đã hết hạn). */
function getLock(db, examId) {
  const row = db
    .prepare(
      `SELECT e.lock_admin_id, e.lock_expires_at, e.lock_since, a.display_name
         FROM exams e LEFT JOIN admins a ON a.id = e.lock_admin_id
        WHERE e.id = ?`
    )
    .get(examId);
  if (!row || !row.lock_admin_id || !row.lock_expires_at || row.lock_expires_at <= nowIso()) return null;
  return {
    adminId: row.lock_admin_id,
    displayName: row.display_name,
    since: row.lock_since,
    expiresAt: row.lock_expires_at,
  };
}

/**
 * Xin khóa. Thành công nếu chưa ai giữ, khóa đã hết hạn, hoặc chính mình đang giữ.
 * @returns {{ ok: true, lock } | { ok: false, lock }} lock = người đang giữ khi thất bại
 */
function acquireLock(db, examId, adminId) {
  return db.transaction(() => {
    const current = getLock(db, examId);
    if (current && current.adminId !== adminId) return { ok: false, lock: current };
    const since = current ? current.since : nowIso();
    db.prepare('UPDATE exams SET lock_admin_id = ?, lock_expires_at = ?, lock_since = ? WHERE id = ?').run(
      adminId, expiryIso(), since, examId
    );
    return { ok: true, lock: getLock(db, examId) };
  })();
}

/** Gia hạn khóa — chỉ khi mình vẫn đang giữ. */
function heartbeat(db, examId, adminId) {
  const info = db
    .prepare('UPDATE exams SET lock_expires_at = ? WHERE id = ? AND lock_admin_id = ? AND lock_expires_at > ?')
    .run(expiryIso(), examId, adminId, nowIso());
  return info.changes === 1;
}

/** Giành quyền chỉnh sửa (bất kể ai đang giữ). Trả về người bị giành (nếu có). */
function takeOverLock(db, examId, adminId) {
  return db.transaction(() => {
    const previous = getLock(db, examId);
    db.prepare('UPDATE exams SET lock_admin_id = ?, lock_expires_at = ?, lock_since = ? WHERE id = ?').run(
      adminId, expiryIso(), nowIso(), examId
    );
    return previous && previous.adminId !== adminId ? previous : null;
  })();
}

/** Trả khóa khi rời trang (chỉ khi mình đang giữ). */
function releaseLock(db, examId, adminId) {
  db.prepare(
    'UPDATE exams SET lock_admin_id = NULL, lock_expires_at = NULL, lock_since = NULL WHERE id = ? AND lock_admin_id = ?'
  ).run(examId, adminId);
}

module.exports = { LOCK_MS, getLock, acquireLock, heartbeat, takeOverLock, releaseLock };
