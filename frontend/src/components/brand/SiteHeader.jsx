import { Link } from 'react-router-dom';
import './brand.css';

/** Thanh đầu trang của học viên: logo + tên trung tâm (về trang chủ), bên phải là nút tùy trang */
export default function SiteHeader({ children }) {
  return (
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="Seamark English School — về trang chủ">
        <img src="/images/logo-seamark.png" alt="" className="site-brand-logo" />
        <span className="site-brand-text">
          <span className="site-brand-name">Seamark</span>
          <span className="site-brand-sub">English School</span>
        </span>
      </Link>
      {children}
    </header>
  );
}

/** Mũi tên → trong nút */
export function ArrowIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
