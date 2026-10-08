// Định dạng ngày giờ theo giờ Việt Nam, ví dụ "08/10/2026 14:05"
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Tự ghép từng phần để luôn ra "ngày/tháng/năm giờ:phút" (trình duyệt hay đặt giờ lên trước)
  const parts = {};
  for (const p of DATE_TIME_FORMAT.formatToParts(d)) parts[p.type] = p.value;
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const ROLE_LABELS = {
  owner: 'Admin chính',
  admin: 'Admin',
};

// Tên thao tác trong "Lịch sử chỉnh sửa". Mốc sau thêm các thao tác về đề thi, tài liệu.
export const AUDIT_ACTION_LABELS = {
  create_admin: 'Tạo tài khoản',
  disable_admin: 'Vô hiệu hóa tài khoản',
  enable_admin: 'Mở lại tài khoản',
  reset_password: 'Đặt lại mật khẩu',
  change_password: 'Đổi mật khẩu',
  create_exam: 'Tạo đề',
  update_exam: 'Sửa đề',
  publish_exam: 'Xuất bản đề',
  unpublish_exam: 'Ngừng mở đề',
  takeover_lock: 'Giành quyền sửa đề',
  import_excel: 'Import Excel',
  update_answers: 'Nhập đáp án',
  update_content: 'Sửa câu hỏi',
  update_files: 'Gán file',
  upload_files: 'Tải file lên',
  delete_file: 'Xóa file',
  export_results: 'Xuất Excel kết quả',
  delete_exam: 'Xóa đề',
  save_template: 'Lưu khung mẫu',
  delete_template: 'Xóa khung mẫu',
};

// Kết quả trong "Lịch sử đăng nhập"
export const LOGIN_REASON_LABELS = {
  ok: 'Thành công',
  wrong_password: 'Sai mật khẩu',
  unknown_user: 'Tên đăng nhập không tồn tại',
  disabled: 'Tài khoản đã bị vô hiệu hóa',
  rate_limited: 'Bị chặn tạm do nhập sai nhiều lần',
};

/** Rút gọn thông tin trình duyệt cho dễ đọc: "Chrome trên Windows" */
export function describeUserAgent(ua) {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Trình duyệt khác';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iPhone/iPad'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} trên ${os}` : browser;
}
