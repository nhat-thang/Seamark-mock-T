import { useState } from 'react';
import { ArrowIcon } from './brand/SiteHeader.jsx';
import { validateStudent } from '../utils/validation.js';
import './StudentForm.css';

/**
 * Form Training Test: chỉ nhập Họ và Tên (không cần số điện thoại — đã chốt với người dùng).
 * Bấm "Tiếp tục" -> kiểm tra -> hợp lệ thì gọi onSubmit(values).
 */
export default function StudentForm({ initialValues, onSubmit }) {
  const [form, setForm] = useState({
    lastName: initialValues?.lastName || '',
    firstName: initialValues?.firstName || '',
  });
  const [errors, setErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    // Người dùng đang sửa ô nào thì xóa lỗi của ô đó
    if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const { values, errors: newErrors } = validateStudent(form);
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="student-name-row">
        <Field
          id="lastName"
          label="Họ"
          value={form.lastName}
          error={errors.lastName}
          onChange={handleChange}
          autoComplete="family-name"
          placeholder="Ví dụ: Nguyễn Văn"
        />
        <Field
          id="firstName"
          label="Tên"
          value={form.firstName}
          error={errors.firstName}
          onChange={handleChange}
          autoComplete="given-name"
          placeholder="Ví dụ: An"
        />
      </div>
      <button type="submit" className="btn btn-sun student-submit">
        Tiếp tục: chọn đề
        <ArrowIcon />
      </button>
    </form>
  );
}

// Một ô nhập có nhãn, gợi ý và thông báo lỗi
function Field({ id, label, error, hint, ...inputProps }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        className={`input${error ? ' has-error' : ''}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
