import { useState } from 'react';
import { apiPost } from '../utils/api.js';

const MIN_LENGTH = 8;

// Mọi admin tự đổi mật khẩu của mình
export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    // Kiểm tra trước trên trình duyệt cho nhanh (server vẫn kiểm tra lại)
    if (!form.current) return setError('Vui lòng nhập mật khẩu hiện tại.');
    if (form.next.length < MIN_LENGTH) return setError(`Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự.`);
    if (form.next !== form.confirm) return setError('Hai lần nhập mật khẩu mới không giống nhau.');

    setLoading(true);
    try {
      await apiPost('/auth/change-password', { currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setSuccess('Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <>
      <h1 className="admin-title">Đổi mật khẩu</h1>
      <p className="admin-intro">
        Mật khẩu mới cần ít nhất {MIN_LENGTH} ký tự. Sau khi đổi, tài khoản của bạn sẽ tự đăng xuất ở các máy khác.
      </p>

      <form className="card admin-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="current">Mật khẩu hiện tại</label>
          <input id="current" className="input" type={type} value={form.current} onChange={set('current')} autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="next">Mật khẩu mới</label>
          <input id="next" className="input" type={type} value={form.next} onChange={set('next')} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirm">Nhập lại mật khẩu mới</label>
          <input id="confirm" className="input" type={type} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          <label className="checkbox-label">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Hiện mật khẩu
          </label>
        </div>

        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        {success && <p className="alert-success admin-message" role="status">{success}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </>
  );
}
