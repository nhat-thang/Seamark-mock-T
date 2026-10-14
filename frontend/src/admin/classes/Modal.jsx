import { useEffect, useRef } from 'react';
import LineIcon from '../../components/brand/LineIcon.jsx';

/**
 * Hộp thoại nổi giữa màn hình. Đóng khi bấm nút ×, phím Esc hoặc bấm ra ngoài.
 * footer: các nút ở cuối hộp thoại. className: thêm lớp CSS riêng cho từng trang.
 */
export default function Modal({ title, onClose, children, footer, wide = false, xl = false, className = '' }) {
  const ref = useRef(null);
  // Giữ hàm đóng mới nhất trong ref: trang phía sau vẽ lại (ví dụ đồng hồ mỗi 30 giây) không làm
  // hộp thoại chạy lại đoạn dưới -> con trỏ không bị nhảy về ô đầu tiên khi đang gõ
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
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
  }, []);

  return (
    <div className="cl-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className={`cl-modal ${wide ? 'is-wide' : ''} ${xl ? 'is-xl' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
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
