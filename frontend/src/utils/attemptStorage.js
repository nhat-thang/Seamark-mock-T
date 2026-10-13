// Lưu trên trình duyệt (localStorage) cho lượt làm bài:
// - mã bí mật của lượt làm bài (để tải lại trang vẫn vào đúng bài)
// - bản sao câu trả lời, dự phòng khi mất mạng
const tokenKey = (id) => `seamark_attempt_${id}_token`;
const answersKey = (id) => `seamark_attempt_${id}_answers`;
// Training Test chỉ nhập tên nên server không tự mở lại bài dở: trình duyệt nhớ bài đang làm của từng đề
const ongoingKey = (examId) => `seamark_ongoing_${examId}`;

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

/** { attemptId, name } — bài Training Test đang làm dở của đề examId trên máy này */
export const saveOngoing = (examId, value) => write(ongoingKey(examId), value);
export const getOngoing = (examId) => read(ongoingKey(examId));
export function clearOngoing(examId) {
  try {
    localStorage.removeItem(ongoingKey(examId));
  } catch {
    // bỏ qua
  }
}

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
