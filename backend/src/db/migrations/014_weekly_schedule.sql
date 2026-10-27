-- LỊCH HỌC HẰNG TUẦN (lặp lại mãi) + KHÓA LỚP.
-- Admin chính chỉ chọn các thứ trong tuần + giờ học của từng thứ, không chọn ngày bắt đầu / kết thúc.
-- Server tự xếp sẵn các buổi sắp tới (vài tháng) và mỗi ngày xếp nối thêm, cho tới khi lớp bị khóa.

CREATE TABLE class_weekly (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id     INTEGER NOT NULL REFERENCES classes(id),
  series_id    TEXT NOT NULL UNIQUE,         -- = class_sessions.series_id của các buổi được xếp từ lịch này
  slots        TEXT NOT NULL,                -- JSON [{ "weekday": 2, "startTime": "17:00", "endTime": "18:30" }] (1 = Thứ 2 … 7 = CN)
  teacher_ids  TEXT NOT NULL DEFAULT '[]',   -- JSON id các giáo viên có tài khoản
  teacher_name TEXT NOT NULL DEFAULT '',     -- giáo viên ngoài (không có tài khoản)
  room         TEXT NOT NULL DEFAULT '',
  filled_until TEXT NOT NULL,                -- đã xếp buổi tới hết ngày này (YYYY-MM-DD giờ VN)
  stopped_at   TEXT,                         -- lịch đã dừng (khóa lớp, hoặc xóa "buổi này và các buổi sau")
  created_by   INTEGER REFERENCES admins(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_class_weekly_class ON class_weekly(class_id);

-- Khóa lớp (lớp đã kết thúc): dừng lịch hằng tuần, xóa các buổi chưa học. Mở lại được.
ALTER TABLE classes ADD COLUMN closed_at TEXT;
ALTER TABLE classes ADD COLUMN closed_by INTEGER REFERENCES admins(id);
