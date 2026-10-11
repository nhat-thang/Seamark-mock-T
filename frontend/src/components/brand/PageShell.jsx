import { Link } from 'react-router-dom';
import SiteHeader from './SiteHeader.jsx';
import { Bubbles, DotGrid, Dolphin, Sparkle, Waves } from './SeaArt.jsx';
import './PageShell.css';

const STEPS = ['Thông tin học viên', 'Chọn đề', 'Làm bài'];

/**
 * Khung trang học viên: dải xanh biển (logo, tiêu đề, sóng) phía trên, thẻ nội dung trắng bên dưới.
 * step: 1 | 2 | 3 -> hiện thanh các bước; bỏ trống thì không hiện.
 * action: nút bên phải thanh đầu trang (mặc định "Trang chủ"). narrow / wide: thẻ nội dung hẹp / rộng.
 */
export default function PageShell({ title, subtitle, step, action, narrow = false, wide = false, children }) {
  return (
    <div className="shell">
      <div className="shell-top">
        <Bubbles />
        <DotGrid className="shell-dots" rows={4} cols={6} />
        <Sparkle className="shell-spark shell-spark-1" size={26} />
        <Sparkle className="shell-spark shell-spark-2" size={16} filled />
        <Dolphin className="shell-dolphin sea-float" />

        <SiteHeader>
          {action ?? (
            <Link to="/" className="btn btn-ghost-light">
              Trang chủ
            </Link>
          )}
        </SiteHeader>

        <div className="shell-heading">
          {title && <h1 className="shell-title">{title}</h1>}
          {subtitle && <p className="shell-subtitle">{subtitle}</p>}
          {step && (
            <ol className="shell-steps" aria-label="Các bước">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  className={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}
                  aria-current={i + 1 === step ? 'step' : undefined}
                >
                  <span className="shell-step-no">{i + 1 < step ? '✓' : i + 1}</span>
                  <span className="shell-step-label">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <Waves colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.4)', '#f3f8fe']} />
      </div>

      <main className={`shell-main ${narrow ? 'is-narrow' : ''} ${wide ? 'is-wide' : ''}`}>{children}</main>
    </div>
  );
}
