import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';

// Danh sách đề thi — mọi admin
export default function ExamListPage() {
  const [exams, setExams] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const navMessage = useLocation().state?.message; // ví dụ: "Đã xóa đề …" (từ trang sửa đề)
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = () =>
    apiGet('/admin/exams')
      .then((d) => setExams(d.exams))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  // Xóa đề: hỏi lại 2 bước (xác nhận + gõ lại mã đề), server ghi vào lịch sử chỉnh sửa
  async function removeExam(e) {
    const ok = window.confirm(
      `Bạn có chắc chắn muốn XÓA HẲN đề "${e.title}" (${e.code})?\n\n` +
        `Sẽ xóa luôn ${e.attemptCount} lượt làm bài của học viên và các file ảnh / audio của đề.\n` +
        'Không khôi phục được.'
    );
    if (!ok) return;
    const typed = window.prompt(`Để xác nhận, hãy gõ lại mã đề: ${e.code}`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== e.code) {
      setError('Mã đề gõ lại không khớp nên chưa xóa.');
      return;
    }
    setDeleting(e.id);
    setError('');
    try {
      const r = await apiPost(`/admin/exams/${e.id}/delete`, { confirmCode: typed });
      setMessage(`Đã xóa đề "${e.title}" (${e.code}) cùng ${r.attempts} lượt làm bài.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="admin-title">Đề thi</h1>
          <p className="admin-intro">
            Bấm "Mở" để xem và sửa đề. Mọi thay đổi được lưu vào <strong>bản nháp</strong>; học viên chỉ thấy đề sau khi
            bạn bấm <strong>"Xuất bản"</strong>.
          </p>
        </div>
        {!showCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Tạo đề mới
          </button>
        )}
      </div>

      {(message || navMessage) && <p className="alert-success admin-message" role="status">{message || navMessage}</p>}
      {showCreate && <CreateExamForm onCancel={() => setShowCreate(false)} />}

      {error && <p className="alert-error admin-message">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Mã đề</th>
              <th>Tên đề</th>
              <th>Số câu</th>
              <th>Trạng thái</th>
              <th>Sửa gần nhất</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(exams || []).map((e) => (
              <tr key={e.id}>
                <td className="nowrap">
                  <strong>{e.code}</strong>
                  <div className="muted small-text">{e.examType === 'CUSTOM' ? 'Đề tự thiết kế' : 'TOEIC 2 kỹ năng'}</div>
                </td>
                <td>
                  {e.title}
                  {e.editingBy && <div className="muted small-text">{e.editingBy} đang chỉnh sửa</div>}
                </td>
                <td>{e.questionCount}</td>
                <td><ExamStatusTag exam={e} /></td>
                <td className="nowrap">
                  {formatDateTime(e.updatedAt)}
                  {e.updatedBy && <div className="muted small-text">{e.updatedBy}</div>}
                </td>
                <td>
                  <div className="table-actions">
                    <Link to={`/admin/de-thi/${e.id}`} className="btn btn-secondary btn-small">
                      Mở
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => removeExam(e)}
                      disabled={deleting !== null}
                    >
                      {deleting === e.id ? 'Đang xóa…' : 'Xóa'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {exams && exams.length === 0 && <p className="table-empty">Chưa có đề nào. Bấm "Tạo đề mới" để bắt đầu.</p>}
        {!exams && !error && <p className="table-empty">Đang tải…</p>}
      </div>
    </>
  );
}

/** Nhãn trạng thái: Nháp / Đang mở / Đang mở – có thay đổi chưa xuất bản / Đã ngừng mở */
export function ExamStatusTag({ exam }) {
  if (exam.status === 'published') {
    return exam.hasUnpublishedChanges ? (
      <span className="tag tag-warn">Đang mở · có thay đổi chưa xuất bản</span>
    ) : (
      <span className="tag tag-ok">Đang mở cho học viên</span>
    );
  }
  return exam.everPublished ? <span className="tag tag-off">Đã ngừng mở</span> : <span className="tag tag-info">Nháp</span>;
}

function CreateExamForm({ onCancel }) {
  const navigate = useNavigate();
  // choice: 'TOEIC_LR' | 'CUSTOM' | 'tpl:<id>' (tạo từ khung mẫu)
  const [form, setForm] = useState({ choice: 'TOEIC_LR', code: '', title: '', durationMinutes: '120' });
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const loadTemplates = () =>
    apiGet('/admin/templates')
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  useEffect(() => {
    loadTemplates();
  }, []);

  function choose(choice, durationMinutes) {
    setForm((f) => ({ ...f, choice, durationMinutes: String(durationMinutes) }));
  }

  async function removeTemplate(t) {
    if (!window.confirm(`Xóa khung mẫu "${t.name}"?\n\nCác đề đã tạo từ khung này không bị ảnh hưởng.`)) return;
    try {
      await apiPost(`/admin/templates/${t.id}/delete`);
      if (form.choice === `tpl:${t.id}`) choose('TOEIC_LR', 120);
      loadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.code.trim()) return setError('Vui lòng nhập mã đề.');
    if (!form.title.trim()) return setError('Vui lòng nhập tên đề.');
    setLoading(true);
    const fromTemplate = form.choice.startsWith('tpl:');
    try {
      const r = await apiPost('/admin/exams', {
        code: form.code,
        title: form.title,
        durationMinutes: Number(form.durationMinutes),
        examType: fromTemplate ? 'CUSTOM' : form.choice,
        templateId: fromTemplate ? Number(form.choice.slice(4)) : undefined,
      });
      navigate(`/admin/de-thi/${r.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  const Row = ({ value, title, desc, duration, children }) => (
    <label className={`type-row ${form.choice === value ? 'is-on' : ''}`}>
      <input type="radio" name="exam-type" checked={form.choice === value} onChange={() => choose(value, duration)} />
      <span className="type-row-text">
        <strong>{title}</strong>
        <span className="type-row-desc">{desc}</span>
      </span>
      {children}
    </label>
  );

  return (
    <section className="admin-section">
      <form className="card create-exam" onSubmit={handleSubmit} noValidate>
        <h2 className="admin-section-title">Tạo đề mới</h2>

        <fieldset className="type-list">
          <legend className="field-label">Chọn loại đề</legend>
          <Row value="TOEIC_LR" duration={120} title="Đề TOEIC 2 kỹ năng" desc="200 câu, 7 Part chuẩn, nhập bằng Excel mẫu, điểm ước tính /990" />
          <Row value="CUSTOM" duration={45} title="Đề tự thiết kế" desc="Tự chia part, số question, ảnh / audio, nhóm đọc hiểu; chấm thang 10" />

          {templates.length > 0 && <p className="type-group-label">Khung mẫu đã lưu</p>}
          {templates.map((t) => (
            <Row
              key={t.id}
              value={`tpl:${t.id}`}
              duration={t.durationMinutes}
              title={t.name}
              desc={`${t.partCount} part · ${t.questionCount} question · ${t.durationMinutes} phút`}
            >
              <button
                type="button"
                className="btn btn-link small-text type-row-remove"
                onClick={(e) => {
                  e.preventDefault();
                  removeTemplate(t);
                }}
              >
                Xóa
              </button>
            </Row>
          ))}
        </fieldset>

        <div className="admin-form-row create-exam-fields">
          <div className="field">
            <label htmlFor="c-code">Mã đề</label>
            <input id="c-code" className="input" value={form.code} onChange={set('code')} placeholder="Ví dụ: READING-02" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="c-title">Tên đề (học viên thấy)</label>
            <input id="c-title" className="input" value={form.title} onChange={set('title')} placeholder="Ví dụ: TOEIC Reading – Đề 2" />
          </div>
          <div className="field">
            <label htmlFor="c-duration">Thời gian (phút)</label>
            <input id="c-duration" className="input" type="number" min="1" max="600" value={form.durationMinutes} onChange={set('durationMinutes')} />
          </div>
        </div>
        <p className="field-hint create-exam-hint">Mã đề: chữ không dấu, số, dấu gạch ngang, không trùng đề khác.</p>
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Đang tạo…' : 'Tạo đề'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}
