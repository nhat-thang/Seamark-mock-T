import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { apiGet, apiPost, UNAUTHORIZED_EVENT } from '../utils/api.js';
import { ROLE_LABELS } from '../utils/format.js';
import './admin.css';

const LOGIN_PATH = '/admin/dang-nhap';

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
        <div className="admin-brand">
          <img src="/images/logo-seamark.png" alt="" className="admin-brand-logo" />
          <span>Quản trị Seamark</span>
        </div>
        <div className="admin-user">
          <span>
            Xin chào, <strong>{admin.displayName}</strong>
            <span className="admin-role">{ROLE_LABELS[admin.role]}</span>
          </span>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Menu quản trị">
        <NavLink to="/admin" end>Trang chính</NavLink>
        <NavLink to="/admin/de-thi">Đề thi</NavLink>
        <NavLink to="/admin/ket-qua">Kết quả</NavLink>
        <NavLink to="/admin/doi-mat-khau">Đổi mật khẩu</NavLink>
        <NavLink to="/admin/huong-dan">Hướng dẫn</NavLink>
        {/* Chỉ admin chính thấy các mục này (server cũng kiểm tra quyền) */}
        {isOwner && (
          <>
            <span className="admin-nav-divider" aria-hidden="true" />
            <NavLink to="/admin/tai-khoan">Tài khoản admin</NavLink>
            <NavLink to="/admin/lich-su-chinh-sua">Lịch sử chỉnh sửa</NavLink>
            <NavLink to="/admin/lich-su-dang-nhap">Lịch sử đăng nhập</NavLink>
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
