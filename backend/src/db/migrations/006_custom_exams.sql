-- Đề tự thiết kế + xáo trộn câu hỏi + hướng dẫn từng bước cho admin.
-- Chỉ THÊM cột, không đổi dữ liệu cũ.

-- Thứ tự câu học viên thấy (JSON mảng số câu) — chỉ có khi đề bật "xáo trộn câu hỏi"
ALTER TABLE attempts ADD COLUMN question_order TEXT;
-- Kết quả chung cho mọi loại đề: số câu đúng / tổng số câu / điểm thang 10
ALTER TABLE attempts ADD COLUMN correct_count INTEGER;
ALTER TABLE attempts ADD COLUMN question_total INTEGER;
ALTER TABLE attempts ADD COLUMN score10 REAL;

UPDATE attempts
   SET question_total = (SELECT v.question_count FROM exam_versions v WHERE v.id = attempts.exam_version_id);
UPDATE attempts
   SET correct_count = COALESCE(listening_correct, 0) + COALESCE(reading_correct, 0),
       score10 = CASE WHEN question_total > 0
                      THEN ROUND((COALESCE(listening_correct, 0) + COALESCE(reading_correct, 0)) * 10.0 / question_total, 1)
                 END
 WHERE status = 'submitted';

-- Các phần hướng dẫn từng bước admin đã xem / bỏ qua (JSON mảng tên)
ALTER TABLE admins ADD COLUMN tours_done TEXT NOT NULL DEFAULT '[]';
