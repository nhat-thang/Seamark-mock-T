// Kiểm tra thông tin học viên nhập vào form.

/** Bỏ dấu cách, dấu chấm, dấu gạch mà người dùng hay gõ trong SĐT: "090 123.45-67" -> "0901234567" */
export function normalizePhone(value) {
  return String(value || '').replace(/[\s.\-]/g, '');
}

/** SĐT Việt Nam: đúng 10 chữ số, bắt đầu bằng số 0 */
export function isValidVnPhone(phone) {
  return /^0\d{9}$/.test(phone);
}

/** Gộp nhiều dấu cách liền nhau thành một và bỏ khoảng trắng ở hai đầu */
export function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Kiểm tra cả form. Trả về { values, errors }.
 * errors rỗng nghĩa là hợp lệ.
 */
export function validateStudent({ lastName, firstName, phone }) {
  const values = {
    lastName: cleanName(lastName),
    firstName: cleanName(firstName),
    phone: normalizePhone(phone),
  };
  const errors = {};

  if (!values.lastName) errors.lastName = 'Vui lòng nhập họ.';
  else if (values.lastName.length > 50) errors.lastName = 'Họ quá dài (tối đa 50 ký tự).';

  if (!values.firstName) errors.firstName = 'Vui lòng nhập tên.';
  else if (values.firstName.length > 30) errors.firstName = 'Tên quá dài (tối đa 30 ký tự).';

  if (!values.phone) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (!isValidVnPhone(values.phone))
    errors.phone = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.';

  return { values, errors };
}
