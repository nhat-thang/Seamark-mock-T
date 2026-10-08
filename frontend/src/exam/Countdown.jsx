import { useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Đồng hồ đếm ngược. Chỉ để HIỂN THỊ — giờ hết hạn thật do server quyết định.
 * clockOffset: chênh lệch giờ server - giờ máy, để đếm theo giờ server.
 */
export default function Countdown({ deadlineAt, clockOffset, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Date.parse(deadlineAt) - (now + clockOffset));

  // Hết giờ: gọi onExpire đúng một lần
  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current();
    }
  }, [remaining]);

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const warning = remaining < 5 * 60 * 1000;

  return (
    <div className={`exam-countdown ${warning ? 'is-warning' : ''}`} role="timer" aria-live="off">
      <span className="exam-countdown-label">Còn lại</span>
      <span className="exam-countdown-time">
        {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
      </span>
    </div>
  );
}
