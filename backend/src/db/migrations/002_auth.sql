-- Đăng nhập admin: phiên đăng nhập + lịch sử đăng nhập.

-- Phiên đăng nhập. Trình duyệt giữ mã ngẫu nhiên trong cookie httpOnly,
-- database chỉ lưu bản băm (token_hash) để lộ database cũng không dùng lại được mã.
CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT NOT NULL UNIQUE,
  admin_id     INTEGER NOT NULL REFERENCES admins(id),
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX idx_sessions_admin ON sessions(admin_id);

-- Mọi lần đăng nhập (thành công và thất bại).
-- Dùng cho: trang "Lịch sử đăng nhập" của admin chính + giới hạn số lần nhập sai.
-- reason: ok | wrong_password | unknown_user | disabled | rate_limited
CREATE TABLE login_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  admin_id   INTEGER REFERENCES admins(id),
  ip         TEXT,
  user_agent TEXT,
  success    INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_history_user_ip ON login_history(username, ip, created_at);
CREATE INDEX idx_login_history_created ON login_history(created_at);

CREATE INDEX idx_audit_log_created ON audit_log(created_at);
