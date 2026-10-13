import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { AUDIT_ACTION_LABELS, formatDateTime } from '../../utils/format.js';
import {
  STATE_LABELS,
  classStyle,
  describeDate,
  formatMoney,
  sessionState,
  useNow,
} from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { useAdmin } from '../AdminLayout.jsx';
import { useHistory } from '../useHistory.js';
import Pagination from '../Pagination.jsx';
import ClassForm from './ClassForm.jsx';
import ClassTuitionTab from './ClassTuitionTab.jsx';
import Modal from './Modal.jsx';
import StudentsTab from './StudentsTab.jsx';
import WeekSchedule from './WeekSchedule.jsx';
import './classes.css';

const TABS = [
  { key: 'hoc-sinh', icon: 'users', label: 'Học sinh' },
  { key: 'lich-hoc', icon: 'calendar', label: 'Lịch học' },
  { key: 'buoi-hoc', icon: 'check', label: 'Các buổi học' },
  { key: 'hoc-phi', icon: 'money', label: 'Học phí', ownerOnly: true },
  { key: 'lich-su', icon: 'history', label: 'Lịch sử thay đổi', ownerOnly: true },
];

// Chi tiết một lớp: học sinh, lịch học riêng của lớp, các buổi học, học phí + lịch sử (chỉ admin chính).
// Giáo viên phụ trách chỉ xem (server lọc bỏ thông tin phụ huynh, số tiền); chỉ admin chính sửa / xóa lớp.
export default function ClassDetailPage() {
  const { id } = useParams();
  const admin = useAdmin();
  const navigate = useNavigate();
  const navMessage = useLocation().state?.message;
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const isOwner = admin.role === 'owner';
  const tabs = TABS.filter((t) => !t.ownerOnly || isOwner);
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'hoc-sinh';

  const load = useCallback(() => {
    apiGet(`/admin/classes/${id}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);

  if (error && !data) {
    return (
      <>
        <p className="alert-error">{error}</p>
        <Link to="/admin/lop-hoc" className="btn btn-secondary">Về danh sách lớp</Link>
      </>
    );
  }
  if (!data) return <p className="muted">Đang tải…</p>;
  const cls = data.class;

  async function removeClass() {
    const ok = window.confirm(
      `Xóa lớp "${cls.name}"?\n\nLớp sẽ bị ẩn khỏi danh sách và thời khóa biểu. ` +
        'Học sinh, lịch học và điểm danh vẫn được giữ lại; admin chính có thể khôi phục lớp.'
    );
    if (!ok) return;
    try {
      await apiPost(`/admin/classes/${cls.id}/delete`);
      navigate('/admin/lop-hoc', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore() {
    try {
      await apiPost(`/admin/classes/${cls.id}/restore`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const activeCount = data.students.filter((s) => s.isActive).length;
  const alertCount = data.students.filter((s) => s.isActive && s.tuition?.alert).length;

  return (
    <>
      <p className="breadcrumb"><Link to="/admin/lop-hoc">Lớp học</Link> › {cls.name}</p>

      <section className="cl-hero" style={classStyle(cls.color)}>
        <div className="cl-hero-text">
          <h1>{cls.name}</h1>
          {cls.note && <p className="cl-hero-note">{cls.note}</p>}
          <div className="cl-hero-stats">
            <span><LineIcon name="users" size={18} /> {activeCount} học sinh</span>
            <span><LineIcon name="check" size={18} /> {cls.doneSessions} buổi đã học</span>
            <span><LineIcon name="calendar" size={18} /> {cls.upcomingSessions} buổi sắp tới</span>
            {isOwner && (
              <span>
                <LineIcon name="money" size={18} />{' '}
                {cls.tuitionConfigured ? `${formatMoney(cls.pricePerSession)}/buổi · kì ${cls.cycleSessions} buổi` : 'Chưa cài học phí'}
              </span>
            )}
          </div>
          <p className="cl-hero-note">
            <LineIcon name="user" size={16} /> Giáo viên phụ trách: {cls.teachers.length ? cls.teachers.map((t) => t.name).join(', ') : 'chưa có'}
          </p>
        </div>
        {isOwner && !cls.deletedAt && (
          <div className="cl-hero-actions">
            <button type="button" className="btn btn-ghost-light btn-small" onClick={() => setEditing(true)}>
              <LineIcon name="edit" size={18} /> Sửa thông tin lớp
            </button>
            <button type="button" className="btn btn-ghost-light btn-small" onClick={removeClass}>
              <LineIcon name="trash" size={18} /> Xóa lớp
            </button>
          </div>
        )}
      </section>

      {navMessage && <p className="alert-success admin-message" role="status">{navMessage}</p>}
      {error && <p className="alert-error admin-message">{error}</p>}

      {cls.deletedAt ? (
        <div className="cl-deleted-banner">
          <p>Lớp này đã bị xóa lúc {formatDateTime(cls.deletedAt)}. Khôi phục để xem và dùng lại lớp.</p>
          <button type="button" className="btn btn-primary" onClick={restore}>Khôi phục lớp</button>
        </div>
      ) : (
        <>
          <nav className="cl-tabs" role="tablist" aria-label="Các mục của lớp">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`cl-tab ${tab === t.key ? 'is-on' : ''}`}
                onClick={() => setParams({ tab: t.key }, { replace: true })}
              >
                <LineIcon name={t.icon} size={18} />
                {t.label}
                {t.key === 'hoc-sinh' && alertCount > 0 && <span className="cl-tab-badge" title="Học sinh có cảnh báo học phí">{alertCount}</span>}
              </button>
            ))}
          </nav>

          <div className="cl-tab-panel">
            {tab === 'hoc-sinh' && <StudentsTab cls={cls} students={data.students} onChanged={load} isOwner={isOwner} />}
            {tab === 'lich-hoc' && <WeekSchedule admin={admin} classId={cls.id} />}
            {tab === 'buoi-hoc' && <SessionsTab cls={cls} admin={admin} />}
            {tab === 'hoc-phi' && <ClassTuitionTab cls={cls} students={data.students} onChanged={load} onEditClass={() => setEditing(true)} />}
            {tab === 'lich-su' && <ClassHistory cls={cls} />}
          </div>
        </>
      )}

      {editing && (
        <Modal title="Sửa thông tin lớp" onClose={() => setEditing(false)}>
          <ClassForm
            initial={cls}
            submitLabel="Lưu thay đổi"
            onCancel={() => setEditing(false)}
            onSubmit={async (form) => {
              await apiPost(`/admin/classes/${cls.id}/update`, form);
              setEditing(false);
              load();
            }}
          />
        </Modal>
      )}
    </>
  );
}

/** Mọi buổi học của lớp: sắp tới (gần nhất trước) và đã qua (mới nhất trước) */
function SessionsTab({ cls, admin }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const now = useNow(30000);

  useEffect(() => {
    apiGet(`/admin/classes/${cls.id}/sessions`)
      .then((d) => setSessions(d.sessions))
      .catch((err) => setError(err.message));
  }, [cls.id]);

  if (error) return <p className="alert-error">{error}</p>;
  if (!sessions) return <p className="muted">Đang tải…</p>;
  const upcoming = sessions.filter((s) => Date.parse(s.endsAt) > now && !s.attendanceAt);
  const past = sessions.filter((s) => !upcoming.includes(s)).reverse();
  const shownUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 6);

  const Row = ({ s }) => {
    const state = sessionState(s, now);
    const body = (
      <>
        <span className="cl-row-no">Buổi {s.no}</span>
        <span className="cl-row-date">{describeDate(s.date)}</span>
        <span className="cl-row-time">{s.startTime}–{s.endTime}</span>
        <span className="cl-row-teacher"><LineIcon name="user" size={16} /> {s.teacher.isMine ? 'Bạn' : s.teacher.name || '—'}</span>
        <span className={`cl-state is-${state}`}>
          {STATE_LABELS[state]}{state === 'done' && ` · ${s.present}/${s.marked} có mặt`}
        </span>
        {s.canOpen && <LineIcon name="right" size={18} />}
      </>
    );
    return s.canOpen ? (
      <Link to={`/admin/buoi-hoc/${s.id}`} className="cl-row">{body}</Link>
    ) : (
      <div className="cl-row is-locked">{body}</div>
    );
  };

  return (
    <div className="cl-sessions">
      <h3 className="cl-subtitle">Sắp tới ({upcoming.length})</h3>
      {upcoming.length === 0 ? (
        <p className="muted">Chưa có lịch học sắp tới. {admin.role === 'owner' ? 'Xếp lịch ở tab "Lịch học".' : 'Admin chính sẽ xếp lịch.'}</p>
      ) : (
        <div className="cl-rows">{shownUpcoming.map((s) => <Row key={s.id} s={s} />)}</div>
      )}
      {upcoming.length > 6 && (
        <button type="button" className="btn btn-link" onClick={() => setShowAllUpcoming((v) => !v)}>
          {showAllUpcoming ? 'Thu gọn' : `Xem cả ${upcoming.length} buổi sắp tới`}
        </button>
      )}

      <h3 className="cl-subtitle">Đã qua ({past.length})</h3>
      {past.length === 0 ? <p className="muted">Chưa có buổi nào.</p> : <div className="cl-rows">{past.map((s) => <Row key={s.id} s={s} />)}</div>}
    </div>
  );
}

/** Lịch sử mọi thao tác trên lớp (thêm / sửa / xóa học sinh, xếp lịch, điểm danh, học phí) — admin chính */
function ClassHistory({ cls }) {
  const [page, setPage] = useState(1);
  const history = useHistory('/admin/history/audit', { classId: String(cls.id) }, page);

  return (
    <>
      <p className="muted">Ai đã làm gì với lớp này và vào lúc nào — gồm cả từng lần điểm danh và sửa điểm danh.</p>
      {history.error && <p className="alert-error admin-message">{history.error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Thao tác</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((item) => (
              <tr key={item.id}>
                <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                <td>{item.admin ? item.admin.displayName : <span className="muted">(không rõ)</span>}</td>
                <td><span className="tag tag-info">{AUDIT_ACTION_LABELS[item.action] || item.action}</span></td>
                <td>{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.loading && history.items.length === 0 && <p className="table-empty">Chưa có lịch sử nào.</p>}
        {history.loading && <p className="table-empty">Đang tải…</p>}
      </div>
      <Pagination page={history.page} totalPages={history.totalPages} onChange={setPage} />
    </>
  );
}
