import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../utils/api.js';
import {
  STATE_LABELS,
  WEEKDAY_LONG,
  addDays,
  classStyle,
  formatDate,
  formatDay,
  mondayOf,
  sessionState,
  useNow,
  vnToday,
} from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import SessionDialog from './SessionDialog.jsx';

const VIEW_KEY = 'tkb-view'; // nhớ lựa chọn "Tất cả / Của tôi" trên máy này

function readView(fallback) {
  try {
    return localStorage.getItem(VIEW_KEY) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Một buổi học trên lưới. Admin chính bấm vào mọi buổi (xem chi tiết + tình hình điểm danh).
 * Giáo viên bấm được buổi mình dạy và buổi của lớp mình phụ trách; buổi khác chỉ xem.
 */
export function SessionCard({ s, now, showClass = true }) {
  const state = sessionState(s, now);
  const mine = s.teacher.isMine;
  const others = s.teacher.list.length > 1 || s.teacher.otherName;
  const content = (
    <>
      <span className="cl-card-time">{s.startTime}–{s.endTime}</span>
      {showClass && <span className="cl-card-class">{s.className}</span>}
      <span className="cl-card-line">
        <LineIcon name="user" size={14} />
        <span>
          {mine ? <strong>{others ? `Bạn + ${s.teacher.list.length - 1 + (s.teacher.otherName ? 1 : 0)} GV` : 'Bạn dạy'}</strong> : s.teacher.name || '—'}
          {s.teacher.isOther && <span className="cl-card-other"> (GV ngoài)</span>}
        </span>
      </span>
      {s.room && <span className="cl-card-line"><LineIcon name="pin" size={14} /><span>{s.room}</span></span>}
      <span className={`cl-state is-${state}`}>
        {state === 'done' ? `✓ ${s.present}/${s.marked} có mặt` : STATE_LABELS[state]}
      </span>
    </>
  );
  const cls = `cl-card is-${state} ${mine ? 'is-mine' : ''}`;
  if (s.canOpen) {
    return <Link to={`/admin/buoi-hoc/${s.id}`} className={cls} style={classStyle(s.classColor)}>{content}</Link>;
  }
  return (
    <div className={`${cls} is-locked`} style={classStyle(s.classColor)} title={`Buổi của ${s.teacher.name || 'giáo viên khác'}. Bạn chỉ mở được buổi mình dạy hoặc của lớp mình phụ trách.`}>
      {content}
    </div>
  );
}

/**
 * Thời khóa biểu một tuần (Thứ 2 → Chủ nhật), chuyển tuần trước / sau tùy ý.
 * classId: chỉ xem một lớp (trang lớp học). Admin chính có nút xếp lịch.
 */
export default function WeekSchedule({ admin, classId = null, initialDate = null }) {
  const isOwner = admin.role === 'owner';
  const today = vnToday();
  const [weekStart, setWeekStart] = useState(mondayOf(initialDate || today));
  const [view, setView] = useState(() => (classId ? 'all' : readView(isOwner ? 'all' : 'mine')));
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null); // { date } khi đang xếp lịch
  const [refresh, setRefresh] = useState(0);
  const now = useNow(30000);

  // Trang thông báo dẫn tới ?ngay=... -> nhảy tới tuần đó
  useEffect(() => {
    if (initialDate) setWeekStart(mondayOf(initialDate));
  }, [initialDate]);

  useEffect(() => {
    if (!classId) apiGet('/admin/classes').then((d) => setClasses(d.classes)).catch(() => {});
    if (isOwner) apiGet('/admin/schedule/teachers').then((d) => setTeachers(d.teachers)).catch(() => {});
  }, [classId, isOwner]);

  useEffect(() => {
    const params = new URLSearchParams({ from: weekStart, to: addDays(weekStart, 6) });
    const cid = classId || classFilter;
    if (cid) params.set('classId', cid);
    if (view === 'mine') params.set('mine', '1');
    else if (teacherFilter) params.set('teacherId', teacherFilter);
    let cancelled = false;
    setError('');
    apiGet(`/admin/schedule?${params}`)
      .then((d) => !cancelled && setSessions(d.sessions))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [weekStart, view, classFilter, teacherFilter, classId, refresh]);

  function chooseView(v) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Trình duyệt chặn lưu: lần sau mở lại dùng mặc định
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isThisWeek = weekStart === mondayOf(today);
  const total = sessions?.length ?? 0;
  const mineCount = sessions ? sessions.filter((s) => s.teacher.isMine).length : 0;

  return (
    <div className="cl-week">
      <div className="cl-week-toolbar">
        <div className="cl-week-nav">
          <button type="button" className="cl-icon-btn is-boxed" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước">
            <LineIcon name="left" size={22} />
          </button>
          <div className="cl-week-title">
            <strong>{formatDay(weekStart)} – {formatDate(addDays(weekStart, 6))}</strong>
            <span className="muted small-text">{isThisWeek ? 'Tuần này' : `${total} buổi học`}</span>
          </div>
          <button type="button" className="cl-icon-btn is-boxed" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau">
            <LineIcon name="right" size={22} />
          </button>
          {!isThisWeek && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setWeekStart(mondayOf(today))}>Về tuần này</button>
          )}
          <label className="cl-week-jump">
            <span className="small-text muted">Đi tới ngày</span>
            <input type="date" className="input" value="" onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))} />
          </label>
        </div>
        {isOwner && (
          <button type="button" className="btn btn-sun cl-btn-icon" onClick={() => setDialog({ date: isThisWeek ? today : weekStart })}>
            <LineIcon name="plus" size={20} /> Xếp lịch học
          </button>
        )}
      </div>

      <div className="cl-week-filters">
        {!classId && (
          <div className="cl-seg" role="tablist" aria-label="Xem lịch">
            <button type="button" role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'is-on' : ''} onClick={() => chooseView('all')}>
              Tất cả các lớp
            </button>
            <button type="button" role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'is-on' : ''} onClick={() => chooseView('mine')}>
              Lịch dạy của tôi
            </button>
          </div>
        )}
        {!classId && (
          <select className="input cl-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Lọc theo lớp">
            <option value="">Mọi lớp</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {isOwner && view === 'all' && (
          <select className="input cl-filter" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} aria-label="Lọc theo giáo viên">
            <option value="">Mọi giáo viên</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            <option value="other">Giáo viên ngoài</option>
          </select>
        )}
        {view === 'all' && !isOwner && mineCount > 0 && (
          <span className="muted small-text">Tuần này bạn dạy {mineCount} buổi (viền đậm).</span>
        )}
      </div>

      {message && <p className="alert-success admin-message" role="status">{message}</p>}
      {error && <p className="alert-error admin-message">{error}</p>}

      <div className="cl-week-grid">
        {days.map((date, i) => {
          const items = (sessions || []).filter((s) => s.date === date);
          return (
            <section key={date} className={`cl-day ${date === today ? 'is-today' : ''} ${date < today ? 'is-past' : ''}`}>
              <header className="cl-day-head">
                <span className="cl-day-name">{WEEKDAY_LONG[i + 1]}</span>
                <span className="cl-day-date">{formatDay(date)}</span>
                {date === today && <span className="cl-today">Hôm nay</span>}
              </header>
              <div className="cl-day-body">
                {items.map((s) => <SessionCard key={s.id} s={s} now={now} showClass={!classId} />)}
                {sessions && items.length === 0 && <p className="cl-day-empty">Không có buổi học</p>}
                {isOwner && (
                  <button type="button" className="cl-day-add" onClick={() => setDialog({ date })}>
                    <LineIcon name="plus" size={16} /> Thêm buổi
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!sessions && !error && <p className="muted">Đang tải…</p>}
      {!isOwner && (
        <p className="cl-week-hint muted small-text">
          <LineIcon name="lock" size={14} /> Bạn bấm mở được các buổi mình dạy và các buổi của lớp mình phụ trách. Thời khóa biểu do admin chính xếp.
        </p>
      )}

      {dialog && (
        <SessionDialog
          mode="create"
          defaults={{ date: dialog.date, classId }}
          onClose={() => setDialog(null)}
          onSaved={(r) => {
            setDialog(null);
            setMessage(r.count > 1 ? `Đã xếp ${r.count} buổi học.` : 'Đã xếp buổi học.');
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
