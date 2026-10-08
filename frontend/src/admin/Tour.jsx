import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import './tour.css';

/**
 * Hướng dẫn từng bước: làm tối màn hình, khoanh sáng một phần tử và hiện khung chú thích có mũi tên chỉ vào.
 *
 * steps: [{ target: 'tên data-tour', title, text }]
 *   Phần tử được chỉ vào là phần tử có thuộc tính data-tour="tên". Không tìm thấy thì tự bỏ qua bước đó.
 * onClose(): gọi khi bấm "Xong" hoặc "Bỏ qua hướng dẫn" (hoặc phím Esc).
 */
export default function Tour({ steps, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[index];

  // Tìm phần tử của bước hiện tại, cuộn tới và đo vị trí
  const measure = useCallback(() => {
    const el = step && document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return false;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [step]);

  useLayoutEffect(() => {
    const el = step && document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      // Không có phần tử này trên màn hình -> sang bước kế
      if (index < steps.length - 1) setIndex((i) => i + 1);
      else onClose();
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    measure();
  }, [index, step, steps.length, measure, onClose]);

  // Cập nhật vị trí khi cuộn / đổi kích thước cửa sổ
  useEffect(() => {
    const update = () => measure();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [measure]);

  // Phím Esc = bỏ qua
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!step || !rect) return null;

  // Đặt khung chú thích bên dưới phần tử; không đủ chỗ thì đặt bên trên
  const PAD = 8;
  const BOX_W = Math.min(380, window.innerWidth - 32);
  const below = rect.top + rect.height + 220 < window.innerHeight;
  const boxTop = below ? rect.top + rect.height + PAD + 14 : Math.max(16, rect.top - PAD - 14 - 200);
  const center = rect.left + rect.width / 2;
  const boxLeft = Math.min(Math.max(16, center - BOX_W / 2), window.innerWidth - BOX_W - 16);
  const arrowLeft = Math.min(Math.max(20, center - boxLeft), BOX_W - 20); // mũi tên luôn chỉ vào giữa phần tử

  const isLast = index === steps.length - 1;

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Lớp chặn bấm ra ngoài trong lúc xem hướng dẫn */}
      <div className="tour-blocker" />
      {/* Vùng sáng quanh phần tử được chỉ vào (phần còn lại của màn hình bị làm tối) */}
      <div
        className="tour-spotlight"
        style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
      />
      <div
        className={`tour-box ${below ? 'is-below' : 'is-above'}`}
        style={{ top: below ? boxTop : undefined, bottom: below ? undefined : window.innerHeight - rect.top + PAD + 14, left: boxLeft, width: BOX_W }}
      >
        <span className="tour-arrow" style={{ left: arrowLeft }} aria-hidden="true" />
        <p className="tour-step">
          Bước {index + 1} / {steps.length}
        </p>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <p className="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-link tour-skip" onClick={onClose}>
            Bỏ qua hướng dẫn
          </button>
          <span className="tour-nav">
            {index > 0 && (
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setIndex((i) => i - 1)}>
                Quay lại
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => (isLast ? onClose() : setIndex((i) => i + 1))}
              autoFocus
            >
              {isLast ? 'Xong' : 'Tiếp'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
