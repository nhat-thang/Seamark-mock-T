// Hàm gọi API dùng chung. Luôn trả lỗi bằng tiếng Việt dễ hiểu.
// Lỗi ném ra có thêm err.status (mã HTTP) để trang xử lý riêng nếu cần.

// Khi đang ở trang admin mà phiên hết hạn (401), báo cho AdminLayout để chuyển về trang đăng nhập
export const UNAUTHORIZED_EVENT = 'admin-unauthorized';

async function request(method, path, body, headers = {}) {
  const options = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body instanceof FormData) {
    options.body = body; // gửi file: trình duyệt tự đặt Content-Type multipart
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    const err = new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi thử lại.');
    err.status = 0;
    throw err;
  }

  let data = null;
  const isJson = String(res.headers.get('content-type') || '').includes('application/json');
  try {
    data = isJson ? await res.json() : null;
  } catch {
    // Máy chủ trả về JSON hỏng
  }

  // Nhận về thứ không phải dữ liệu của web (ví dụ trang lỗi của Cloudflare, hoặc một chương trình khác
  // đang chiếm cổng của backend khi chạy thử trên máy) -> coi như không kết nối được máy chủ
  if (!isJson) {
    const err = new Error('Không kết nối được máy chủ của web. Vui lòng thử lại sau ít phút.');
    err.status = res.ok ? 502 : res.status;
    throw err;
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || 'Máy chủ gặp lỗi. Vui lòng thử lại sau.');
    err.status = res.status;
    err.data = data; // toàn bộ phản hồi (ví dụ { reason: 'lock' | 'version' })
    // Không phát sự kiện cho chính các API đăng nhập (sai mật khẩu cũng trả 401)
    if (res.status === 401 && path.startsWith('/admin')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw err;
  }
  return data;
}

export const apiGet = (path, headers) => request('GET', path, undefined, headers);
// Luôn gửi JSON (kể cả rỗng): server yêu cầu JSON cho mọi request thay đổi dữ liệu
export const apiPost = (path, body = {}, headers) => request('POST', path, body, headers);

/** Tải file lên: files là danh sách File, field là tên trường server chờ ("file" hoặc "files") */
export function apiUpload(path, field, files) {
  const form = new FormData();
  for (const f of files) form.append(field, f, f.name);
  return request('POST', path, form);
}
