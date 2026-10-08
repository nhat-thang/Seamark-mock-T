// Quản lý phiên đăng nhập admin (lưu trong bảng sessions).
const crypto = require('crypto');

const COOKIE_NAME = 'seamark_sid';
// Không thao tác gì quá 12 giờ thì phiên hết hạn, phải đăng nhập lại
const IDLE_HOURS = 12;
// Chỉ gia hạn phiên tối đa 1 lần mỗi 5 phút, tránh ghi database ở mọi request
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + IDLE_HOURS * 3600 * 1000).toISOString();

// Băm mã phiên bằng HMAC với SESSION_SECRET.
// Đổi SESSION_SECRET thì mọi phiên cũ mất hiệu lực (mọi người phải đăng nhập lại).
function hashToken(token, secret) {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

/** Tạo phiên mới, trả về mã (đặt vào cookie). */
function createSession(db, { adminId, secret, ip, userAgent }) {
  // Dọn các phiên đã hết hạn
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());

  const token = crypto.randomBytes(32).toString('base64url');
  const now = nowIso();
  db.prepare(
    `INSERT INTO sessions (token_hash, admin_id, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(hashToken(token, secret), adminId, ip, userAgent, now, now, expiryIso());
  return token;
}

/**
 * Tìm admin đang đăng nhập theo mã phiên.
 * Trả về null nếu phiên không tồn tại, đã hết hạn, hoặc tài khoản đã bị vô hiệu hóa.
 */
function findSessionAdmin(db, token, secret) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.last_seen_at,
              a.id, a.username, a.display_name, a.role
         FROM sessions s
         JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND a.is_active = 1`
    )
    .get(hashToken(token, secret), nowIso());
  if (!row) return null;

  // Còn đang dùng -> gia hạn thêm IDLE_HOURS
  if (Date.now() - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      nowIso(), expiryIso(), row.session_id
    );
  }
  return {
    sessionId: row.session_id,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}

function deleteSession(db, token, secret) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token, secret));
}

/** Đăng xuất một admin khỏi mọi nơi (trừ phiên exceptSessionId nếu có). */
function deleteSessionsOfAdmin(db, adminId, exceptSessionId = null) {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id IS NOT ?').run(adminId, exceptSessionId);
}

module.exports = {
  COOKIE_NAME,
  createSession,
  findSessionAdmin,
  deleteSession,
  deleteSessionsOfAdmin,
};
