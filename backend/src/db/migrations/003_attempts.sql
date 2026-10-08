-- Học viên làm bài.

-- Đã chốt: gộp học viên theo số điện thoại (mỗi SĐT là một học viên)
DROP INDEX idx_students_phone;
CREATE UNIQUE INDEX idx_students_phone ON students(phone);

-- Mã bí mật của lượt làm bài (học viên không đăng nhập):
-- trình duyệt giữ mã này, mọi request lưu bài / nộp bài phải gửi kèm.
ALTER TABLE attempts ADD COLUMN access_token TEXT;
CREATE UNIQUE INDEX idx_attempts_token ON attempts(access_token);

-- Tìm nhanh các lượt đang làm đã quá giờ để tự nộp
CREATE INDEX idx_attempts_status_deadline ON attempts(status, deadline_at);
