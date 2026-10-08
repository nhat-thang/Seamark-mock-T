-- Khung mẫu đề: lưu CẤU TRÚC của một đề tự thiết kế (các Part, số question, số lựa chọn, nhóm đọc hiểu),
-- không lưu nội dung câu hỏi / đáp án / file. Hiện trong "Tạo đề mới" như một loại đề.
CREATE TABLE exam_templates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  structure_json   TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  -- Đề gốc dùng để tạo khung (để "Cập nhật khung mẫu" từ đề đó). Đề gốc bị xóa thì để NULL.
  source_exam_id   INTEGER UNIQUE REFERENCES exams(id) ON DELETE SET NULL,
  created_by       INTEGER REFERENCES admins(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
