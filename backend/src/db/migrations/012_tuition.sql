-- HỌC PHÍ THEO BUỔI (thay cách "nhắc học phí mỗi N buổi" cũ) + thông tin phụ huynh + giáo viên phụ trách lớp.
-- CHỈ THÊM bảng / cột, không xóa dữ liệu cũ. Các bảng / cột cũ (fee_every, prior_sessions, fee_payments)
-- được giữ nguyên để xem lại lịch sử, không dùng để tính học phí nữa.

-- Cài đặt học phí của lớp (chỉ owner thấy / sửa): X buổi mỗi chu kỳ + học phí mỗi buổi.
-- price_per_session NULL = lớp chưa cài học phí (chưa tính tiền, chưa cảnh báo).
ALTER TABLE classes ADD COLUMN cycle_sessions INTEGER;
ALTER TABLE classes ADD COLUMN price_per_session INTEGER;
UPDATE classes SET cycle_sessions = fee_every WHERE fee_every > 0;

-- Học sinh: thông tin phụ huynh (cột phone cũ giờ là "SĐT phụ huynh"), buổi bắt đầu học, giảm giá
ALTER TABLE class_students ADD COLUMN parent_name TEXT NOT NULL DEFAULT '';
ALTER TABLE class_students ADD COLUMN parent_id_number TEXT NOT NULL DEFAULT ''; -- số CCCD của phụ huynh
-- Buổi bắt đầu học = buổi đầu tiên của lớp có giờ bắt đầu >= start_at (UTC).
-- Lưu bằng thời điểm (không bằng số thứ tự) để thêm / xóa buổi khác không làm sai; xóa đúng buổi đó thì tự là buổi kế tiếp.
ALTER TABLE class_students ADD COLUMN start_at TEXT;
ALTER TABLE class_students ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0; -- giảm giá cho học sinh đặc biệt (0–100)
ALTER TABLE class_students ADD COLUMN discount_note TEXT NOT NULL DEFAULT '';
-- Dữ liệu cũ: ngày vào học -> buổi bắt đầu = buổi đầu tiên từ 0 giờ ngày đó (giờ Việt Nam = UTC+7)
UPDATE class_students SET start_at = strftime('%Y-%m-%dT%H:%M:%fZ', joined_on || 'T00:00:00', '-7 hours');

-- Giáo viên phụ trách lớp (một lớp nhiều giáo viên). Admin chỉ thấy / thao tác các lớp mình phụ trách.
CREATE TABLE class_teachers (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  PRIMARY KEY (class_id, admin_id)
);
CREATE INDEX idx_class_teachers_admin ON class_teachers(admin_id);

-- Giáo viên dạy từng buổi (một buổi có thể nhiều giáo viên dạy cùng).
-- class_sessions.teacher_admin_id giữ = giáo viên đầu tiên (để dữ liệu cũ vẫn đọc được); teacher_name = giáo viên ngoài.
CREATE TABLE session_teachers (
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  admin_id   INTEGER NOT NULL REFERENCES admins(id),
  PRIMARY KEY (session_id, admin_id)
);
CREATE INDEX idx_session_teachers_admin ON session_teachers(admin_id);

-- Dữ liệu cũ: giáo viên của từng buổi -> session_teachers, và thành giáo viên phụ trách lớp
INSERT INTO session_teachers (session_id, admin_id)
  SELECT id, teacher_admin_id FROM class_sessions WHERE teacher_admin_id IS NOT NULL;
INSERT OR IGNORE INTO class_teachers (class_id, admin_id)
  SELECT DISTINCT class_id, teacher_admin_id FROM class_sessions WHERE teacher_admin_id IS NOT NULL;

-- Mỗi dòng = một chu kỳ học phí ĐÃ THU của một học sinh. Số tiền được chốt lúc thu.
-- session_ids: danh sách buổi của chu kỳ lúc thu (để báo lệch nếu sau đó thêm / xóa buổi).
-- due_amount: số tiền phải thu (số buổi × giá × giảm giá) lúc thu; amount: số tiền owner ghi là đã thu
-- (thường bằng due_amount; khác nhau thì trang Quản lý học phí hiện "còn thiếu").
CREATE TABLE tuition_payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  cycle_no          INTEGER NOT NULL,
  session_count     INTEGER NOT NULL,
  due_amount        INTEGER NOT NULL,
  amount            INTEGER NOT NULL,
  price_per_session INTEGER NOT NULL,
  discount_percent  INTEGER NOT NULL DEFAULT 0,
  session_ids       TEXT NOT NULL,
  paid_on           TEXT NOT NULL,                                        -- ngày thu (YYYY-MM-DD giờ VN)
  method            TEXT NOT NULL CHECK (method IN ('cash', 'transfer')), -- tiền mặt / chuyển khoản
  note              TEXT NOT NULL DEFAULT '',
  created_by        INTEGER REFERENCES admins(id),
  created_at        TEXT NOT NULL,
  UNIQUE (student_id, cycle_no)
);

-- Owner tắt cảnh báo học phí của một học sinh cho MỘT chu kỳ (chu kỳ sau vẫn cảnh báo bình thường)
CREATE TABLE tuition_alert_snoozes (
  student_id INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  cycle_no   INTEGER NOT NULL,
  created_by INTEGER REFERENCES admins(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (student_id, cycle_no)
);

-- Lịch sử thu học phí / tắt cảnh báo của từng học sinh (không xóa: bỏ "Đã thu" cũng ghi lại một dòng)
CREATE TABLE tuition_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES class_students(id) ON DELETE CASCADE,
  cycle_no   INTEGER NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('pay', 'unpay', 'snooze', 'unsnooze')),
  amount     INTEGER,             -- số tiền đã thu (pay) / số tiền bị bỏ (unpay)
  paid_on    TEXT,
  method     TEXT,
  note       TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES admins(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tuition_events_student ON tuition_events(student_id, created_at);
