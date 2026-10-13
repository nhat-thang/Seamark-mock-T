import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import { useHistory } from './useHistory.js';
import Pagination from './Pagination.jsx';

const EMPTY_FILTERS = { name: '', phone: '', category: '', authorId: '', examId: '', status: '', from: '', to: '' };
const SHOW_NOS = 15; // số câu sai hiện tối đa trên một dòng (xem đủ ở trang chi tiết)

/** "Sai câu 3, 7, 12" + "Bỏ trống câu 5" (đã nộp bài) */
function Mistakes({ r }) {
  if (r.status !== 'submitted') return null;
  const list = (nos) => nos.slice(0, SHOW_NOS).join(', ') + (nos.length > SHOW_NOS ? ` … (+${nos.length - SHOW_NOS})` : '');
  if (r.wrong.length === 0 && r.blank.length === 0) return <div className="text-ok small-text">Đúng hết</div>;
  return (
    <div className="result-mistakes small-text">
      {r.wrong.length > 0 && <div className="text-error">Sai câu {list(r.wrong)}</div>}
      {r.blank.length > 0 && <div className="muted">Bỏ trống câu {list(r.blank)}</div>}
    </div>
  );
}

// Kết quả làm bài — mọi admin. Mở từ danh sách đề: /admin/ket-qua?examId=... (lọc sẵn theo đề)
export default function ResultsPage() {
  const [params] = useSearchParams();
  const initial = { ...EMPTY_FILTERS, examId: params.get('examId') || '' };
  const [exams, setExams] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(initial); // giá trị đang gõ
  const [filters, setFilters] = useState(initial); // giá trị dùng để tải (chờ ngừng gõ)
  const [page, setPage] = useState(1);
  const list = useHistory('/admin/results', filters, page);

  useEffect(() => {
    apiGet('/admin/exams').then((d) => setExams(d.exams)).catch(() => {});
    apiGet('/admin/schedule/teachers').then((d) => setTeachers(d.teachers)).catch(() => {});
  }, []);
  const examOptions = exams.filter((e) => !form.category || e.category === form.category);

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
          <p className="admin-intro">
            Mỗi dòng có điểm và các câu học viên làm sai. Bấm vào tên để xem bài làm chi tiết (chọn gì ở từng câu, đáp án đúng).
          </p>
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
          <label htmlFor="r-category">Loại đề</label>
          <select id="r-category" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, examId: '' }))}>
            <option value="">Tất cả</option>
            <option value="exam">Training Test</option>
            <option value="homework">Class Assignment</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-author">Giáo viên ra đề</label>
          <select id="r-author" className="input" value={form.authorId} onChange={set('authorId')}>
            <option value="">Tất cả</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-exam">Đề thi</label>
          <select id="r-exam" className="input" value={form.examId} onChange={set('examId')}>
            <option value="">Tất cả</option>
            {examOptions.map((e) => <option key={e.id} value={e.id}>{e.code} – {e.title}</option>)}
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
              <th>SĐT / Lớp</th>
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
                <td className="nowrap">
                  {r.student.className ? <span className="hw-sub">Lớp {r.student.className}</span> : r.student.phone || <span className="muted">—</span>}
                </td>
                <td className="col-exam">
                  {r.exam.title}
                  {r.exam.category === 'homework' && r.exam.author && (
                    <div className="small-text hw-sub">Giáo viên ra đề: {r.exam.author}</div>
                  )}
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
                  <Mistakes r={r} />
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
