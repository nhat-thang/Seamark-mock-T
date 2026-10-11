// Thông tin trung tâm hiện ở trang chủ / chân trang. Đổi số điện thoại, địa chỉ ở đây.
export const SITE = {
  name: 'Seamark English School',
  motto: 'Set energy and motivation as real keys',
  hotline: '02382.212.666',
  address: '209 Lê Duẩn - TP. Vinh',
};

/** Số điện thoại dạng gọi được (bỏ dấu chấm, khoảng trắng) */
export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
