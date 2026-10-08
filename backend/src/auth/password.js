// Mã hóa và kiểm tra mật khẩu bằng bcrypt.
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;
const MIN_LENGTH = 8;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function hashPasswordSync(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Hash giả dùng khi tên đăng nhập không tồn tại: vẫn chạy bcrypt.compare
// để thời gian trả lời giống nhau, người ngoài không dò được tên đăng nhập nào có thật.
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync('khong-phai-mat-khau-that', BCRYPT_ROUNDS);
  return dummyHash;
}

/** Kiểm tra mật khẩu mới. Trả về câu báo lỗi, hoặc null nếu hợp lệ. */
function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự.`;
  }
  // bcrypt chỉ dùng 72 byte đầu tiên, dài hơn sẽ bị cắt mất
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Mật khẩu quá dài (tối đa khoảng 70 ký tự).';
  }
  return null;
}

module.exports = { hashPassword, hashPasswordSync, verifyPassword, getDummyHash, validateNewPassword, MIN_LENGTH };
