import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { apiGet, apiPost, UNAUTHORIZED_EVENT } from '../utils/api.js';
import { ROLE_LABELS } from '../utils/format.js';
import LineIcon from '../components/brand/LineIcon.jsx';
import { Sparkle } from '../components/brand/SeaArt.jsx';
import '../components/brand/brand.css';
import './admin.css';
// Sau admin.css: CSS của phần lớp học được phép ghi đè kiểu chung của trang admin
import NotificationBell from './classes/NotificationBell.jsx';

const LOGIN_PATH = '/admin/dang-nhap';

// Menu: đổi tên mục ở đây thì sửa cả trang Hướng dẫn (GuidePage.jsx)
const NAV = [
  { to: '/admin', end: true, icon: 'home', label: 'Trang chính' },
  { to: '/admin/thoi-khoa-bieu', icon: 'calendar', label: 'Thời khóa biểu' },
  { to: '/admin/lop-hoc', icon: 'board', label: 'Lớp học' },
  { to: '/admin/de-thi', icon: 'exam', label: 'Đề thi' },
  { to: '/admin/ket-qua', icon: 'chart', label: 'Kết quả' },
  { to: '/admin/doi-mat-khau', icon: 'key', label: 'Đổi mật khẩu' },
  { to: '/admin/huong-dan', icon: 'help', label: 'Hướng dẫn' },
];
const OWNER_NAV = [
  { to: '/admin/hoc-phi', icon: 'money', label: 'Quản lý học phí' },
  { to: '/admin/tai-khoan', icon: 'users', label: 'Tài khoản admin' },
  { to: '/admin/lich-su-chinh-sua', icon: 'history', label: 'Lịch sử chỉnh sửa' },
  { to: '/admin/lich-su-dang-nhap', icon: 'login', label: 'Lịch sử đăng nhập' },
];

function NavItem({ to, end, icon, label }) {
  return (
    <NavLink to={to} end={end}>
      <LineIcon name={icon} size={18} />
      {label}
    </NavLink>
  );
}

/**
 * Khung chung cho mọi trang admin: kiểm tra đăng nhập, thanh trên cùng, menu.
 * Trang con lấy thông tin admin bằng hook useAdmin().
 */
export default function AdminLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState('');

  // Hỏi server: ai đang đăng nhập?
  useEffect(() => {
    apiGet('/auth/me')
      .then((data) => setAdmin(data.admin))
      .catch((err) => {
        if (err.status === 401) navigate(LOGIN_PATH, { replace: true });
        else setError(err.message);
      });
  }, [navigate]);

  // Đang dùng mà phiên hết hạn / bị vô hiệu hóa -> về trang đăng nhập
  useEffect(() => {
    function onUnauthorized() {
      navigate(LOGIN_PATH, {
        replace: true,
        state: { message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' },
      });
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  async function handleLogout() {
    try {
      await apiPost('/auth/logout');
    } catch {
      // Lỗi mạng cũng vẫn đưa về trang đăng nhập
    }
    navigate(LOGIN_PATH, { replace: true, state: { message: 'Bạn đã đăng xuất.' } });
  }

  if (error) {
    return (
      <main className="admin-main">
        <p className="alert-error">{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </main>
    );
  }

  if (!admin) {
    return <main className="admin-main"><p className="muted">Đang tải…</p></main>;
  }

  const isOwner = admin.role === 'owner';

  // Ghi nhớ (trên server) admin đã xem / bỏ qua một phần hướng dẫn từng bước
  async function markTourDone(name) {
    setAdmin((a) => ({ ...a, toursDone: [...new Set([...(a.toursDone || []), name])] }));
    try {
      await apiPost(`/auth/tours/${name}`);
    } catch {
      // Lỗi mạng: lần sau có thể hiện lại hướng dẫn, không sao
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <Sparkle className="admin-topbar-spark admin-topbar-spark-1" size={18} />
        <Sparkle className="admin-topbar-spark admin-topbar-spark-2" size={12} filled />
        <Link to="/admin" className="admin-brand">
          <img src="/images/logo-seamark.png" alt="" className="admin-brand-logo" />
          <span className="admin-brand-text">
            <span className="admin-brand-name">Seamark</span>
            <span className="admin-brand-sub">Trang quản trị</span>
          </span>
        </Link>
        <div className="admin-user">
          <NotificationBell />
          <span className="admin-user-hello">
            Xin chào, <strong>{admin.displayName}</strong>
            <span className="admin-role">{ROLE_LABELS[admin.role]}</span>
          </span>
          <button type="button" className="btn btn-ghost-light btn-small" onClick={handleLogout}>
            <LineIcon name="logout" size={18} />
            Đăng xuất
          </button>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Menu quản trị">
        {NAV.map((n) => <NavItem key={n.to} {...n} />)}
        {/* Chỉ admin chính thấy các mục này (server cũng kiểm tra quyền) */}
        {isOwner && (
          <>
            <span className="admin-nav-divider" aria-hidden="true" />
            {OWNER_NAV.map((n) => <NavItem key={n.to} {...n} />)}
          </>
        )}
      </nav>

      <main className="admin-main">
        <Outlet context={{ admin, markTourDone }} />
      </main>
    </div>
  );
}

/** Lấy admin đang đăng nhập (dùng trong các trang con). */
export function useAdmin() {
  return useOutletContext().admin;
}

/** Hàm đánh dấu đã xem một phần hướng dẫn từng bước */
export function useMarkTourDone() {
  return useOutletContext().markTourDone;
}

/** Bọc các trang chỉ dành cho admin chính. */
export function OwnerOnly({ children }) {
  const admin = useAdmin();
  if (admin.role !== 'owner') {
    return <p className="alert-error">Chỉ admin chính mới xem được trang này.</p>;
  }
  return children;
}
