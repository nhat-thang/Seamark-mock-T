// Ghi lịch sử đăng nhập + giới hạn số lần nhập sai.
// Quy tắc: sai 5 lần trong 15 phút (cùng tên đăng nhập + cùng IP) thì bị chặn tạm.
// Đăng nhập đúng một lần thì các lần sai trước đó không tính nữa.

const MAX_FAILS = 5;
const WINDOW_MINUTES = 15;

function recordLogin(db, { username, adminId = null, ip, userAgent, success, reason }) {
  db.prepare(
    `INSERT INTO login_history (username, admin_id, ip, user_agent, success, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(username, adminId, ip, userAgent, success ? 1 : 0, reason, new Date().toISOString());
}

/** Trả về { blocked: false } hoặc { blocked: true, minutesLeft } */
function checkLoginBlocked(db, { username, ip }) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const lastSuccess = db
    .prepare('SELECT MAX(created_at) AS t FROM login_history WHERE username = ? AND ip = ? AND success = 1')
    .get(username, ip).t;
  // Chỉ đếm các lần sai sau mốc muộn hơn: (15 phút trước) hoặc (lần đăng nhập đúng gần nhất)
  const from = lastSuccess && lastSuccess > windowStart ? lastSuccess : windowStart;

  // Không đếm các lần bị chặn (rate_limited), để người dùng không bị chặn mãi
  const fails = db
    .prepare(
      `SELECT created_at FROM login_history
        WHERE username = ? AND ip = ? AND success = 0 AND reason != 'rate_limited' AND created_at > ?
        ORDER BY created_at DESC`
    )
    .all(username, ip, from);

  if (fails.length < MAX_FAILS) return { blocked: false };

  // Được thử lại khi lần sai thứ 5 (tính từ gần nhất) đã quá 15 phút
  const unlockAt = Date.parse(fails[MAX_FAILS - 1].created_at) + WINDOW_MINUTES * 60 * 1000;
  const minutesLeft = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));
  return { blocked: true, minutesLeft };
}

module.exports = { recordLogin, checkLoginBlocked, MAX_FAILS, WINDOW_MINUTES };
