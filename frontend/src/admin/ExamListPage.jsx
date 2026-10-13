import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import { ASSIGNMENT_PREFIX } from '../utils/assignment.js';
import { useAdmin } from './AdminLayout.jsx';
import { AccessCodeInput, ClassPicker, useClassList } from './exam/AssignmentFields.jsx';

// Danh sách đề thi — mọi admin
export default function ExamListPage() {
  const [exams, setExams] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const navMessage = useLocation().state?.message; // ví dụ: "Đã xóa đề …" (từ trang sửa đề)
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [view, setView] = useState('all'); // 'all' | 'exam' | 'homework'
  const count = (c) => (exams || []).filter((e) => c === 'all' || e.category === c).length;
  const shown = (exams || []).filter((e) => view === 'all' || e.category === view);

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

      <div className="exam-view-tabs" role="tablist" aria-label="Lọc đề">
        {[['all', 'Tất cả'], ['exam', 'Training Test'], ['homework', 'Class Assignment']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'is-on' : ''} onClick={() => setView(key)}>
            {label} <span className="exam-view-count">{count(key)}</span>
          </button>
        ))}
      </div>

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
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">
                  <strong>{e.code}</strong>
                  <div className="muted small-text">{e.examType === 'CUSTOM' ? 'Đề tự thiết kế' : 'TOEIC 2 kỹ năng'}</div>
                </td>
                <td>
                  {e.title}
                  {e.category === 'homework' && (
                    <div className="small-text hw-sub">
                      {e.classNames ? `Lớp: ${e.classNames}` : 'Chưa giao lớp nào'}
                      {e.author ? ` · Giáo viên: ${e.author}` : ''}
                    </div>
                  )}
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
                    <Link to={`/admin/de-thi/${e.id}?tab=activity`} className="btn btn-secondary btn-small">
                      Hoạt động{e.attemptCount > 0 ? ` (${e.attemptCount})` : ''}
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
        {exams && shown.length === 0 && (
          <p className="table-empty">
            {view === 'homework' ? 'Chưa có đề Class Assignment nào. Bấm "Tạo đề mới" → chọn "Class Assignment".' : 'Chưa có đề nào. Bấm "Tạo đề mới" để bắt đầu.'}
          </p>
        )}
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
  const me = useAdmin();
  // category: 'exam' (đề thi thử) | 'homework' (bài tập về nhà)
  // choice: 'TOEIC_LR' | 'CUSTOM' | 'tpl:<id>' (tạo từ khung mẫu)
  const [form, setForm] = useState({
    category: 'exam', choice: 'TOEIC_LR', code: '', title: '', durationMinutes: '120', authorId: String(me.id), classIds: [], accessCode: '',
  });
  const [teachers, setTeachers] = useState([]);
  const classes = useClassList();
  const [templates, setTemplates] = useState([]);
  const isHomework = form.category === 'homework';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const loadTemplates = () =>
    apiGet('/admin/templates')
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  useEffect(() => {
    loadTemplates();
    apiGet('/admin/schedule/teachers').then((d) => setTeachers(d.teachers)).catch(() => {});
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
    if (!isHomework && !form.code.trim()) return setError('Vui lòng nhập mã đề.');
    if (!form.title.trim()) return setError(isHomework ? 'Vui lòng đặt tên cho đề (ví dụ: Đề lớp 1A).' : 'Vui lòng nhập tên đề.');
    setLoading(true);
    const fromTemplate = form.choice.startsWith('tpl:');
    try {
      const r = await apiPost('/admin/exams', {
        category: form.category,
        // Class Assignment: mã đề web tự đặt (CA-001...), đổi được sau ở tab "Thông tin đề"
        code: isHomework ? '' : form.code,
        title: form.title,
        authorId: isHomework ? Number(form.authorId) : undefined,
        classIds: isHomework ? form.classIds : undefined,
        accessCode: isHomework ? form.accessCode : undefined,
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

        <fieldset className="purpose-list">
          <legend className="field-label">Bạn muốn tạo gì?</legend>
          {[
            { key: 'exam', title: 'Training Test', desc: 'Cho mọi người luyện tập: học viên chỉ nhập họ tên rồi chọn đề.' },
            { key: 'homework', title: 'Class Assignment', desc: 'Đề riêng của lớp: học sinh chọn lớp, bấm tên mình rồi làm. Có thể đặt mật khẩu.' },
          ].map((p) => (
            <label key={p.key} className={`purpose-card ${form.category === p.key ? 'is-on' : ''} ${p.key === 'homework' ? 'is-hw' : ''}`}>
              <input type="radio" name="exam-category" checked={form.category === p.key} onChange={() => setForm((f) => ({ ...f, category: p.key }))} />
              <span>
                <strong>{p.title}</strong>
                <span className="type-row-desc">{p.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

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

        {isHomework ? (
          <div className="admin-form-row create-exam-fields hw-fields">
            <div className="field">
              <label htmlFor="c-hw-title">Tên đề</label>
              <div className="hw-title-input">
                <span className="hw-prefix" aria-hidden="true">{ASSIGNMENT_PREFIX.trim()}</span>
                <input id="c-hw-title" className="input" value={form.title} onChange={set('title')} placeholder="Ví dụ: Đề lớp 1A" maxLength={170} />
              </div>
              <p className="field-hint">Học sinh thấy: <strong>{ASSIGNMENT_PREFIX}{form.title.trim() || '…'}</strong></p>
            </div>
            <div className="field">
              <label htmlFor="c-author">Giáo viên ra đề</label>
              <select id="c-author" className="input" value={form.authorId} onChange={set('authorId')}>
                {teachers.length === 0 && <option value={me.id}>{me.displayName}</option>}
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}{t.id === me.id ? ' (bạn)' : ''}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-hw-duration">Thời gian (phút)</label>
              <input id="c-hw-duration" className="input" type="number" min="1" max="600" value={form.durationMinutes} onChange={set('durationMinutes')} />
            </div>
          </div>
        ) : (
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
        )}
        {isHomework && (
          <div className="ca-create">
            <p className="field-label">Giao cho lớp</p>
            <ClassPicker classes={classes} value={form.classIds} onChange={(ids) => setForm((f) => ({ ...f, classIds: ids }))} />
            <p className="field-hint">Chọn được nhiều lớp. Chưa chọn cũng được, giao lớp sau ở tab "Thông tin đề".</p>
            <AccessCodeInput id="c-access-code" value={form.accessCode} onChange={(v) => setForm((f) => ({ ...f, accessCode: v }))} />
          </div>
        )}
        {isHomework ? (
          <p className="field-hint create-exam-hint">Mã đề web tự đặt (CA-001, CA-002…). Bên trong soạn đề, thời gian, cách làm bài giống hệt Training Test.</p>
        ) : (
          <p className="field-hint create-exam-hint">Mã đề: chữ không dấu, số, dấu gạch ngang, không trùng đề khác.</p>
        )}
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Đang tạo…' : isHomework ? 'Tạo đề Class Assignment' : 'Tạo đề'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}
