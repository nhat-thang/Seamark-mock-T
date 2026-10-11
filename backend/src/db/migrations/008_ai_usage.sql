-- Đếm số lần gọi AI (kiểm tra đề dán vào) theo ngày, để admin biết đã dùng bao nhiêu
-- và để web tự dừng khi vượt giới hạn trong ngày (AI_DAILY_LIMIT).
CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,              -- ngày theo giờ Việt Nam, dạng YYYY-MM-DD
  calls INTEGER NOT NULL DEFAULT 0,  -- số lần gọi AI thành công
  failures INTEGER NOT NULL DEFAULT 0
);
