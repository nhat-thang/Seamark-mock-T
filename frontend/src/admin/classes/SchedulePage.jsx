import { useSearchParams } from 'react-router-dom';
import { useAdmin } from '../AdminLayout.jsx';
import WeekSchedule from './WeekSchedule.jsx';
import './classes.css';

// Thời khóa biểu chung của trung tâm. Admin chính xếp lịch; mọi admin xem tất cả hoặc chỉ lịch dạy của mình.
export default function SchedulePage() {
  const admin = useAdmin();
  const [params] = useSearchParams();
  const date = params.get('ngay');

  return (
    <>
      <h1 className="admin-title">Thời khóa biểu</h1>
      <p className="admin-intro">
        {admin.role === 'owner'
          ? 'Bấm "Xếp lịch học" (hoặc "Thêm buổi" ở từng ngày) để xếp lịch cho các lớp. Bấm vào một buổi để sửa, xóa hoặc điểm danh.'
          : 'Bấm vào buổi bạn dạy (viền đậm) để bắt đầu buổi học và điểm danh. Bấm mũi tên để xem tuần trước / tuần sau.'}
      </p>
      <WeekSchedule admin={admin} initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null} />
    </>
  );
}
