import { Link } from 'react-router-dom';
import './HomePage.css';

// Trang chủ: chỉ có 2 nút, đặt giữa màn hình.
export default function HomePage() {
  return (
    <main className="home">
      <div className="home-actions">
        <Link to="/bat-dau" className="btn btn-primary btn-large home-start">
          Bắt đầu làm bài
        </Link>
        <Link to="/admin/dang-nhap" className="btn btn-secondary">
          Đăng nhập admin
        </Link>
      </div>
    </main>
  );
}
