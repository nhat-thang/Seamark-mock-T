import { Link } from 'react-router-dom';
import { useAdmin } from './AdminLayout.jsx';

// Trang chính: mọi admin thấy giống nhau; admin chính có thêm khu vực riêng.
export default function AdminHomePage() {
  const admin = useAdmin();

  return (
    <>
      <h1 className="admin-title">Trang chính</h1>
      <p className="admin-intro">
        Chọn một chức năng bên dưới để bắt đầu. Lần đầu dùng? Đọc <Link to="/admin/huong-dan">Hướng dẫn sử dụng</Link>.
      </p>

      <section className="admin-section">
        <h2 className="admin-section-title">Công việc</h2>
        <div className="admin-cards">
          <div className="admin-card">
            <h3>Quản lý đề thi</h3>
            <p>Tạo đề, sửa thông tin đề, ghi chú nội bộ, xem trước và xuất bản đề cho học viên.</p>
            <Link to="/admin/de-thi" className="btn btn-primary btn-small">Mở</Link>
          </div>
          <div className="admin-card">
            <h3>Kết quả làm bài</h3>
            <p>Xem điểm và bài làm của học viên, lọc theo tên, số điện thoại, đề thi, xuất Excel.</p>
            <Link to="/admin/ket-qua" className="btn btn-primary btn-small">Mở</Link>
          </div>
          <div className="admin-card">
            <h3>Đổi mật khẩu</h3>
            <p>Đổi mật khẩu đăng nhập của bạn.</p>
            <Link to="/admin/doi-mat-khau" className="btn btn-secondary btn-small">Mở</Link>
          </div>
        </div>
      </section>

      {admin.role === 'owner' && (
        <section className="admin-section">
          <h2 className="admin-section-title">Dành riêng cho admin chính</h2>
          <div className="admin-cards">
            <div className="admin-card">
              <h3>Tài khoản admin</h3>
              <p>Tạo tài khoản cho giáo viên, vô hiệu hóa tài khoản, đặt lại mật khẩu khi ai đó quên.</p>
              <Link to="/admin/tai-khoan" className="btn btn-primary btn-small">Mở</Link>
            </div>
            <div className="admin-card">
              <h3>Lịch sử chỉnh sửa</h3>
              <p>Xem ai đã thay đổi gì trên web (đề thi, tài liệu, tài khoản) và vào lúc nào.</p>
              <Link to="/admin/lich-su-chinh-sua" className="btn btn-primary btn-small">Mở</Link>
            </div>
            <div className="admin-card">
              <h3>Lịch sử đăng nhập</h3>
              <p>Xem ai đã đăng nhập, lúc nào, từ đâu, và các lần đăng nhập sai.</p>
              <Link to="/admin/lich-su-dang-nhap" className="btn btn-primary btn-small">Mở</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
