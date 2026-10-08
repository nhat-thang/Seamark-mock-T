-- File ảnh / audio của đề.
-- Xóa file chỉ đánh dấu deleted_at (ẩn khỏi danh sách), KHÔNG xóa file trên đĩa,
-- vì các bản đã xuất bản (bất biến) có thể vẫn đang dùng file đó.
ALTER TABLE media ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_media_exam ON media(exam_id, deleted_at);
