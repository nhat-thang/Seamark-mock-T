import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../utils/api.js';
import { formatDateTime, ROLE_LABELS } from '../utils/format.js';
import { useAdmin } from './AdminLayout.jsx';

const MIN_LENGTH = 8;
const EMPTY_FORM = { displayName: '', username: '', password: '' };

// Quản lý tài khoản admin — chỉ admin chính
export default function AccountsPage() {
  const me = useAdmin();
  const [accounts, setAccounts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' }); // thông báo chung sau mỗi thao tác
  const [resetFor, setResetFor] = useState(null); // id tài khoản đang mở ô "đặt lại mật khẩu"

  const load = useCallback(() => {
    apiGet('/admin/accounts')
      .then((data) => {
        setAccounts(data.accounts);
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(load, [load]);

  async function toggleActive(acc) {
    const question = acc.isActive
      ? `Vô hiệu hóa tài khoản của "${acc.displayName}"?\n\nNgười này sẽ bị đăng xuất ngay và không đăng nhập được nữa cho tới khi bạn mở lại.`
      : `Mở lại tài khoản của "${acc.displayName}"?\n\nNgười này sẽ đăng nhập lại được bằng mật khẩu cũ.`;
    if (!window.confirm(question)) return;
    try {
      await apiPost(`/admin/accounts/${acc.id}/${acc.isActive ? 'disable' : 'enable'}`);
      setMessage({
        type: 'success',
        text: acc.isActive ? `Đã vô hiệu hóa tài khoản của ${acc.displayName}.` : `Đã mở lại tài khoản của ${acc.displayName}.`,
      });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <>
      <h1 className="admin-title">Tài khoản admin</h1>
      <p className="admin-intro">
        Tạo tài khoản cho giáo viên. Mọi admin dùng được các chức năng ở trang chính như nhau.
        Nếu ai đó quên mật khẩu, bấm "Đặt lại mật khẩu" ở dòng của người đó.
      </p>

      <CreateAccountForm
        onCreated={(acc, password) => {
          setMessage({
            type: 'success',
            text: `Đã tạo tài khoản cho ${acc.displayName}. Hãy báo cho người đó: tên đăng nhập "${acc.username}", mật khẩu "${password}".`,
          });
          load();
        }}
      />

      <section className="admin-section">
        <h2 className="admin-section-title">Danh sách tài khoản</h2>

        {message.text && (
          <p className={`admin-message ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">
            {message.text}
          </p>
        )}
        {loadError && <p className="alert-error admin-message">{loadError}</p>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tên hiển thị</th>
                <th>Tên đăng nhập</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <Fragment key={acc.id}>
                  <tr>
                    <td><strong>{acc.displayName}</strong></td>
                    <td>{acc.username}</td>
                    <td className="nowrap">{ROLE_LABELS[acc.role]}</td>
                    <td>
                      {acc.isActive
                        ? <span className="tag tag-ok">Đang hoạt động</span>
                        : <span className="tag tag-off">Đã vô hiệu hóa</span>}
                    </td>
                    <td className="nowrap">{acc.lastLoginAt ? formatDateTime(acc.lastLoginAt) : 'Chưa đăng nhập'}</td>
                    <td>
                      {acc.id === me.id ? (
                        <span className="muted">Tài khoản của bạn</span>
                      ) : (
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setResetFor(resetFor === acc.id ? null : acc.id)}
                          >
                            Đặt lại mật khẩu
                          </button>
                          <button
                            type="button"
                            className={`btn btn-small ${acc.isActive ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => toggleActive(acc)}
                          >
                            {acc.isActive ? 'Vô hiệu hóa' : 'Mở lại'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {resetFor === acc.id && (
                    <tr className="row-panel">
                      <td colSpan={6}>
                        <ResetPasswordPanel
                          account={acc}
                          onCancel={() => setResetFor(null)}
                          onDone={(password) => {
                            setResetFor(null);
                            setMessage({
                              type: 'success',
                              text: `Đã đặt mật khẩu mới cho ${acc.displayName}: "${password}". Hãy báo cho người đó và nhắc họ tự đổi lại sau khi đăng nhập.`,
                            });
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Form tạo tài khoản mới
function CreateAccountForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.displayName.trim()) return setError('Vui lòng nhập tên hiển thị.');
    if (!form.username.trim()) return setError('Vui lòng nhập tên đăng nhập.');
    if (form.password.length < MIN_LENGTH) return setError(`Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự.`);

    setLoading(true);
    try {
      const data = await apiPost('/admin/accounts', form);
      onCreated(data.account, form.password);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Tạo tài khoản mới</h2>
      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="admin-form-row">
          <div className="field">
            <label htmlFor="new-display">Tên hiển thị</label>
            <input id="new-display" className="input" value={form.displayName} onChange={set('displayName')} placeholder="Ví dụ: Cô Lan" />
            <p className="field-hint">Tên mọi người nhìn thấy trên web.</p>
          </div>
          <div className="field">
            <label htmlFor="new-username">Tên đăng nhập</label>
            <input
              id="new-username"
              className="input"
              value={form.username}
              onChange={set('username')}
              placeholder="Ví dụ: colan"
              autoComplete="off"
              autoCapitalize="none"
            />
            <p className="field-hint">Chữ không dấu, số, dấu chấm hoặc gạch dưới. Ít nhất 3 ký tự.</p>
          </div>
          <div className="field">
            <label htmlFor="new-password">Mật khẩu</label>
            {/* Hiện rõ chữ để admin chính ghi lại và báo cho người dùng */}
            <input id="new-password" className="input" type="text" value={form.password} onChange={set('password')} autoComplete="off" />
            <p className="field-hint">Ít nhất {MIN_LENGTH} ký tự.</p>
          </div>
        </div>
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
      </form>
    </section>
  );
}

// Ô nhập mật khẩu mới cho người quên mật khẩu
function ResetPasswordPanel({ account, onCancel, onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) return setError(`Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự.`);
    setLoading(true);
    try {
      await apiPost(`/admin/accounts/${account.id}/reset-password`, { newPassword: password });
      onDone(password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`reset-${account.id}`}>Mật khẩu mới cho {account.displayName}</label>
        <input
          id={`reset-${account.id}`}
          className="input"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <p className="field-hint">Người này sẽ bị đăng xuất và phải đăng nhập lại bằng mật khẩu mới.</p>
      </div>
      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={loading}>
          {loading ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </form>
  );
}
