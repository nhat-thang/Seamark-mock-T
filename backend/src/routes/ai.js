// API AI kiểm tra đề dán vào (mọi admin). requireAdmin được gắn ở app.js.
//   GET  /api/admin/ai/status  AI đã được cài chưa (có AI_API_KEY), đã gọi bao nhiêu lần hôm nay
//   POST /api/admin/ai/check   gửi một đợt question (tối đa 30) để AI kiểm tra, trả về gợi ý cho từng question
// Trình duyệt tự chia đề thành nhiều đợt và gọi lần lượt (mỗi lần dưới giới hạn 100 giây của Cloudflare).
// API này không ghi gì vào đề: giáo viên xem gợi ý rồi mới bấm "Áp dụng" (lưu qua đường lưu bản nháp như mọi khi).
const express = require('express');
const { requireJson } = require('../auth/middleware');
const { callGemini, AiError } = require('../ai/gemini');
const { reviewQuestions, ReviewInputError, MAX_ITEMS } = require('../ai/reviewQuestions');

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (không phụ thuộc múi giờ của VPS) */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

function aiRouter(db, config) {
  const router = express.Router();
  router.use(requireJson);
  const ai = config.ai || {};
  const configured = () => !!ai.apiKey;
  const dailyLimit = ai.dailyLimit || 300;
  // Test có thể thay hàm gọi AI bằng hàm giả (config.ai.caller)
  const callAi = ai.caller || ((o) => callGemini({ apiKey: ai.apiKey, model: ai.model, ...o }));

  const usage = () => db.prepare('SELECT calls, failures FROM ai_usage WHERE day = ?').get(today()) || { calls: 0, failures: 0 };
  const count = (col) =>
    db.prepare(`INSERT INTO ai_usage (day, ${col}) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + 1`).run(today());

  router.get('/status', (req, res) => {
    const u = usage();
    res.json({ configured: configured(), model: configured() ? ai.model : null, callsToday: u.calls, failuresToday: u.failures, dailyLimit, maxItems: MAX_ITEMS });
  });

  router.post('/check', async (req, res, next) => {
    try {
      if (!configured()) {
        return res.status(503).json({ error: 'Chưa cài AI cho web (thiếu AI_API_KEY trong file .env). Vẫn dùng được phần tự tách đề.', reason: 'not_configured' });
      }
      const u = usage();
      if (u.calls + u.failures >= dailyLimit) {
        return res.status(429).json({ error: `Hôm nay đã dùng hết ${dailyLimit} lượt kiểm tra bằng AI. Vui lòng thử lại vào ngày mai.`, reason: 'daily_limit' });
      }
      try {
        const out = await reviewQuestions(req.body, callAi);
        count('calls');
        res.json(out);
      } catch (err) {
        if (err instanceof ReviewInputError) return res.status(400).json({ error: err.message });
        if (err instanceof AiError) {
          count('failures');
          const status = err.code === 'quota' ? 429 : 503;
          return res.status(status).json({ error: err.message, reason: err.code });
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = aiRouter;
