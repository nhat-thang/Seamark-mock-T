-- Bài tập về nhà (homework): một "mục đích" của đề, bên trong vẫn là đề TOEIC / đề tự thiết kế như bình thường.
-- category: 'exam' = đề thi thử (như trước), 'homework' = bài tập về nhà (tên luôn bắt đầu bằng "Homework - ").
-- created_by: giáo viên ra đề (hiện cho học viên ở danh sách homework, lọc kết quả theo giáo viên).
ALTER TABLE exams ADD COLUMN category TEXT NOT NULL DEFAULT 'exam' CHECK (category IN ('exam', 'homework'));
ALTER TABLE exams ADD COLUMN created_by INTEGER REFERENCES admins(id);

-- Đề đã có: lấy người tạo từ lịch sử chỉnh sửa, không có thì lấy người sửa gần nhất
UPDATE exams
   SET created_by = (SELECT l.admin_id FROM audit_log l
                      WHERE l.exam_id = exams.id AND l.action = 'create_exam' ORDER BY l.id LIMIT 1);
UPDATE exams SET created_by = updated_by WHERE created_by IS NULL;

CREATE INDEX idx_exams_category ON exams(category);
