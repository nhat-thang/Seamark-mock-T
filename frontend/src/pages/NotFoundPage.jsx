import { Link } from 'react-router-dom';
import './SimplePage.css';

export default function NotFoundPage() {
  return (
    <main className="simple-page">
      <div className="card simple-card">
        <h1>Không tìm thấy trang</h1>
        <p className="muted">Địa chỉ bạn mở không tồn tại.</p>
        <Link to="/" className="btn btn-primary">
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
