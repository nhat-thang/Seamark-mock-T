// Kiểm tra thông tin học viên nhập vào form.

/** Gộp nhiều dấu cách liền nhau thành một và bỏ khoảng trắng ở hai đầu */
export function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Kiểm tra form Training Test (chỉ họ và tên, không cần SĐT). Trả về { values, errors }.
 * errors rỗng nghĩa là hợp lệ.
 */
export function validateStudent({ lastName, firstName }) {
  const values = {
    lastName: cleanName(lastName),
    firstName: cleanName(firstName),
  };
  const errors = {};

  if (!values.lastName) errors.lastName = 'Vui lòng nhập họ.';
  else if (values.lastName.length > 50) errors.lastName = 'Họ quá dài (tối đa 50 ký tự).';

  if (!values.firstName) errors.firstName = 'Vui lòng nhập tên.';
  else if (values.firstName.length > 30) errors.firstName = 'Tên quá dài (tối đa 30 ký tự).';

  return { values, errors };
}
