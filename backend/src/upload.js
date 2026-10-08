// Nhận file upload (multer).
// Bảo mật:
// - Chỉ nhận đúng các loại file cho phép, kiểm tra CẢ đuôi file, MIME và vài byte đầu của file (chữ ký file).
// - Lưu bằng tên ngẫu nhiên trong DATA_DIR/uploads; KHÔNG BAO GIỜ dùng tên người dùng gửi để tạo đường dẫn.
// - Giới hạn dung lượng theo MAX_UPLOAD_MB.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// đuôi -> các MIME trình duyệt hay gửi
const MEDIA_TYPES = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
};
const XLSX_TYPES = {
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
};

// MIME chuẩn để trả về khi phục vụ file
const SERVE_MIME = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

const extOf = (name) => path.extname(String(name || '')).slice(1).toLowerCase();

/** Kiểm tra chữ ký file (vài byte đầu) có đúng loại không */
function signatureMatches(ext, buf) {
  const ascii = (start, end) => buf.subarray(start, end).toString('latin1');
  switch (ext) {
    case 'png': return buf[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'jpg':
    case 'jpeg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'wav': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'mp3': return ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'm4a': return ascii(4, 8) === 'ftyp';
    case 'xlsx': return buf[0] === 0x50 && buf[1] === 0x4b; // file zip "PK"
    default: return false;
  }
}

function readHead(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

// Tên file gốc từ trình duyệt có thể bị mã hóa latin1 -> đổi về UTF-8 (tên tiếng Việt)
function originalName(file) {
  const fixed = Buffer.from(file.originalname, 'latin1').toString('utf8');
  return path.basename(fixed.includes('�') ? file.originalname : fixed).slice(0, 200);
}

function typeFilter(types) {
  return (req, file, cb) => {
    const ext = extOf(originalName(file));
    const ok = types[ext] && types[ext].includes(String(file.mimetype).toLowerCase());
    if (!ok) {
      const err = new Error(`File "${originalName(file)}" không đúng loại cho phép (${Object.keys(types).join(', ')}).`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  };
}

/** Upload ảnh/audio: lưu thẳng xuống đĩa bằng tên ngẫu nhiên */
function mediaUpload(config) {
  const dir = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => {
        cb(null, `${crypto.randomBytes(16).toString('hex')}.${extOf(originalName(file))}`);
      },
    }),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 50 },
    fileFilter: typeFilter(MEDIA_TYPES),
  });
}

/** Upload file Excel: giữ trong bộ nhớ (chỉ đọc, không lưu) */
function excelUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.min(config.maxUploadMb, 20) * 1024 * 1024, files: 1 },
    fileFilter: typeFilter(XLSX_TYPES),
  });
}

/** Đổi lỗi multer sang thông báo tiếng Việt */
function uploadErrorMessage(err, config) {
  if (err.code === 'LIMIT_FILE_SIZE') return `File quá lớn. Mỗi file tối đa ${config.maxUploadMb} MB.`;
  if (err.code === 'LIMIT_FILE_COUNT') return 'Chọn quá nhiều file một lần (tối đa 50 file).';
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return 'Dữ liệu tải lên không hợp lệ.';
  return err.message || 'Tải file lên không thành công.';
}

/**
 * Chống giả mạo request cho upload (form multipart không qua được kiểm tra JSON):
 * nếu trình duyệt gửi kèm Origin thì Origin phải cùng tên miền với trang.
 */
function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).hostname;
    } catch {
      // Origin không hợp lệ
    }
    // req.hostname: tên miền trang đang chạy (sau Cloudflare thì lấy từ X-Forwarded-Host nhờ "trust proxy")
    const hostHeader = String(req.get('host') || '').replace(/:\d+$/, '');
    if (originHost !== req.hostname && originHost !== hostHeader) {
      return res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
    }
  }
  next();
}

module.exports = {
  mediaUpload, excelUpload, uploadErrorMessage, requireSameOrigin,
  signatureMatches, readHead, originalName, extOf, SERVE_MIME, MEDIA_TYPES,
};
