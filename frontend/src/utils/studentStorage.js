// Tạm giữ thông tin học viên trong sessionStorage (mất khi đóng tab).
// Mốc 5 sẽ gửi thông tin này lên server lúc bấm "Làm bài".
const KEY = 'seamark_student';

export function loadStudent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // trình duyệt chặn bộ nhớ hoặc dữ liệu hỏng: coi như chưa có
  }
}

export function saveStudent(student) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(student));
  } catch {
    // Không lưu được cũng không sao, trang vẫn hoạt động
  }
}
