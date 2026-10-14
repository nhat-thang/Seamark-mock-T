import { Link } from 'react-router-dom';
import LineIcon from '../components/brand/LineIcon.jsx';
import { Bubbles, DotGrid, Dolphin, Emblem, Sparkle, Waves } from '../components/brand/SeaArt.jsx';
import { useAdmin } from './AdminLayout.jsx';
import HomeSchedule from './classes/HomeSchedule.jsx';

// Các chức năng (mỗi thẻ bấm được cả thẻ). tone: màu ô biểu tượng
const WORK = [
  { to: '/admin/thoi-khoa-bieu', icon: 'calendar', tone: 'sky', title: 'Thời khóa biểu', text: 'Xem lịch dạy của bạn và của cả trung tâm. Bấm vào buổi mình dạy để bắt đầu và điểm danh.' },
  { to: '/admin/lop-hoc', icon: 'board', tone: 'blue', title: 'Lớp học', text: 'Xem lớp mình phụ trách: học sinh, các buổi đã học, điểm danh, điểm cộng, cảnh báo học phí.' },
  { to: '/admin/de-thi', icon: 'exam', tone: 'blue', title: 'Quản lý đề thi', text: 'Tạo đề, sửa thông tin đề, ghi chú nội bộ, xem trước và xuất bản đề cho học viên.' },
  { to: '/admin/ket-qua', icon: 'chart', tone: 'sky', title: 'Kết quả làm bài', text: 'Xem điểm và bài làm của học viên, lọc theo tên, số điện thoại, đề thi, xuất Excel.' },
  { to: '/admin/doi-mat-khau', icon: 'key', tone: 'yellow', title: 'Đổi mật khẩu', text: 'Đổi mật khẩu đăng nhập của bạn.' },
  { to: '/admin/huong-dan', icon: 'help', tone: 'orange', title: 'Hướng dẫn sử dụng', text: 'Cách điểm danh, xếp lịch, thu học phí, soạn đề và xem kết quả — từng bước một.' },
];
const OWNER = [
  { to: '/admin/hoc-phi', icon: 'money', tone: 'navy', title: 'Quản lý học phí', text: 'Học phí từng lớp theo tháng: cần thu, đã thu, còn thiếu; thu tiền, xem lịch sử thu, tải Excel.' },
  { to: '/admin/cham-soc-khach-hang', icon: 'chat', tone: 'navy', title: 'Chăm sóc khách hàng', text: 'Bảng CSKH như Excel: học sinh, phụ huynh, SĐT, ngày chăm sóc, trạng thái chốt, học phí, hẹn gọi lại, ghi chú.' },
  { to: '/admin/tai-khoan', icon: 'users', tone: 'navy', title: 'Tài khoản admin', text: 'Tạo tài khoản cho giáo viên, vô hiệu hóa tài khoản, đặt lại mật khẩu khi ai đó quên.' },
  { to: '/admin/lich-su-chinh-sua', icon: 'history', tone: 'navy', title: 'Lịch sử chỉnh sửa', text: 'Xem ai đã thay đổi gì trên web (đề thi, tài liệu, tài khoản) và vào lúc nào.' },
  { to: '/admin/lich-su-dang-nhap', icon: 'login', tone: 'navy', title: 'Lịch sử đăng nhập', text: 'Xem ai đã đăng nhập, lúc nào, từ đâu, và các lần đăng nhập sai.' },
];

function FeatureCard({ to, icon, tone, title, text }) {
  return (
    <Link to={to} className="admin-card">
      <span className={`admin-card-icon tone-${tone}`}>
        <LineIcon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <span className="admin-card-open">
        Mở <LineIcon name="arrow" size={18} />
      </span>
    </Link>
  );
}

// Trang chính: mọi admin thấy giống nhau; admin chính có thêm khu vực riêng.
export default function AdminHomePage() {
  const admin = useAdmin();

  return (
    <>
      <section className="admin-welcome">
        <Bubbles />
        <DotGrid className="admin-welcome-dots" rows={3} cols={6} />
        <Sparkle className="admin-welcome-spark" size={22} />
        <Dolphin className="admin-welcome-dolphin sea-float" />

        <div className="admin-welcome-text">
          <p className="admin-welcome-hello">Trang chính</p>
          <h1 className="admin-welcome-title">Xin chào, {admin.displayName}!</h1>
          <p className="admin-welcome-intro">
            Hôm nay bạn muốn làm gì? Chọn một việc bên dưới. Lần đầu dùng? Đọc{' '}
            <Link to="/admin/huong-dan">Hướng dẫn sử dụng</Link>.
          </p>
          <div className="admin-welcome-actions">
            <Link to="/admin/thoi-khoa-bieu" className="btn btn-sun">
              <LineIcon name="calendar" size={22} />
              Thời khóa biểu
            </Link>
            <Link to="/admin/lop-hoc" className="btn btn-ghost-light">
              <LineIcon name="board" size={20} />
              Lớp học
            </Link>
            <Link to="/admin/de-thi" className="btn btn-ghost-light">
              <LineIcon name="exam" size={20} />
              Đề thi
            </Link>
          </div>
        </div>
        <Emblem className="admin-welcome-emblem sea-float" alt="" />
        <Waves className="admin-welcome-waves" colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)']} />
      </section>

      <HomeSchedule admin={admin} />

      <section className="admin-section">
        <h2 className="admin-section-title">Công việc</h2>
        <div className="admin-cards">
          {WORK.map((c) => <FeatureCard key={c.to} {...c} />)}
        </div>
      </section>

      {admin.role === 'owner' && (
        <section className="admin-section">
          <h2 className="admin-section-title">Dành riêng cho admin chính</h2>
          <div className="admin-cards">
            {OWNER.map((c) => <FeatureCard key={c.to} {...c} />)}
          </div>
        </section>
      )}
    </>
  );
}
