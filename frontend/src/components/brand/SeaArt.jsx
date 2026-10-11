// Hình trang trí theo chủ đề biển cả của Seamark (cá heo, sóng, bong bóng, sao lấp lánh như logo).
// Vẽ bằng SVG ngay trong code: nét đẹp ở mọi cỡ màn hình, không tải thêm ảnh.
// Tất cả chỉ để trang trí: aria-hidden, không bấm được (pointer-events: none trong brand.css).
import './brand.css';

/** Biểu tượng cá heo + hải đăng của trung tâm (ảnh nền trong suốt) */
export function Emblem({ className = '', alt = 'Seamark English School' }) {
  return <img src="/images/seamark-emblem.png" alt={alt} className={`sea-emblem ${className}`} />;
}

// Một chu kỳ sóng rộng 1440, hai đầu khớp nhau để lặp liền mạch khi trôi ngang
const WAVE = 'M0 60 C 240 110, 480 10, 720 60 C 960 110, 1200 10, 1440 60 V 140 H 0 Z';

/** 3 lớp sóng trôi ngang ở mép dưới một khối. colors: [sau, giữa, trước] */
export function Waves({ className = '', colors = ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.45)', '#ffffff'] }) {
  return (
    <div className={`sea-waves ${className}`} aria-hidden="true">
      {colors.map((c, i) => (
        <svg key={i} className={`sea-wave sea-wave-${i + 1}`} viewBox="0 0 2880 140" preserveAspectRatio="none">
          <path d={WAVE} fill={c} />
          <path d={WAVE} fill={c} transform="translate(1440 0)" />
        </svg>
      ))}
    </div>
  );
}

/** Ngôi sao 4 cánh lấp lánh (giống các ngôi sao quanh logo) */
export function Sparkle({ className = '', size = 24, filled = false, style }) {
  return (
    <svg className={`sea-sparkle ${className}`} width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path
        d="M12 1 C12.6 7.4 16.6 11.4 23 12 C16.6 12.6 12.6 16.6 12 23 C11.4 16.6 7.4 12.6 1 12 C7.4 11.4 11.4 7.4 12 1 Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bong bóng nổi lên (vị trí cố định theo danh sách, không ngẫu nhiên để giao diện không nhảy) */
const BUBBLES = [
  [8, 14, 0], [18, 9, 3], [27, 18, 6], [41, 7, 1.5], [55, 12, 4.5], [63, 20, 8], [72, 8, 2.5], [84, 15, 5.5], [92, 10, 7],
];
export function Bubbles({ className = '' }) {
  return (
    <div className={`sea-bubbles ${className}`} aria-hidden="true">
      {BUBBLES.map(([left, size, delay], i) => (
        <span key={i} style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${9 + (i % 4) * 2}s` }} />
      ))}
    </div>
  );
}

/** Lưới chấm tròn nhỏ (như góc banner) */
export function DotGrid({ className = '', rows = 4, cols = 7 }) {
  return (
    <svg className={`sea-dots ${className}`} width={cols * 14} height={rows * 14} viewBox={`0 0 ${cols * 14} ${rows * 14}`} aria-hidden="true">
      {Array.from({ length: rows * cols }, (_, k) => (
        <circle key={k} cx={7 + (k % cols) * 14} cy={7 + Math.floor(k / cols) * 14} r="2" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Các vạch chéo song song (như góc banner) */
export function Stripes({ className = '', count = 6 }) {
  return (
    <svg className={`sea-stripes ${className}`} width={count * 14 + 40} height="70" viewBox={`0 0 ${count * 14 + 40} 70`} aria-hidden="true">
      {Array.from({ length: count }, (_, k) => (
        <line key={k} x1={k * 14} y1="70" x2={k * 14 + 40} y2="0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Cá heo đang nhảy (hình bóng), quay đầu sang trái */
export function Dolphin({ className = '', style }) {
  return (
    <svg className={`sea-dolphin ${className}`} viewBox="0 0 124 66" style={style} aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 38 C 9 34.5 16 32.5 23 31.5 C 26 23 36 18.5 48 18.5 C 52 18.5 56 18.8 59.5 19.6
           C 63 12 69 6.5 77 5 C 73.5 10 72.5 16 73.5 22.5 C 85 26.5 95 32.5 103 39.5
           C 107 34 112 30.5 120 29 C 116.5 35 116 41.5 120 48.5 C 112 47 106.5 45.5 102.5 44
           C 90 48.5 74 50.5 56 49.5 C 52.5 54.5 47 58.5 40.5 60 C 43 56 44.5 52 44.5 48.3
           C 36 46.8 29 44.6 23.5 42.6 C 16.5 41.6 9.5 40.6 4 38 Z"
      />
      <circle cx="30.5" cy="29" r="1.7" fill="var(--dolphin-eye, #fff)" />
    </svg>
  );
}

/** Phao cứu sinh nhỏ (điểm nhấn cam / trắng) */
export function Lifebuoy({ className = '', size = 46 }) {
  return (
    <svg className={`sea-lifebuoy ${className}`} width={size} height={size} viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r="17" fill="none" stroke="#fff" strokeWidth="9" />
      <circle cx="23" cy="23" r="17" fill="none" stroke="var(--brand-orange)" strokeWidth="9" strokeDasharray="13.35 13.35" strokeDashoffset="6.7" />
      <circle cx="23" cy="23" r="21.5" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
    </svg>
  );
}
