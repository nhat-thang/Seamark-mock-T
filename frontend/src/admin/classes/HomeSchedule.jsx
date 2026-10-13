import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../utils/api.js';
import { STATE_LABELS, classStyle, durationText, feeBadge, relativeDay, sessionState, useNow } from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import './classes.css';

/** Nút / nhãn hành động của một buổi dạy trên trang chính (cả dòng đã là liên kết nên ở đây chỉ là chữ) */
function SessionAction({ s, now }) {
  const state = sessionState(s, now);
  if (!s.canOpen) return <span className={`cl-state is-${state}`}>{STATE_LABELS[state]}</span>;
  if (state === 'ready' || state === 'live') {
    return (
      <span className="btn btn-sun btn-small cl-btn-icon">
        <LineIcon name="play" size={18} /> Bắt đầu
      </span>
    );
  }
  if (state === 'missed') return <span className="btn btn-danger btn-small">Điểm danh ngay</span>;
  if (state === 'done') return <span className="cl-state is-done">✓ Đã điểm danh · {s.present}/{s.marked}</span>;
  return <span className="cl-state is-upcoming">còn {durationText(Date.parse(s.startsAt) - now)}</span>;
}

function SessionLine({ s, now, showTeacher = false, showDay = true }) {
  const inner = (
    <>
      <span className="hs-time">
        <strong>{s.startTime}</strong>
        <span>{s.endTime}</span>
      </span>
      <span className="hs-text">
        <strong>{s.className}</strong>
        <span className="muted small-text">
          {showDay && `${relativeDay(s.date)} · `}
          {showTeacher ? s.teacher.name : ''}
          {s.room && `${showTeacher ? ' · ' : ''}${s.room}`}
        </span>
      </span>
      <SessionAction s={s} now={now} />
    </>
  );
  return (
    <div className="hs-line" style={classStyle(s.classColor)}>
      {s.canOpen ? <Link to={`/admin/buoi-hoc/${s.id}`} className="hs-line-link">{inner}</Link> : <div className="hs-line-link">{inner}</div>}
    </div>
  );
}

/**
 * Trang chính: lịch dạy 7 ngày tới của tôi, buổi chưa điểm danh, nhắc học phí,
 * và (admin chính) toàn bộ lịch hôm nay của trung tâm.
 */
export default function HomeSchedule({ admin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const now = useNow(30000);

  useEffect(() => {
    apiGet('/admin/schedule/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="alert-error admin-message">{error}</p>;
  if (!data) return null;
  const isOwner = admin.role === 'owner';

  // Nhóm lịch dạy theo ngày
  const byDay = [];
  for (const s of data.mySessions) {
    const last = byDay.at(-1);
    if (last && last.date === s.date) last.items.push(s);
    else byDay.push({ date: s.date, items: [s] });
  }

  return (
    <div className="hs-grid">
      <div className="hs-col">
        <section className="hs-card">
          <header className="hs-head">
            <h2><LineIcon name="calendar" size={22} /> Lịch dạy của bạn</h2>
            <Link to="/admin/thoi-khoa-bieu" className="btn btn-link small-text">Xem thời khóa biểu</Link>
          </header>
          {byDay.length === 0 && <p className="muted">Bạn không có lịch dạy trong 7 ngày tới.</p>}
          {byDay.map((d) => (
            <div key={d.date} className="hs-day">
              <p className={`hs-day-title ${d.date === data.today ? 'is-today' : ''}`}>{relativeDay(d.date, data.today)}</p>
              {d.items.map((s) => <SessionLine key={s.id} s={s} now={now} showDay={false} />)}
            </div>
          ))}
        </section>

        {data.pending.length > 0 && (
          <section className="hs-card is-warn">
            <header className="hs-head">
              <h2><LineIcon name="alert" size={22} /> Buổi chưa điểm danh</h2>
            </header>
            <p className="muted small-text">
              {isOwner
                ? 'Các buổi đã hết giờ (14 ngày gần đây) mà giáo viên chưa điểm danh. Giáo viên tự điểm danh được tới hết ngày hôm sau.'
                : 'Bấm vào buổi để điểm danh. Bạn điểm danh được tới hết ngày hôm sau ngày học.'}
            </p>
            {data.pending.map((s) => <SessionLine key={s.id} s={s} now={now} showTeacher={isOwner} />)}
          </section>
        )}
      </div>

      <div className="hs-col">
        {isOwner && (
          <section className="hs-card">
            <header className="hs-head">
              <h2><LineIcon name="board" size={22} /> Hôm nay ở trung tâm</h2>
              <span className="muted small-text">{data.todayAll.length} buổi</span>
            </header>
            {data.todayAll.length === 0 && <p className="muted">Hôm nay không có buổi học nào.</p>}
            {data.todayAll.map((s) => <SessionLine key={s.id} s={s} now={now} showTeacher showDay={false} />)}
          </section>
        )}

        <section className="hs-card">
          <header className="hs-head">
            <h2><LineIcon name="money" size={22} /> Nhắc học phí</h2>
            {data.feeReminders.length > 0 && <span className="cl-tab-badge">{data.feeReminders.length}</span>}
          </header>
          {data.feeReminders.length === 0 && <p className="muted">Hiện chưa có học sinh nào tới hạn học phí.</p>}
          <ul className="hs-fee-list">
            {data.feeReminders.map((st) => {
              const badge = feeBadge(st.fee);
              return (
                <li key={st.id}>
                  <Link to={`/admin/lop-hoc/${st.classId}?tab=hoc-phi`} className="hs-fee" style={classStyle(st.classColor)}>
                    <span className="hs-text">
                      <strong>{st.fullName}</strong>
                      <span className="muted small-text">{st.className} · đã học {st.stats.sessions} buổi</span>
                    </span>
                    <span className={`cl-pill is-${badge.tone}`}>{badge.tone === 'due' ? 'Đến hạn' : 'Buổi sau'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
