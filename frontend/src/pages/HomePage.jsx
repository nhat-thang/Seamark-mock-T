import { Link } from 'react-router-dom';
import SiteHeader, { ArrowIcon } from '../components/brand/SiteHeader.jsx';
import { Bubbles, DotGrid, Dolphin, Emblem, Lifebuoy, Sparkle, Stripes, Waves } from '../components/brand/SeaArt.jsx';
import LineIcon from '../components/brand/LineIcon.jsx';
import { SITE, telHref } from '../config/site.js';
import './HomePage.css';

const POINTS = [
  { icon: 'headphones', text: 'Đề thi thử TOEIC Listening & Reading và bài kiểm tra của trung tâm' },
  { icon: 'bolt', text: 'Chấm điểm ngay khi nộp bài' },
  { icon: 'phone', text: 'Làm bài trên máy tính hoặc điện thoại' },
];

const STEPS = [
  { icon: 'user', title: 'Nhập thông tin', text: 'Họ, tên và số điện thoại — không cần tạo tài khoản.' },
  { icon: 'list', title: 'Chọn đề thi', text: 'Chọn một đề trong danh sách trung tâm đã mở.' },
  { icon: 'trophy', title: 'Làm bài & xem điểm', text: 'Bài tự lưu khi làm, hết giờ tự nộp, có điểm ngay.' },
];

// Trang chủ: 2 chức năng "Bắt đầu làm bài" (nút vàng lớn) và "Đăng nhập admin" (góc trên bên phải)
export default function HomePage() {
  return (
    <div className="home">
      <section className="home-hero">
        {/* Trang trí nền */}
        <div className="home-hero-glow" aria-hidden="true" />
        <Bubbles />
        <DotGrid className="home-dots home-dots-1" rows={5} cols={6} />
        <DotGrid className="home-dots home-dots-2" rows={3} cols={8} />
        <Stripes className="home-stripes" />
        <Sparkle className="home-spark home-spark-1" size={34} />
        <Sparkle className="home-spark home-spark-2" size={18} filled />
        <Sparkle className="home-spark home-spark-3" size={26} />

        <SiteHeader>
          <Link to="/admin/dang-nhap" className="btn btn-ghost-light">
            <LineIcon name="lock" size={18} />
            Đăng nhập admin
          </Link>
        </SiteHeader>

        <div className="home-hero-inner">
          <div className="home-copy">
            <p className="home-badge">
              <Sparkle size={16} filled /> Thi thử trực tuyến
            </p>
            <h1 className="home-title">
              Seamark
              <span>English School</span>
            </h1>
            <p className="home-motto">{SITE.motto}</p>

            <ul className="home-points">
              {POINTS.map((p) => (
                <li key={p.icon}>
                  <span className="home-point-icon">
                    <LineIcon name={p.icon} size={20} />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>

            <div className="home-cta">
              <Link to="/bat-dau" className="btn btn-large btn-sun home-start">
                Bắt đầu làm bài
                <ArrowIcon />
              </Link>
              <p className="home-cta-note">Chỉ cần họ tên và số điện thoại.</p>
            </div>
          </div>

          <div className="home-art" aria-hidden="true">
            <div className="home-art-ring" />
            <div className="home-art-pill" />
            <div className="home-art-disc" />
            <Emblem className="home-art-emblem sea-float" alt="" />
            <Dolphin className="home-art-dolphin home-art-dolphin-1 sea-float" />
            <Dolphin className="home-art-dolphin home-art-dolphin-2 sea-float" />
            <Lifebuoy className="home-art-buoy sea-float" />
            <Sparkle className="home-art-spark home-art-spark-1" size={30} filled />
            <Sparkle className="home-art-spark home-art-spark-2" size={22} />
          </div>
        </div>

        <Waves colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.38)', '#f3f8fe']} />
      </section>

      <section className="home-steps" aria-labelledby="home-steps-title">
        <h2 id="home-steps-title" className="home-section-title">
          Làm bài chỉ với <span>3 bước</span>
        </h2>
        <ol className="home-step-list">
          {STEPS.map((s, i) => (
            <li key={s.title} className="home-step">
              <span className="home-step-no">{i + 1}</span>
              <span className="home-step-icon">
                <LineIcon name={s.icon} size={30} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <Dolphin className="home-steps-dolphin sea-float" />
      </section>

      <footer className="home-footer">
        <Waves className="home-footer-waves" colors={['rgba(22,35,95,0.25)', 'rgba(22,35,95,0.55)', 'var(--brand-navy)']} />
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <img src="/images/logo-seamark.png" alt="" className="home-footer-logo" />
            <div>
              <strong>{SITE.name}</strong>
              <p>{SITE.motto}</p>
            </div>
          </div>
          <ul className="home-contact">
            <li>
              <LineIcon name="call" size={20} />
              Hotline: <a href={telHref(SITE.hotline)}>{SITE.hotline}</a>
            </li>
            <li>
              <LineIcon name="pin" size={20} />
              {SITE.address}
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
