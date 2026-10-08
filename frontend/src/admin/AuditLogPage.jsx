import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api.js';
import { AUDIT_ACTION_LABELS, formatDateTime } from '../utils/format.js';
import { useHistory } from './useHistory.js';
import Pagination from './Pagination.jsx';

const EMPTY_FILTERS = { adminId: '', from: '', to: '' };

// Lịch sử chỉnh sửa (đề thi, tài liệu, tài khoản) — chỉ admin chính
export default function AuditLogPage() {
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const history = useHistory('/admin/history/audit', filters, page);

  // Danh sách admin để chọn trong bộ lọc
  useEffect(() => {
    apiGet('/admin/accounts').then((d) => setAccounts(d.accounts)).catch(() => {});
  }, []);

  const setFilter = (name) => (e) => {
    setFilters((f) => ({ ...f, [name]: e.target.value }));
    setPage(1);
  };

  return (
    <>
      <h1 className="admin-title">Lịch sử chỉnh sửa</h1>
      <p className="admin-intro">
        Mọi thay đổi trên web: ai làm, làm gì, lúc nào — tài khoản, tạo đề, sửa đề, xuất bản, giành quyền sửa đề.
        Các lần tự động lưu liên tiếp của cùng một người được gộp thành một dòng (mỗi 10 phút).
      </p>

      <div className="filters">
        <div className="field">
          <label htmlFor="f-admin">Người thực hiện</label>
          <select id="f-admin" className="input" value={filters.adminId} onChange={setFilter('adminId')}>
            <option value="">Tất cả</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
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
              <th>Người thực hiện</th>
              <th>Thao tác</th>
              <th>Đề thi</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((item) => (
              <tr key={item.id}>
                <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                <td>{item.admin ? item.admin.displayName : <span className="muted">(không rõ)</span>}</td>
                <td><span className="tag tag-info">{AUDIT_ACTION_LABELS[item.action] || item.action}</span></td>
                <td>{item.exam ? `${item.exam.code} – ${item.exam.title}` : <span className="muted">—</span>}</td>
                <td>{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.loading && history.items.length === 0 && <p className="table-empty">Chưa có lịch sử nào.</p>}
        {history.loading && <p className="table-empty">Đang tải…</p>}
      </div>

      <Pagination page={history.page} totalPages={history.totalPages} onChange={setPage} />
    </>
  );
}
