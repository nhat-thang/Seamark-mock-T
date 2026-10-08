import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import { useHistory } from './useHistory.js';
import Pagination from './Pagination.jsx';

const EMPTY_FILTERS = { name: '', phone: '', examId: '', status: '', from: '', to: '' };

// Kết quả làm bài — mọi admin
export default function ResultsPage() {
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState(EMPTY_FILTERS); // giá trị đang gõ
  const [filters, setFilters] = useState(EMPTY_FILTERS); // giá trị dùng để tải (chờ ngừng gõ)
  const [page, setPage] = useState(1);
  const list = useHistory('/admin/results', filters, page);

  useEffect(() => {
    apiGet('/admin/exams').then((d) => setExams(d.exams)).catch(() => {});
  }, []);

  // Ô chữ: chờ ngừng gõ 0,4 giây mới tải lại, đỡ gọi server liên tục
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(form);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [form]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="admin-title">Kết quả làm bài</h1>
          <p className="admin-intro">Bấm vào một dòng để xem bài làm chi tiết (học viên chọn gì ở từng câu, đúng hay sai).</p>
        </div>
        <a className="btn btn-primary" href={`/api/admin/results/export${exportQuery ? `?${exportQuery}` : ''}`} download>
          Xuất Excel
        </a>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="r-name">Tên học viên</label>
          <input id="r-name" className="input" value={form.name} onChange={set('name')} placeholder="Gõ có dấu hoặc không dấu" />
        </div>
        <div className="field">
          <label htmlFor="r-phone">Số điện thoại</label>
          <input id="r-phone" className="input" inputMode="numeric" value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label htmlFor="r-exam">Đề thi</label>
          <select id="r-exam" className="input" value={form.examId} onChange={set('examId')}>
            <option value="">Tất cả</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.code} – {e.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-status">Trạng thái</label>
          <select id="r-status" className="input" value={form.status} onChange={set('status')}>
            <option value="">Tất cả</option>
            <option value="submitted">Đã nộp</option>
            <option value="in_progress">Đang làm</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-from">Từ ngày</label>
          <input id="r-from" type="date" className="input" value={form.from} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="r-to">Đến ngày</label>
          <input id="r-to" type="date" className="input" value={form.to} onChange={set('to')} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setForm(EMPTY_FILTERS)}>
          Xóa bộ lọc
        </button>
      </div>

      {list.error && <p className="alert-error admin-message">{list.error}</p>}
      {!list.loading && <p className="muted small-text admin-message">Tìm thấy {list.total} lượt làm bài.</p>}

      <div className="table-wrap">
        <table className="table results-table">
          <thead>
            <tr>
              <th>Bắt đầu</th>
              <th>Học viên</th>
              <th>SĐT</th>
              <th>Đề</th>
              <th>Trạng thái</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">
                  <Link to={`/admin/ket-qua/${r.id}`} className="row-link">{formatDateTime(r.startedAt)}</Link>
                  {r.minutesUsed !== null && <div className="muted small-text">làm {r.minutesUsed} phút</div>}
                </td>
                <td className="nowrap">
                  <Link to={`/admin/ket-qua/${r.id}`} className="row-link">
                    <strong>{r.student.lastName} {r.student.firstName}</strong>
                  </Link>
                </td>
                <td className="nowrap">{r.student.phone}</td>
                <td className="col-exam">
                  {r.exam.title}
                  <div className="muted small-text">{r.exam.code} · lần xuất bản {r.exam.versionNo}</div>
                </td>
                <td>
                  {r.status === 'submitted' ? (
                    <span className="tag tag-ok">Đã nộp</span>
                  ) : (
                    <span className="tag tag-warn">Đang làm ({r.answered}/{r.questionCount})</span>
                  )}
                </td>
                <td className="nowrap">
                  {r.exam.examType === 'CUSTOM' ? (
                    r.correct !== null ? (
                      <>
                        <div>Đúng {r.correct}/{r.total} câu</div>
                        <div><strong>{String(r.score10).replace('.', ',')} / 10 điểm</strong></div>
                      </>
                    ) : (
                      <span className="muted">chưa chấm</span>
                    )
                  ) : (
                  <>
                  <SectionCell label="Listening" s={r.listening} />
                  <SectionCell label="Reading" s={r.reading} />
                  {r.totalScore !== null && <div><strong>Tổng ước tính: {r.totalScore}</strong></div>}
                  </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && <p className="table-empty">Không có lượt làm bài nào phù hợp.</p>}
        {list.loading && <p className="table-empty">Đang tải…</p>}
      </div>

      <Pagination page={list.page} totalPages={list.totalPages} onChange={setPage} />
    </>
  );
}

// "Reading: 45/100 câu (230 điểm)" — phần không có trong đề thì không hiện
function SectionCell({ label, s }) {
  if (!s.total) return null;
  return (
    <div>
      {label}: {s.correct === null ? <span className="muted">chưa chấm</span> : <>{s.correct}/{s.total} câu</>}
      {s.score !== null && <span className="muted small-text"> ({s.score} điểm)</span>}
    </div>
  );
}
