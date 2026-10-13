import { useEffect, useState } from 'react';
import { apiGet } from '../../utils/api.js';
import { CLASS_COLORS, formatMoney } from '../../utils/schedule.js';

/**
 * Form tạo / sửa lớp (chỉ admin chính): tên, giáo viên phụ trách, học phí, màu trên thời khóa biểu, ghi chú.
 * Học phí: X buổi mỗi kì + học phí mỗi buổi. Để trống = chưa cài (chưa tính tiền, chưa cảnh báo).
 * onSubmit(dữ liệu) trả Promise; lỗi (err.message) hiện ngay trong form.
 */
export default function ClassForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    color: initial?.color ?? 'blue',
    cycleSessions: initial?.cycleSessions == null ? '' : String(initial.cycleSessions),
    pricePerSession: initial?.pricePerSession == null ? '' : String(initial.pricePerSession),
    note: initial?.note ?? '',
  });
  const [teacherIds, setTeacherIds] = useState((initial?.teachers || []).map((t) => t.id));
  const [teachers, setTeachers] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  useEffect(() => {
    apiGet('/admin/schedule/teachers')
      .then((d) => setTeachers(d.teachers.filter((t) => t.role !== 'owner')))
      .catch(() => setTeachers([]));
  }, []);

  const price = form.pricePerSession.trim() === '' ? null : Number(form.pricePerSession.replace(/[.,\s]/g, ''));
  const cycle = form.cycleSessions.trim() === '' ? null : Number(form.cycleSessions);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Vui lòng nhập tên lớp.');
    if (cycle !== null && (!Number.isInteger(cycle) || cycle < 1 || cycle > 200)) return setError('Số buổi mỗi kì học phí phải từ 1 đến 200.');
    if (price !== null && (!Number.isInteger(price) || price < 0)) return setError('Học phí mỗi buổi phải là số tiền, ví dụ 150000.');
    setSaving(true);
    try {
      await onSubmit({ ...form, cycleSessions: cycle, pricePerSession: price, teacherIds });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const toggleTeacher = (id) => setTeacherIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <form className="cl-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="cf-name">Tên lớp</label>
        <input id="cf-name" className="input" value={form.name} onChange={set('name')} placeholder="Ví dụ: TOEIC 550+ Khóa 12" maxLength={60} />
      </div>

      <fieldset className="cl-teacher-pick">
        <legend>Giáo viên phụ trách lớp</legend>
        <p className="field-hint">
          Giáo viên phụ trách thấy lớp, điểm danh được mọi buổi của lớp. Giáo viên được xếp dạy một buổi của lớp cũng tự thành giáo viên phụ trách.
        </p>
        {!teachers && <p className="muted small-text">Đang tải…</p>}
        {teachers && teachers.length === 0 && <p className="muted small-text">Chưa có tài khoản giáo viên nào. Tạo ở mục "Tài khoản admin".</p>}
        <div className="cl-chip-list">
          {(teachers || []).map((t) => (
            <label key={t.id} className={`cl-chip ${teacherIds.includes(t.id) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={teacherIds.includes(t.id)} onChange={() => toggleTeacher(t.id)} />
              {t.displayName}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="cl-fee-box">
        <legend>Học phí (chỉ admin chính thấy)</legend>
        <div className="cl-form-grid">
          <div className="field">
            <label htmlFor="cf-cycle">Mỗi kì học phí gồm</label>
            <div className="cl-input-unit">
              <input id="cf-cycle" className="input" type="number" min="1" max="200" inputMode="numeric" value={form.cycleSessions} onChange={set('cycleSessions')} placeholder="Ví dụ 8" />
              <span>buổi</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cf-price">Học phí mỗi buổi</label>
            <div className="cl-input-unit">
              <input id="cf-price" className="input" inputMode="numeric" value={form.pricePerSession} onChange={set('pricePerSession')} placeholder="Ví dụ 150000" />
              <span>đồng</span>
            </div>
          </div>
        </div>
        <p className="field-hint">
          {cycle && price !== null && Number.isInteger(price)
            ? `Mỗi kì ${cycle} buổi = ${formatMoney(cycle * price)} (chưa tính giảm giá). Học sinh đóng trước mỗi kì.`
            : 'Để trống = chưa cài học phí: lớp chưa tính tiền và chưa cảnh báo.'}
        </p>
      </fieldset>

      <fieldset className="cl-colors">
        <legend>Màu của lớp trên thời khóa biểu</legend>
        {Object.entries(CLASS_COLORS).map(([key, c]) => (
          <label key={key} className={`cl-color ${form.color === key ? 'is-on' : ''}`} style={{ '--swatch': c.main }} title={c.label}>
            <input type="radio" name="cf-color" value={key} checked={form.color === key} onChange={set('color')} />
            <span className="cl-color-dot" aria-hidden="true" />
            <span className="cl-sr">{c.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="cf-note">Ghi chú (không bắt buộc)</label>
        <input id="cf-note" className="input" value={form.note} onChange={set('note')} placeholder="Ví dụ: Giáo trình Economy 5, phòng 2" maxLength={300} />
      </div>

      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang lưu…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}
