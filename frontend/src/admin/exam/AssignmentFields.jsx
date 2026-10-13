import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import { classStyle } from '../../utils/schedule.js';

/** Danh sách lớp (để chọn lớp được giao đề) */
export function useClassList() {
  const [classes, setClasses] = useState(null);
  useEffect(() => {
    apiGet('/admin/classes').then((d) => setClasses(d.classes)).catch(() => setClasses([]));
  }, []);
  return classes;
}

/** Chọn các lớp được giao đề: mỗi lớp một nút bật / tắt, màu theo màu lớp */
export function ClassPicker({ classes, value, onChange, disabled = false }) {
  if (!classes) return <p className="muted small-text">Đang tải danh sách lớp…</p>;
  if (classes.length === 0) {
    return <p className="muted small-text">Chưa có lớp nào. Tạo lớp ở mục "Lớp học" trước, rồi quay lại giao đề.</p>;
  }
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="ca-classes" role="group" aria-label="Các lớp được giao đề">
      {classes.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`ca-class ${on ? 'is-on' : ''}`}
            style={classStyle(c.color)}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(c.id)}
          >
            <span className="ca-class-check" aria-hidden="true">{on ? '✓' : ''}</span>
            {c.name}
            <span className="ca-class-count">{c.studentCount} HS</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ô mật khẩu đề (không bắt buộc) */
export function AccessCodeInput({ id, value, onChange, disabled = false }) {
  return (
    <div className="field ca-password">
      <label htmlFor={id}>Mật khẩu đề <span className="muted small-text">(không bắt buộc)</span></label>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={30}
        autoComplete="off"
        placeholder="Để trống = học sinh không cần mật khẩu"
      />
      <p className="field-hint">Học sinh phải nhập đúng mật khẩu mới vào làm được (không phân biệt chữ hoa / thường).</p>
    </div>
  );
}

/**
 * Tab "Thông tin đề" của đề Class Assignment: lớp được giao + mật khẩu đề.
 * Lưu riêng bằng nút "Lưu" và có hiệu lực ngay (không cần xuất bản lại).
 */
export function AssignmentCard({ examId, exam, readOnly }) {
  const classes = useClassList();
  const [saved, setSaved] = useState({ classIds: exam.classes.map((c) => c.id), accessCode: exam.accessCode || '' });
  const [classIds, setClassIds] = useState(saved.classIds);
  const [accessCode, setAccessCode] = useState(saved.accessCode);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const dirty = accessCode.trim() !== saved.accessCode || [...classIds].sort().join() !== [...saved.classIds].sort().join();

  async function save() {
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const r = await apiPost(`/admin/exams/${examId}/assignment`, { classIds, accessCode });
      const next = { classIds: r.classes.map((c) => c.id), accessCode: r.accessCode };
      setSaved(next);
      setClassIds(next.classIds);
      setAccessCode(next.accessCode);
      setMsg({
        type: 'success',
        text: r.classes.length
          ? `Đã lưu. Học sinh lớp ${r.classes.map((c) => c.name).join(', ')} thấy đề này ngay (khi đề đang mở).`
          : 'Đã lưu. Đề chưa giao cho lớp nào nên học sinh chưa thấy.',
      });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <div className="card ca-card">
        <h2 className="admin-section-title">Giao cho lớp</h2>
        <p className="muted small-text">
          Học sinh của các lớp được chọn sẽ thấy đề này ở mục <strong>Class Assignment</strong> (sau khi đề được xuất bản).
          Thay đổi ở đây có hiệu lực ngay, không cần xuất bản lại.
        </p>
        <ClassPicker classes={classes} value={classIds} onChange={setClassIds} disabled={readOnly || busy} />
        <AccessCodeInput id="e-access-code" value={accessCode} onChange={setAccessCode} disabled={readOnly || busy} />
        {msg.text && <p className={`admin-message ${msg.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-primary" disabled={readOnly || busy || !dirty} onClick={save}>
          {busy ? 'Đang lưu…' : dirty ? 'Lưu lớp và mật khẩu' : 'Đã lưu'}
        </button>
      </div>
    </section>
  );
}
