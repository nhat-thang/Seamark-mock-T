// Giới hạn số request theo IP (lưu trong bộ nhớ — đủ cho một tiến trình duy nhất).
// Ví dụ: tối đa 120 lần bắt đầu làm bài / 10 phút / IP.
// Lưu ý: cả lớp dùng chung Wi-Fi của trung tâm sẽ có chung một IP, nên đặt giới hạn rộng rãi.

function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> [thời điểm các lần gọi]

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(key, recent);

    // Dọn bớt khi quá nhiều IP để không tốn bộ nhớ
    if (hits.size > 5000) {
      for (const [ip, times] of hits) {
        if (!times.some((t) => now - t < windowMs)) hits.delete(ip);
      }
    }
    next();
  };
}

module.exports = { rateLimit };
