-- Cấu trúc database ban đầu. Thời gian lưu dạng chuỗi ISO (UTC).

-- Tài khoản admin. role: 'owner' (Chủ trung tâm) hoặc 'admin'
CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Đề thi. Mọi chỉnh sửa ghi vào draft_json; học viên chỉ đọc bản đã xuất bản (exam_versions).
CREATE TABLE exams (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  exam_type            TEXT NOT NULL DEFAULT 'TOEIC_LR',
  duration_minutes     INTEGER NOT NULL DEFAULT 120,
  internal_note        TEXT NOT NULL DEFAULT '',
  allow_seek_audio     INTEGER NOT NULL DEFAULT 0,
  show_answers_after   INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  draft_json           TEXT,
  published_version_id INTEGER,
  lock_admin_id        INTEGER REFERENCES admins(id),
  lock_expires_at      TEXT,
  version              INTEGER NOT NULL DEFAULT 1,
  updated_by           INTEGER REFERENCES admins(id),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Bản xuất bản: BẤT BIẾN. Lượt làm bài trỏ tới đúng version đã làm.
-- title, duration_minutes, question_count được chụp lại lúc xuất bản
-- để việc sửa nháp không ảnh hưởng học viên.
CREATE TABLE exam_versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id          INTEGER NOT NULL REFERENCES exams(id),
  version_no       INTEGER NOT NULL,
  title            TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  question_count   INTEGER NOT NULL DEFAULT 0,
  content_json     TEXT NOT NULL,
  published_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_by     INTEGER REFERENCES admins(id),
  UNIQUE (exam_id, version_no)
);

-- File upload (ảnh, audio). stored_name là tên ngẫu nhiên trong DATA_DIR.
CREATE TABLE media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id       INTEGER REFERENCES exams(id),
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Học viên (không đăng nhập)
CREATE TABLE students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name  TEXT NOT NULL,
  first_name TEXT NOT NULL,
  phone      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_students_phone ON students(phone);

-- Lượt làm bài
CREATE TABLE attempts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL REFERENCES students(id),
  exam_version_id   INTEGER NOT NULL REFERENCES exam_versions(id),
  started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deadline_at       TEXT NOT NULL,
  submitted_at      TEXT,
  answers_json      TEXT NOT NULL DEFAULT '{}',
  flagged_json      TEXT NOT NULL DEFAULT '[]',
  listening_correct INTEGER,
  reading_correct   INTEGER,
  listening_score   INTEGER,
  reading_score     INTEGER,
  total_score       INTEGER,
  status            TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted'))
);
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_version ON attempts(exam_version_id);

-- Lịch sử thao tác của admin
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER REFERENCES admins(id),
  action     TEXT NOT NULL,
  exam_id    INTEGER REFERENCES exams(id),
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
