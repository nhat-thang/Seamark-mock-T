// Đọc cấu hình từ file .env ở thư mục gốc dự án.
// Mọi giá trị (cổng, host, thư mục dữ liệu...) đều lấy từ đây, không hard-code ở chỗ khác.
const path = require('path');
const dotenv = require('dotenv');

// Thư mục gốc dự án (toeic-test/), tính từ backend/src/
const ROOT_DIR = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// DATA_DIR có thể là đường dẫn tương đối (./data) hoặc tuyệt đối (C:\toeic\data).
// path.resolve sẽ giữ nguyên đường dẫn tuyệt đối, còn đường dẫn tương đối thì tính từ thư mục gốc dự án.
const dataDir = path.resolve(ROOT_DIR, process.env.DATA_DIR || 'data');

const config = {
  rootDir: ROOT_DIR,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  dataDir,
  dbFile: path.join(dataDir, 'toeic.sqlite'),
  sessionSecret: process.env.SESSION_SECRET || '',
  ownerUsername: process.env.OWNER_USERNAME || '',
  ownerPassword: process.env.OWNER_PASSWORD || '',
  ownerDisplayName: process.env.OWNER_DISPLAY_NAME || 'Thom Tran',
  // Mặc định 95 MB: Cloudflare (gói Free) chặn mọi request trên 100 MB
  maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, 95),
  frontendDist: path.join(ROOT_DIR, 'frontend', 'dist'),
};

// SESSION_SECRET dùng để băm mã phiên đăng nhập: bắt buộc phải có, và phải đủ dài
if (!config.sessionSecret || config.sessionSecret.length < 16) {
  if (config.isProduction) {
    throw new Error('SESSION_SECRET trong .env phải có ít nhất 16 ký tự.');
  }
  console.warn('[cảnh báo] SESSION_SECRET trong .env chưa đặt hoặc quá ngắn. Đang dùng giá trị tạm cho máy dev.');
  config.sessionSecret = 'chuoi-tam-chi-dung-tren-may-dev';
}
if (config.isProduction && config.sessionSecret === 'thay-bang-chuoi-ngau-nhien-dai') {
  throw new Error('Hãy đổi SESSION_SECRET trong .env thành một chuỗi ngẫu nhiên riêng trước khi chạy production.');
}

module.exports = config;
