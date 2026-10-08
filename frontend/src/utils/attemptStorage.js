// Lưu trên trình duyệt (localStorage) cho lượt làm bài:
// - mã bí mật của lượt làm bài (để tải lại trang vẫn vào đúng bài)
// - bản sao câu trả lời, dự phòng khi mất mạng
const tokenKey = (id) => `seamark_attempt_${id}_token`;
const answersKey = (id) => `seamark_attempt_${id}_answers`;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Trình duyệt chặn bộ nhớ: bỏ qua, bài vẫn được lưu lên server
  }
}

export const saveAttemptToken = (id, token) => write(tokenKey(id), token);
export const getAttemptToken = (id) => read(tokenKey(id));

/** { answers, flagged, dirty } — dirty = true nghĩa là còn thay đổi chưa lên server */
export const loadLocalAnswers = (id) => read(answersKey(id));
export const saveLocalAnswers = (id, data) => write(answersKey(id), data);
export function clearLocalAnswers(id) {
  try {
    localStorage.removeItem(answersKey(id));
  } catch {
    // bỏ qua
  }
}
