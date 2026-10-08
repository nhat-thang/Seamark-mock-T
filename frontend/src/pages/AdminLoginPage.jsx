import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import './SimplePage.css';
import './AdminLoginPage.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Thông báo khi bị chuyển về đây (ví dụ: phiên hết hạn)
  const notice = location.state?.message || '';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Đang trong phiên đăng nhập cũ (chưa bấm Đăng xuất) -> hỏi lại, KHÔNG tự chuyển vào trang quản trị,
  // để người dùng chung máy biết đang ở tài khoản của ai và đổi được tài khoản.
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    apiGet('/auth/me')
      .then((d) => setCurrent(d.admin))
      .catch(() => {});
  }, []);

  async function logoutCurrent() {
    try {
      await apiPost('/auth/logout');
    } catch {
      // bỏ qua
    }
    setCurrent(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiPost('/auth/login', { username: username.trim(), password });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="simple-page">
      <div className="card simple-card login-card">
        <img src="/images/logo-seamark.png" alt="Seamark" className="login-logo" />
        <h1 className="login-title">Đăng nhập admin</h1>

        {notice && !error && <p className="login-notice">{notice}</p>}

        {current ? (
          <div className="login-current">
            <p>
              Máy này đang đăng nhập với tài khoản <strong>{current.displayName}</strong> ({current.username}).
            </p>
            <button type="button" className="btn btn-primary login-submit" onClick={() => navigate('/admin')}>
              Vào trang quản trị
            </button>
            <button type="button" className="btn btn-secondary login-submit" onClick={logoutCurrent}>
              Đăng xuất để dùng tài khoản khác
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="username">Tên đăng nhập</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <label className="checkbox-label">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              Hiện mật khẩu
            </label>
          </div>

          {error && <p className="alert-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        )}

        <p className="login-help muted">Quên mật khẩu? Hãy nhờ admin chính đặt lại mật khẩu cho bạn.</p>
        <Link to="/" className="btn btn-link">Về trang chủ</Link>
      </div>
    </main>
  );
}
