import { useState } from 'react';
import { describeUserAgent, formatDateTime, LOGIN_REASON_LABELS } from '../utils/format.js';
import { useHistory } from './useHistory.js';
import Pagination from './Pagination.jsx';

const EMPTY_FILTERS = { username: '', result: '', from: '', to: '' };

// Lịch sử đăng nhập — chỉ admin chính
export default function LoginHistoryPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const history = useHistory('/admin/history/logins', filters, page);

  const setFilter = (name) => (e) => {
    setFilters((f) => ({ ...f, [name]: e.target.value }));
    setPage(1);
  };

  return (
    <>
      <h1 className="admin-title">Lịch sử đăng nhập</h1>
      <p className="admin-intro">
        Mọi lần đăng nhập vào trang quản trị, kể cả các lần nhập sai. Nếu thấy nhiều lần sai lạ,
        hãy đổi mật khẩu của tài khoản đó.
      </p>

      <div className="filters">
        <div className="field">
          <label htmlFor="f-username">Tên đăng nhập</label>
          <input id="f-username" className="input" value={filters.username} onChange={setFilter('username')} />
        </div>
        <div className="field">
          <label htmlFor="f-result">Kết quả</label>
          <select id="f-result" className="input" value={filters.result} onChange={setFilter('result')}>
            <option value="">Tất cả</option>
            <option value="success">Thành công</option>
            <option value="fail">Thất bại</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-from">Từ ngày</label>
          <input id="f-from" type="date" className="input" value={filters.from} onChange={setFilter('from')} />
        </div>
        <div className="field">
          <label htmlFor="f-to">Đến ngày</label>
          <input id="f-to" type="date" className="input" value={filters.to} onChange={setFilter('to')} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
          Xóa bộ lọc
        </button>
      </div>

      {history.error && <p className="alert-error admin-message">{history.error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Tên đăng nhập</th>
              <th>Người dùng</th>
              <th>Kết quả</th>
              <th>Địa chỉ IP</th>
              <th>Thiết bị</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((item) => (
              <tr key={item.id}>
                <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                <td>{item.username}</td>
                <td>{item.displayName || <span className="muted">—</span>}</td>
                <td>
                  <span className={`tag ${item.success ? 'tag-ok' : 'tag-off'}`}>
                    {LOGIN_REASON_LABELS[item.reason] || item.reason}
                  </span>
                </td>
                <td className="nowrap">{item.ip}</td>
                <td>{describeUserAgent(item.userAgent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.loading && history.items.length === 0 && <p className="table-empty">Chưa có lần đăng nhập nào.</p>}
        {history.loading && <p className="table-empty">Đang tải…</p>}
      </div>

      <Pagination page={history.page} totalPages={history.totalPages} onChange={setPage} />
    </>
  );
}
