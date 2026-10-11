// Gọi Google Gemini qua REST API (dùng fetch có sẵn của Node, không cần thư viện).
// API key chỉ nằm ở backend (.env: AI_API_KEY), không bao giờ gửi xuống trình duyệt.
// Muốn đổi sang dịch vụ AI khác: viết một file tương tự với cùng hàm callGemini(...) -> JSON.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Lỗi khi gọi AI. code: 'key' | 'model' | 'quota' | 'unavailable' | 'bad_response' */
class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Đổi phản hồi lỗi của Google thành thông báo tiếng Việt dễ hiểu */
function toAiError(status, body, model) {
  const msg = String(body?.error?.message || '');
  if (status === 429) {
    return new AiError('quota', 'API key đã hết lượt dùng AI (trong phút này hoặc trong ngày). Vui lòng thử lại sau ít phút hoặc ngày mai.');
  }
  if (status === 404) {
    return new AiError('model', `Không tìm thấy mẫu AI "${model}". Kiểm tra AI_MODEL trong file .env (hoặc xóa dòng đó để dùng mặc định).`);
  }
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(msg))) {
    return new AiError('key', 'API key của AI không đúng hoặc chưa được bật. Kiểm tra AI_API_KEY trong file .env.');
  }
  if (status >= 500) return new AiError('unavailable', 'Dịch vụ AI đang bận. Vui lòng thử lại sau ít phút.');
  return new AiError('bad_response', 'AI từ chối yêu cầu. Thử chia nhỏ đề hoặc thử lại sau.');
}

/**
 * Gửi một câu lệnh, nhận về JSON đúng theo schema.
 * @param {object} o
 * @param {string} o.apiKey
 * @param {string} o.model
 * @param {string} o.prompt
 * @param {object} o.schema  schema JSON của kết quả (định dạng của Gemini: type OBJECT/ARRAY/STRING...)
 * @param {Function} [o.fetchImpl] dùng trong test
 */
async function callGemini({ apiKey, model, prompt, schema, fetchImpl = fetch, timeoutMs = 90000 }) {
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  });

  // Lỗi tạm thời (máy chủ AI bận / mất mạng) thì thử lại 1 lần
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        // Key gửi trong header (không để trong đường dẫn, tránh lộ trong nhật ký)
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw new AiError('unavailable', 'Không kết nối được dịch vụ AI. Kiểm tra mạng của máy chủ rồi thử lại.');
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      // phản hồi không phải JSON
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw toAiError(res.status, data, model);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError('bad_response', 'AI trả về kết quả không đọc được. Vui lòng thử lại.');
    }
  }
}

module.exports = { callGemini, AiError };
