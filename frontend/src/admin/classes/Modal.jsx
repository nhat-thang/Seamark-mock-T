import { useEffect, useRef } from 'react';
import LineIcon from '../../components/brand/LineIcon.jsx';

/**
 * Hộp thoại nổi giữa màn hình. Đóng khi bấm nút ×, phím Esc hoặc bấm ra ngoài.
 * footer: các nút ở cuối hộp thoại.
 */
export default function Modal({ title, onClose, children, footer, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Đưa con trỏ vào ô nhập đầu tiên cho tiện gõ
    ref.current?.querySelector('input:not([type=hidden]):not([disabled]), select, textarea')?.focus();
    // Không cuộn trang phía sau khi đang mở hộp thoại
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="cl-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`cl-modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="cl-modal-head">
          <h2>{title}</h2>
          <button type="button" className="cl-icon-btn" onClick={onClose} aria-label="Đóng">
            <LineIcon name="close" size={22} />
          </button>
        </div>
        <div className="cl-modal-body">{children}</div>
        {footer && <div className="cl-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
