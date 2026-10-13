import { useState } from 'react';
import { CLASS_COLORS } from '../../utils/schedule.js';

/**
 * Form tạo / sửa lớp: tên, màu trên thời khóa biểu, nhắc học phí, ghi chú.
 * onSubmit(dữ liệu) trả Promise; lỗi (err.message) hiện ngay trong form.
 */
export default function ClassForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    color: initial?.color ?? 'blue',
    feeEvery: String(initial?.feeEvery ?? 10),
    note: initial?.note ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Vui lòng nhập tên lớp.');
    const fee = form.feeEvery.trim() === '' ? 0 : Number(form.feeEvery);
    if (!Number.isInteger(fee) || fee < 0 || fee > 100) return setError('Số buổi nhắc học phí phải là số từ 0 đến 100.');
    setSaving(true);
    try {
      await onSubmit({ ...form, feeEvery: fee });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="cl-form" onSubmit={handleSubmit} noValidate>
      <div className="cl-form-grid">
        <div className="field">
          <label htmlFor="cf-name">Tên lớp</label>
          <input id="cf-name" className="input" value={form.name} onChange={set('name')} placeholder="Ví dụ: TOEIC 550+ Khóa 12" maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="cf-fee">Nhắc học phí sau mỗi</label>
          <div className="cl-input-unit">
            <input id="cf-fee" className="input" type="number" min="0" max="100" inputMode="numeric" value={form.feeEvery} onChange={set('feeEvery')} />
            <span>buổi học</span>
          </div>
          <p className="field-hint">Tính riêng cho từng học sinh từ ngày bạn đó vào học. Ghi 0 nếu không cần nhắc.</p>
        </div>
      </div>

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
