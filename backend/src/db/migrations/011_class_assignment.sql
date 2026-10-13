-- Hai cách làm bài (đã chốt với người dùng):
--   Training Test    : cho mọi người, học viên chỉ nhập họ tên (không cần SĐT) rồi chọn đề.     exams.category = 'exam'
--   Class Assignment : đề riêng của lớp; học sinh chọn lớp -> bấm tên mình -> chọn đề.          exams.category = 'homework'
-- (Giá trị 'homework' giữ nguyên trong database vì SQLite không sửa được ràng buộc CHECK; trên giao diện gọi là "Class Assignment".)

-- Các đề "Homework" tạo trước đây chưa gắn lớp nào -> thành đề Training Test (giữ nguyên tên)
UPDATE exams SET category = 'exam' WHERE category = 'homework';

-- Một đề Class Assignment giao cho một hoặc nhiều lớp
CREATE TABLE exam_classes (
  exam_id  INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);
CREATE INDEX idx_exam_classes_class ON exam_classes(class_id);

-- Mật khẩu đề (chỉ đề Class Assignment, không bắt buộc; trống = không cần mật khẩu).
-- Lưu dạng chữ để giáo viên xem lại và đọc cho học sinh; KHÔNG BAO GIỜ trả về ở API phía học viên.
ALTER TABLE exams ADD COLUMN access_code TEXT NOT NULL DEFAULT '';

-- Người làm bài gắn với học sinh của lớp (Class Assignment): học sinh bấm tên mình là được nhận ra luôn
ALTER TABLE students ADD COLUMN class_student_id INTEGER REFERENCES class_students(id);
CREATE UNIQUE INDEX idx_students_class_student ON students(class_student_id) WHERE class_student_id IS NOT NULL;

-- Training Test không cần SĐT nữa: SĐT trống được phép trùng, SĐT có ghi thì vẫn mỗi số một người
DROP INDEX idx_students_phone;
CREATE UNIQUE INDEX idx_students_phone ON students(phone) WHERE phone <> '';
CREATE INDEX idx_students_name ON students(last_name, first_name);
