-- Quản lý đề: khóa chỉnh sửa + chụp lại cài đặt lúc xuất bản.

-- Thời điểm người đang giữ khóa bắt đầu sửa (để hiện "Cô X đang chỉnh sửa từ 14:05")
ALTER TABLE exams ADD COLUMN lock_since TEXT;

-- Cài đặt hiển thị được chốt theo từng bản xuất bản:
-- admin sửa cài đặt thì học viên chưa bị ảnh hưởng cho tới khi xuất bản lại.
ALTER TABLE exam_versions ADD COLUMN allow_seek_audio INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exam_versions ADD COLUMN show_answers_after INTEGER NOT NULL DEFAULT 0;
-- exams.version tại thời điểm xuất bản (để biết bản nháp có thay đổi chưa xuất bản hay không)
ALTER TABLE exam_versions ADD COLUMN source_version INTEGER NOT NULL DEFAULT 0;

UPDATE exam_versions
   SET allow_seek_audio   = (SELECT e.allow_seek_audio   FROM exams e WHERE e.id = exam_versions.exam_id),
       show_answers_after = (SELECT e.show_answers_after FROM exams e WHERE e.id = exam_versions.exam_id),
       source_version     = (SELECT e.version            FROM exams e WHERE e.id = exam_versions.exam_id);
