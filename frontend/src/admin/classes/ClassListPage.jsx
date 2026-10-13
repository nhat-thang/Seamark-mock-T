import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { classStyle, relativeDay, vnToday } from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { useAdmin } from '../AdminLayout.jsx';
import ClassForm from './ClassForm.jsx';
import './classes.css';

// Danh sách lớp học — mọi admin tạo / mở lớp. Admin chính xem thêm lớp đã xóa để khôi phục.
export default function ClassListPage() {
  const admin = useAdmin();
  const navigate = useNavigate();
  const [classes, setClasses] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setClasses(null);
    apiGet(`/admin/classes${showDeleted ? '?deleted=1' : ''}`)
      .then((d) => setClasses(d.classes))
      .catch((err) => setError(err.message));
  }, [showDeleted]);
  useEffect(load, [load]);

  async function create(form) {
    const r = await apiPost('/admin/classes', form);
    navigate(`/admin/lop-hoc/${r.class.id}`, { state: { message: `Đã tạo lớp "${r.class.name}". Bây giờ hãy thêm học sinh vào lớp.` } });
  }

  async function restore(c) {
    if (!window.confirm(`Khôi phục lớp "${c.name}"?\n\nLớp sẽ hiện lại cùng học sinh, lịch học và điểm danh cũ.`)) return;
    try {
      await apiPost(`/admin/classes/${c.id}/restore`);
      setMessage(`Đã khôi phục lớp "${c.name}".`);
      setShowDeleted(false);
    } catch (err) {
      setError(err.message);
    }
  }

  const today = vnToday();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="admin-title">{showDeleted ? 'Lớp đã xóa' : 'Lớp học'}</h1>
          <p className="admin-intro">
            {showDeleted
              ? 'Các lớp bị xóa vẫn giữ nguyên học sinh, lịch học và điểm danh. Bấm "Khôi phục" để lớp hiện lại.'
              : 'Bấm vào một lớp để thêm học sinh, xem lịch học, điểm danh và nhắc học phí.'}
          </p>
        </div>
        <div className="page-head-actions">
          {admin.role === 'owner' && (
            <button type="button" className="btn btn-secondary" onClick={() => { setShowDeleted((v) => !v); setCreating(false); }}>
              {showDeleted ? 'Quay lại danh sách lớp' : 'Xem lớp đã xóa'}
            </button>
          )}
          {!showDeleted && !creating && (
            <button type="button" className="btn btn-primary cl-btn-icon" onClick={() => setCreating(true)}>
              <LineIcon name="plus" size={20} /> Tạo lớp mới
            </button>
          )}
        </div>
      </div>

      {message && <p className="alert-success admin-message" role="status">{message}</p>}
      {error && <p className="alert-error admin-message">{error}</p>}

      {creating && (
        <section className="card cl-create-card">
          <h2 className="admin-section-title">Tạo lớp mới</h2>
          <ClassForm submitLabel="Tạo lớp" onSubmit={create} onCancel={() => setCreating(false)} />
        </section>
      )}

      {!classes && !error && <p className="muted">Đang tải…</p>}
      {classes && classes.length === 0 && (
        <div className="cl-empty">
          <LineIcon name="board" size={40} />
          <p>{showDeleted ? 'Không có lớp nào bị xóa.' : 'Chưa có lớp nào. Bấm "Tạo lớp mới" để bắt đầu.'}</p>
        </div>
      )}

      <div className="cl-class-grid">
        {(classes || []).map((c) => {
          const body = (
            <>
              <div className="cl-class-band">
                <span className="cl-class-name">{c.name}</span>
                {c.note && <span className="cl-class-note">{c.note}</span>}
              </div>
              <div className="cl-class-body">
                <div className="cl-class-stats">
                  <span><LineIcon name="users" size={18} /> <strong>{c.studentCount}</strong> học sinh</span>
                  <span><LineIcon name="check" size={18} /> <strong>{c.doneSessions}</strong> buổi đã học</span>
                </div>
                {c.nextSession ? (
                  <p className="cl-class-next">
                    <LineIcon name="clock" size={18} />
                    <span>
                      Buổi tới: <strong>{relativeDay(c.nextSession.date, today)} {c.nextSession.startTime}</strong> · {c.nextSession.teacherName}
                    </span>
                  </p>
                ) : (
                  <p className="cl-class-next muted"><LineIcon name="calendar" size={18} /> Chưa có lịch học sắp tới</p>
                )}
                <div className="cl-class-tags">
                  {c.feeDue > 0 && <span className="cl-pill is-due"><LineIcon name="money" size={16} /> {c.feeDue} đến hạn học phí</span>}
                  {c.feeSoon > 0 && <span className="cl-pill is-soon">{c.feeSoon} sắp đến hạn</span>}
                  {!c.feeEvery && <span className="cl-pill">Không nhắc học phí</span>}
                </div>
                {showDeleted && (
                  <div className="cl-class-deleted">
                    <span className="muted small-text">Tạo lúc {formatDateTime(c.createdAt)}</span>
                    <button type="button" className="btn btn-primary btn-small" onClick={() => restore(c)}>Khôi phục</button>
                  </div>
                )}
              </div>
            </>
          );
          return showDeleted ? (
            <div key={c.id} className="cl-class-card is-deleted" style={classStyle(c.color)}>{body}</div>
          ) : (
            <Link key={c.id} to={`/admin/lop-hoc/${c.id}`} className="cl-class-card" style={classStyle(c.color)}>{body}</Link>
          );
        })}
      </div>
    </>
  );
}
