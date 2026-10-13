import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../utils/api.js';
import { ALERT_LEVELS, STATE_LABELS, alertText, classStyle, durationText, formatDate, formatMoney, relativeDay, sessionState, useNow } from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { ExcelLink, toggleSnooze } from './TuitionBits.jsx';
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

/** Gom cảnh báo theo một khóa, giữ thứ tự (server đã xếp đỏ → cam → vàng) */
function groupBy(items, keyOf) {
  const groups = [];
  const byKey = new Map();
  for (const a of items) {
    const key = keyOf(a);
    if (!byKey.has(key)) {
      const g = { key, first: a, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).items.push(a);
  }
  return groups;
}

/**
 * Cảnh báo học phí trên trang chính. Màu luôn kèm chữ.
 * - Giáo viên: gom theo lớp + mức ("Lớp X — Còn 4 buổi đến hạn đóng: 5 học sinh"), không có số tiền.
 * - Admin chính: gom theo mức trên mọi lớp ("Còn 4 buổi đến hạn đóng: 7 học sinh (3 lớp)"), có tên lớp, học sinh,
 *   số tiền, nút "Tắt cảnh báo"; nhắc lớp chưa xếp đủ lịch / chưa cài học phí.
 */
function TuitionAlerts({ tuition, isOwner, onChanged }) {
  const [open, setOpen] = useState({});
  const [error, setError] = useState('');
  const { items } = tuition;
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  async function snooze(a) {
    try {
      const r = await toggleSnooze({ id: a.studentId, fullName: a.fullName }, a.cycleNo, false);
      if (r) onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const groups = isOwner
    ? groupBy(items, (a) => `${a.level}|${a.kind}|${a.remaining}`)
    : groupBy(items, (a) => `${a.classId}|${a.level}|${a.kind}|${a.remaining}`);

  return (
    <section className="hs-card">
      <header className="hs-head">
        <h2><LineIcon name="money" size={22} /> Cảnh báo học phí</h2>
        {items.length > 0 && <span className="cl-tab-badge">{items.length}</span>}
      </header>
      {error && <p className="alert-error admin-message">{error}</p>}
      {items.length === 0 && <p className="muted">Hiện chưa có học sinh nào cần nhắc học phí.</p>}
      <ul className="tu-groups">
        {groups.map((g) => {
          const a = g.first;
          const classes = new Set(g.items.map((x) => x.classId)).size;
          const title = isOwner
            ? `${alertText(a)}: ${g.items.length} học sinh${classes > 1 ? ` (${classes} lớp)` : ` (lớp ${a.className})`}`
            : `Lớp ${a.className} — ${alertText(a)}: ${g.items.length} học sinh`;
          return (
            <li key={g.key} className={`tu-group is-${a.level}`}>
              <button type="button" className="tu-group-head" aria-expanded={Boolean(open[g.key])} onClick={() => toggle(g.key)}>
                <span className={`tu-alert is-${a.level}`}><span className="tu-dot" aria-hidden="true" />{ALERT_LEVELS[a.level].label}</span>
                <span className="tu-group-title">{title}</span>
                <LineIcon name={open[g.key] ? 'up' : 'down'} size={18} />
              </button>
              {open[g.key] && (
                <ul className="tu-group-list">
                  {g.items.map((x) => (
                    <li key={`${x.studentId}-${x.cycleNo}`}>
                      <Link to={`/admin/lop-hoc/${x.classId}?tab=${isOwner ? 'hoc-phi' : 'hoc-sinh'}`} className="tu-group-name" style={classStyle(x.classColor)}>
                        <strong>{x.fullName}</strong>
                        <span className="muted small-text">{x.className} · kì {x.cycleNo}{x.dueDate && ` · hạn ${formatDate(x.dueDate)}`}</span>
                      </Link>
                      {isOwner && <strong className="tu-money">{formatMoney(x.amount)}</strong>}
                      {isOwner && (
                        <button type="button" className="btn btn-link btn-small" onClick={() => snooze(x)}>Tắt cảnh báo</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && tuition.gaps?.length > 0 && (
        <div className="tu-gaps">
          <p><strong>Lớp chưa xếp đủ lịch để thu học phí:</strong></p>
          <ul>
            {tuition.gaps.map((g) => (
              <li key={g.classId}>
                <Link to={`/admin/lop-hoc/${g.classId}?tab=lich-hoc`}>Lớp {g.className}</Link> mới xếp {g.scheduled}/{g.needed} buổi của kì {g.cycleNo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOwner && tuition.unconfigured?.length > 0 && (
        <p className="muted small-text">
          Chưa cài học phí: {tuition.unconfigured.map((c, i) => (
            <span key={c.classId}>{i > 0 && ', '}<Link to={`/admin/lop-hoc/${c.classId}?tab=hoc-phi`}>{c.className}</Link> ({c.students} HS)</span>
          ))}
        </p>
      )}
      <div className="tu-card-foot">
        {items.length > 0 && <ExcelLink small href="/admin/schedule/alerts/export">Tải danh sách cảnh báo (Excel)</ExcelLink>}
        {isOwner && <Link to="/admin/hoc-phi" className="btn btn-link small-text">Mở Quản lý học phí</Link>}
      </div>
    </section>
  );
}

/**
 * Trang chính: ngày hôm nay, lịch dạy 7 ngày tới của tôi, buổi chưa điểm danh, cảnh báo học phí,
 * và (admin chính) toàn bộ lịch hôm nay của trung tâm.
 */
export default function HomeSchedule({ admin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const now = useNow(30000);

  const load = useCallback(() => {
    apiGet('/admin/schedule/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

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
    <>
    <p className="hs-today"><LineIcon name="calendar" size={20} /> Hôm nay: <strong>{data.todayLabel}</strong></p>
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

        <TuitionAlerts tuition={data.tuition} isOwner={isOwner} onChanged={load} />
      </div>
    </div>
    </>
  );
}
