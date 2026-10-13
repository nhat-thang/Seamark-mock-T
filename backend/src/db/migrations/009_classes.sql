-- Lớp học + học sinh của lớp + thời khóa biểu + điểm danh + nhắc học phí + thông báo cho giáo viên.
-- Học sinh của lớp KHÔNG dùng chung bảng students (học viên làm bài thi): học sinh lớp không cần SĐT,
-- và mỗi lần vào một lớp là một dòng riêng (tính buổi học, học phí theo từng lớp).
-- Thời gian dạng chuỗi ISO (UTC); ngày "YYYY-MM-DD" và giờ "HH:MM" tính theo giờ Việt Nam.

CREATE TABLE classes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'blue',  -- màu của lớp trên thời khóa biểu
  note        TEXT NOT NULL DEFAULT '',
  fee_every   INTEGER NOT NULL DEFAULT 0,    -- nhắc học phí mỗi N buổi học của học sinh (0 = không nhắc)
  deleted_at  TEXT,                          -- xóa mềm: lớp bị ẩn, admin chính khôi phục được
  deleted_by  INTEGER REFERENCES admins(id),
  created_by  INTEGER REFERENCES admins(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Học sinh trong lớp
CREATE TABLE class_students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id       INTEGER NOT NULL REFERENCES classes(id),
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  joined_on      TEXT NOT NULL,              -- ngày vào học: chỉ hiện trong điểm danh các buổi từ ngày này
  prior_sessions INTEGER NOT NULL DEFAULT 0, -- số buổi đã học trước khi đưa lên web (cộng vào khi tính học phí)
  removed_at     TEXT,                       -- đã nghỉ học (vẫn giữ lịch sử điểm danh)
  removed_by     INTEGER REFERENCES admins(id),
  created_by     INTEGER REFERENCES admins(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_class_students_class ON class_students(class_id);

-- Mỗi buổi học trên thời khóa biểu (chỉ admin chính xếp)
CREATE TABLE class_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id         INTEGER NOT NULL REFERENCES classes(id),
  date             TEXT NOT NULL,            -- YYYY-MM-DD
  start_time       TEXT NOT NULL,            -- HH:MM
  end_time         TEXT NOT NULL,
  starts_at        TEXT NOT NULL,            -- = date + start_time đổi sang UTC (để so sánh thời gian)
  ends_at          TEXT NOT NULL,
  teacher_admin_id INTEGER REFERENCES admins(id), -- giáo viên có tài khoản
  teacher_name     TEXT NOT NULL DEFAULT '',      -- giáo viên "Khác" (không có tài khoản)
  room             TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  series_id        TEXT,                     -- các buổi tạo cùng lúc bằng "Lặp lại hằng tuần"
  started_at       TEXT,                     -- giáo viên bấm "Bắt đầu buổi học"
  started_by       INTEGER REFERENCES admins(id),
  attendance_at    TEXT,                     -- lần đầu lưu điểm danh: có giá trị = buổi đã học
  attendance_by    INTEGER REFERENCES admins(id),
  created_by       INTEGER REFERENCES admins(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_class_sessions_starts ON class_sessions(starts_at);
CREATE INDEX idx_class_sessions_class ON class_sessions(class_id, starts_at);
CREATE INDEX idx_class_sessions_teacher ON class_sessions(teacher_admin_id, starts_at);
CREATE INDEX idx_class_sessions_series ON class_sessions(series_id);

-- Điểm danh + điểm cộng của từng học sinh trong từng buổi.
-- Mỗi dòng = học sinh được tính 1 buổi học (kể cả vắng) khi tính học phí.
CREATE TABLE attendance (
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  bonus      INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES admins(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- Mỗi lần bấm "Đã thu học phí" = hết nhắc một đợt (cycle_no = 1, 2, 3...)
CREATE TABLE fee_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  cycle_no    INTEGER NOT NULL,
  sessions_at INTEGER NOT NULL,              -- số buổi đã học lúc bấm
  note        TEXT NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES admins(id),
  created_at  TEXT NOT NULL,
  UNIQUE (student_id, cycle_no)
);

-- Thông báo trên web cho giáo viên (ví dụ: "Admin chính vừa xếp lịch dạy cho bạn").
-- Nhắc "sắp tới giờ dạy" không lưu ở đây mà tính trực tiếp từ thời khóa biểu.
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL REFERENCES admins(id),
  text       TEXT NOT NULL,
  link       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX idx_notifications_admin ON notifications(admin_id, created_at);

-- Lịch sử chỉnh sửa: ghi thêm lớp liên quan (để xem lịch sử riêng của từng lớp)
ALTER TABLE audit_log ADD COLUMN class_id INTEGER REFERENCES classes(id);
CREATE INDEX idx_audit_log_class ON audit_log(class_id, created_at);
