-- CHĂM SÓC KHÁCH HÀNG (CSKH) — bảng tính khách hàng tiềm năng, CHỈ admin chính dùng (routes/crm.js).
-- Chỉ THÊM bảng mới, không đụng dữ liệu cũ.

-- Mỗi dòng = một khách hàng (học sinh + phụ huynh) trong bảng CSKH.
CREATE TABLE crm_contacts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name     TEXT NOT NULL DEFAULT '',
  parent_name      TEXT NOT NULL DEFAULT '',
  -- SĐT đã chuẩn hóa ("0901234567", nhiều số cách nhau " / "). Viết sai mẫu vẫn giữ nguyên chữ để không mất dữ liệu
  -- (giao diện hiện dấu cảnh báo đỏ ở góc ô, giống Excel).
  phone            TEXT NOT NULL DEFAULT '',
  id_number        TEXT NOT NULL DEFAULT '',   -- CCCD phụ huynh (12 số; CMND cũ 9 số)
  contact_date     TEXT,                       -- ngày CSKH (YYYY-MM-DD giờ VN); NULL = chưa ghi
  staff            TEXT NOT NULL DEFAULT '',   -- nhân viên CSKH
  -- Trạng thái: 'Đã chốt' | 'Đang chờ chốt' | 'Fail' (cố định) | tên một trạng thái tự thêm (crm_statuses) | '' = chưa chọn.
  -- Lưu bằng chữ cho giống ô Excel; đổi tên trạng thái tự thêm thì đổi luôn các dòng đang dùng.
  status           TEXT NOT NULL DEFAULT '',
  tuition          INTEGER,                    -- học phí (đồng); NULL = chưa ghi
  follow_up        TEXT,                       -- hẹn gọi lại (YYYY-MM-DD); NULL = không hẹn
  note             TEXT NOT NULL DEFAULT '',
  -- Đã thêm vào lớp (nút "Thêm vào lớp"). Học sinh bị xóa hẳn khỏi lớp thì tự về NULL.
  class_student_id INTEGER REFERENCES class_students(id) ON DELETE SET NULL,
  created_by       INTEGER REFERENCES admins(id),
  created_at       TEXT NOT NULL,
  updated_by       INTEGER REFERENCES admins(id),
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT                        -- xóa mềm: "Hoàn tác" / khôi phục được
);
CREATE INDEX idx_crm_contacts_deleted ON crm_contacts(deleted_at);

-- Trạng thái tự thêm (ngoài 3 trạng thái cố định). color = tên màu ('blue', 'purple'...) của nhãn.
CREATE TABLE crm_statuses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL,
  created_by INTEGER REFERENCES admins(id),
  created_at TEXT NOT NULL
);

-- Lịch sử thay đổi từng khách hàng (từng ô: cũ -> mới), để xem lại "ai đổi trạng thái lúc nào".
-- field: tên cột (status, phone...) hoặc việc cả dòng: 'create' | 'delete' | 'restore' | 'enroll'.
CREATE TABLE crm_changes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  admin_id   INTEGER REFERENCES admins(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_crm_changes_contact ON crm_changes(contact_id, created_at);
