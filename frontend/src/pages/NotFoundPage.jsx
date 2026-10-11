import { Link } from 'react-router-dom';
import PageShell from '../components/brand/PageShell.jsx';
import { Emblem } from '../components/brand/SeaArt.jsx';
import './SimplePage.css';

export default function NotFoundPage() {
  return (
    <PageShell title="Không tìm thấy trang" subtitle="Có vẻ chú cá heo đã bơi lạc đường rồi…" narrow>
      <div className="card simple-card">
        <Emblem className="notfound-emblem" alt="" />
        <p className="muted">Địa chỉ bạn mở không tồn tại.</p>
        <Link to="/" className="btn btn-primary">
          Về trang chủ
        </Link>
      </div>
    </PageShell>
  );
}
