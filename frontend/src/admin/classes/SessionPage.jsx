import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import {
  ALERT_LEVELS,
  ATTENDANCE,
  STATE_LABELS,
  classStyle,
  describeDate,
  durationText,
  formatDate,
  relativeDay,
  sessionState,
  useNow,
  vnTimeOf,
  vnToday,
} from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import Modal from './Modal.jsx';
import SessionDialog, { ConfirmBox } from './SessionDialog.jsx';
import StudentsTab from './StudentsTab.jsx';
import { AlertBadge } from './TuitionBits.jsx';
import './classes.css';

const MAX_BONUS = 50;
const AVATAR_COLORS = ['#2f6fe0', '#12998f', '#ec6a35', '#8358e8', '#d94585', '#3a9d4f', '#1f9bd4', '#d69a00'];

// Điểm danh đang tích dở được giữ trên máy này (lỡ tải lại trang / bấm sang trang khác vẫn không mất)
const draftKey = (id) => `diem-danh-nhap-${id}`;
function readDraft(id) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) || 'null');
  } catch {
    return null;
  }
}
function writeDraft(id, value) {
  try {
    if (value) localStorage.setItem(draftKey(id), JSON.stringify(value));
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Trình duyệt chặn lưu: bỏ qua, vẫn còn cảnh báo khi rời trang
  }
}

/** Chữ cái đầu của tên (tên tiếng Việt: chữ cuối cùng) + màu cố định theo tên */
function avatarOf(name) {
  const last = name.trim().split(/\s+/).at(-1) || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { letter: last[0].toUpperCase(), color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}

/** Điểm danh đã lưu trên server -> { [id học sinh]: { status, bonus } } */
const marksOf = (students) =>
  Object.fromEntries(students.map((s) => [s.id, { status: s.attendance?.status ?? null, bonus: s.attendance?.bonus ?? 0 }]));

const sameMarks = (a, b) =>
  Object.keys(a).every((id) => b[id] && a[id].status === b[id].status && a[id].bonus === b[id].bonus);

/** Ngày cuối cùng giáo viên còn sửa được điểm danh (editUntil = 0 giờ ngày kế tiếp, giờ VN) */
const lastEditDay = (s) => formatDate(vnToday(Date.parse(s.editUntil) - 1));

/** Học sinh có cảnh báo học phí, theo mức (đỏ trước) */
const alertsOf = (students) =>
  students.filter((st) => st.isActive && st.tuition?.alert).sort((a, b) => ALERT_LEVELS[a.tuition.alert.level].rank - ALERT_LEVELS[b.tuition.alert.level].rank);

/**
 * Trang một buổi học: giáo viên bấm "Bắt đầu" (từ 30 phút trước giờ học) rồi điểm danh, cộng điểm.
 * Cạnh tên học sinh: số buổi đã học + nhãn cảnh báo học phí (giáo viên không thấy số tiền).
 * Admin chính: xem trước danh sách + tình hình điểm danh bất cứ lúc nào, sửa / xóa buổi (buổi đã điểm danh
 * không xóa / không đổi giờ được), thêm học sinh, sửa điểm danh bất cứ lúc nào.
 */
export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useNow(15000);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [marks, setMarks] = useState({}); // đang tích trên màn hình
  const [saved, setSaved] = useState({}); // đã lưu trên server
  const [tab, setTab] = useState('diem-danh');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'

  /** Nhận dữ liệu mới từ server. keepDraft: giữ các ô đang tích (ví dụ sau khi thêm học sinh). */
  const apply = useCallback((d, { keepDraft = false } = {}) => {
    const server = marksOf(d.students);
    setData(d);
    setSaved(server);
    if (keepDraft) {
      setMarks((current) => Object.fromEntries(d.students.map((s) => [s.id, current[s.id] ?? server[s.id]])));
      return;
    }
    // Mở trang: khôi phục điểm danh đang tích dở (nếu có) cho các học sinh vẫn còn trong danh sách
    const draft = readDraft(d.session.id);
    const merged = draft ? Object.fromEntries(d.students.map((s) => [s.id, draft[s.id] ?? server[s.id]])) : server;
    if (draft && !sameMarks(merged, server)) {
      setNotice({ type: 'info', text: 'Đã khôi phục các ô bạn tích lần trước nhưng chưa bấm "Lưu điểm danh". Kiểm tra lại rồi bấm lưu.' });
    }
    setMarks(merged);
  }, []);

  const load = useCallback(
    (opts) =>
      apiGet(`/admin/schedule/${id}`)
        .then((d) => apply(d, opts))
        .catch((err) => setLoadError(err.message)),
    [id, apply]
  );
  useEffect(() => {
    load();
  }, [load]);

  const dirty = data ? !sameMarks(marks, saved) : false;

  // Giữ bản nháp trên máy + cảnh báo khi đóng trang lúc còn thay đổi chưa lưu
  useEffect(() => {
    if (!data) return undefined;
    writeDraft(data.session.id, dirty ? marks : null);
    if (!dirty) return undefined;
    const onLeave = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [data, marks, dirty]);

  if (loadError) {
    return (
      <div className="cl-blocked">
        <LineIcon name="lock" size={40} />
        <p>{loadError}</p>
        <Link to="/admin/thoi-khoa-bieu" className="btn btn-secondary">Về thời khóa biểu</Link>
      </div>
    );
  }
  if (!data) return <p className="muted">Đang tải…</p>;

  const { session: s, permissions: perm, students } = data;
  const isOwner = perm.isOwner;
  const startFrom = Date.parse(s.startFrom);
  const editUntil = Date.parse(s.editUntil);
  // Tính lại theo đồng hồ (trang để mở lâu thì nút "Bắt đầu" tự sáng lên đúng giờ)
  const canEditNow = now >= startFrom && (isOwner || now < editUntil);
  const started = Boolean(s.startedAt || s.attendanceAt);
  const state = sessionState(s, now);

  const counts = { unmarked: 0, present: 0, late: 0, excused: 0, absent: 0 };
  for (const st of students) counts[marks[st.id]?.status || 'unmarked'] += 1;

  const setMark = (sid, patch) => setMarks((m) => ({ ...m, [sid]: { ...m[sid], ...patch } }));
  const allPresent = () =>
    setMarks((m) => Object.fromEntries(Object.entries(m).map(([sid, v]) => [sid, v.status ? v : { ...v, status: 'present' }])));

  async function start() {
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      apply(await apiPost(`/admin/schedule/${s.id}/start`), { keepDraft: true });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    let records = marks;
    const unmarked = students.filter((st) => !marks[st.id]?.status);
    if (unmarked.length) {
      const names = unmarked.slice(0, 8).map((st) => st.fullName).join(', ') + (unmarked.length > 8 ? '…' : '');
      const ok = window.confirm(
        `Còn ${unmarked.length} học sinh chưa điểm danh: ${names}.\n\n` +
          'Bấm OK để ghi các bạn này là "Vắng không phép" rồi lưu.\nBấm Hủy để quay lại điểm danh tiếp.'
      );
      if (!ok) {
        setTab('diem-danh');
        return;
      }
      records = { ...marks };
      for (const st of unmarked) records[st.id] = { ...records[st.id], status: 'absent' };
      setMarks(records);
    }
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      const d = await apiPost(`/admin/schedule/${s.id}/attendance`, {
        records: students.map((st) => ({ studentId: st.id, status: records[st.id].status, bonus: records[st.id].bonus })),
      });
      writeDraft(s.id, null);
      apply(d);
      const warn = alertsOf(d.students).length;
      setNotice({
        type: 'success',
        text:
          `Đã lưu điểm danh lúc ${vnTimeOf(new Date().toISOString())}.` +
          (warn ? ` Có ${warn} học sinh cần nhắc học phí (xem khung bên dưới).` : ''),
      });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const alerts = alertsOf(students);

  return (
    <div className={`cl-session ${started ? 'has-savebar' : ''}`}>
      <p className="breadcrumb">
        <Link to={`/admin/thoi-khoa-bieu?ngay=${s.date}`}>Thời khóa biểu</Link> ›{' '}
        <Link to={`/admin/lop-hoc/${s.classId}`}>{s.className}</Link> › Buổi {s.no} · {formatDate(s.date)}
      </p>

      <section className="cl-hero cl-session-hero" style={classStyle(s.classColor)}>
        <div className="cl-hero-text">
          <span className={`cl-state is-${state} is-hero`}>{STATE_LABELS[state]}</span>
          <h1>{s.className} <span className="cl-session-no">Buổi {s.no}/{s.totalSessions}</span></h1>
          <p className="cl-session-when">
            <LineIcon name="calendar" size={22} /> {describeDate(s.date)}
            <span className="cl-session-time"><LineIcon name="clock" size={22} /> {s.startTime} – {s.endTime}</span>
          </p>
          <div className="cl-hero-stats">
            <span>
              <LineIcon name="user" size={18} /> {s.teacher.isMine ? (s.teacher.list.length > 1 ? `Bạn dạy cùng ${s.teacher.name}` : 'Bạn dạy') : s.teacher.name || '—'}
              {s.teacher.isOther && ' (giáo viên ngoài)'}
            </span>
            {s.room && <span><LineIcon name="pin" size={18} /> {s.room}</span>}
            <span><LineIcon name="users" size={18} /> {students.length} học sinh</span>
          </div>
          {s.note && <p className="cl-hero-note">Ghi chú: {s.note}</p>}
        </div>
        <div className="cl-hero-actions">
          {isOwner && (
            <>
              <button type="button" className="btn btn-ghost-light btn-small" onClick={() => setDialog('edit')}>
                <LineIcon name="edit" size={18} /> {perm.locked ? 'Đổi giáo viên / phòng' : 'Sửa lịch'}
              </button>
              <button
                type="button"
                className="btn btn-ghost-light btn-small"
                disabled={perm.locked}
                title={perm.locked ? 'Buổi đã điểm danh nên không xóa được' : undefined}
                onClick={() => setDialog('delete')}
              >
                <LineIcon name="trash" size={18} /> Xóa buổi
              </button>
            </>
          )}
          <a className="btn btn-ghost-light btn-small" href={`/api/admin/schedule/${s.id}/export`} download>
            <LineIcon name="download" size={18} /> Tải Excel buổi này
          </a>
        </div>
      </section>

      {notice.text && (
        <p className={`admin-message ${notice.type === 'error' ? 'alert-error' : notice.type === 'info' ? 'cl-alert-info' : 'alert-success'}`} role="status">
          {notice.text}
        </p>
      )}

      {!started ? (
        <>
          <StartCard s={s} isOwner={isOwner} now={now} canStart={canEditNow} busy={busy} onStart={start} />
          <RosterPreview students={students} alerts={alerts} />
        </>
      ) : (
        <>
          {!canEditNow && (
            <p className="cl-alert-warn">
              <LineIcon name="lock" size={20} />
              {isOwner
                ? 'Chưa tới giờ học nên chưa sửa được điểm danh.'
                : `Đã hết hạn sửa điểm danh (hết ngày ${lastEditDay(s)}). Cần sửa thì nhờ admin chính.`}
            </p>
          )}
          {s.attendanceAt && (
            <p className="cl-saved-info muted small-text">
              Điểm danh lần đầu lúc {formatDateTime(s.attendanceAt)}{s.attendanceBy && ` bởi ${s.attendanceBy}`}
              {s.startedAt && ` · bấm "Bắt đầu" lúc ${formatDateTime(s.startedAt)}${s.startedBy ? ` (${s.startedBy})` : ''}`}
            </p>
          )}

          <nav className="cl-tabs cl-tabs-big" role="tablist" aria-label="Buổi học">
            <button type="button" role="tab" aria-selected={tab === 'diem-danh'} className={`cl-tab ${tab === 'diem-danh' ? 'is-on' : ''}`} onClick={() => setTab('diem-danh')}>
              <LineIcon name="check" size={20} /> Điểm danh
              {counts.unmarked > 0 && <span className="cl-tab-badge">{counts.unmarked}</span>}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'diem-cong'} className={`cl-tab ${tab === 'diem-cong' ? 'is-on' : ''}`} onClick={() => setTab('diem-cong')}>
              <LineIcon name="star" size={20} /> Điểm cộng
            </button>
            {isOwner && (
              <button type="button" role="tab" aria-selected={tab === 'hoc-sinh'} className={`cl-tab ${tab === 'hoc-sinh' ? 'is-on' : ''}`} onClick={() => setTab('hoc-sinh')}>
                <LineIcon name="users" size={20} /> Học sinh ({students.length})
              </button>
            )}
          </nav>

          {tab !== 'hoc-sinh' && students.length === 0 && (
            <div className="cl-empty">
              <LineIcon name="users" size={40} />
              <p>{isOwner ? 'Buổi này chưa có học sinh nào. Thêm học sinh ở tab "Học sinh".' : 'Buổi này chưa có học sinh nào. Admin chính sẽ thêm học sinh vào lớp.'}</p>
              {isOwner && <button type="button" className="btn btn-primary" onClick={() => setTab('hoc-sinh')}>Thêm học sinh</button>}
            </div>
          )}

          {tab === 'diem-danh' && students.length > 0 && (
            <>
              <div className="cl-att-toolbar">
                <div className="cl-att-counts">
                  <span className="cl-count is-present">Có mặt {counts.present}</span>
                  <span className="cl-count is-late">Đi muộn {counts.late}</span>
                  <span className="cl-count is-excused">Vắng có phép {counts.excused}</span>
                  <span className="cl-count is-absent">Vắng {counts.absent}</span>
                  {counts.unmarked > 0 && <span className="cl-count is-unmarked">Chưa điểm danh {counts.unmarked}</span>}
                </div>
                {canEditNow && counts.unmarked > 0 && (
                  <button type="button" className="btn btn-secondary cl-btn-icon" onClick={allPresent}>
                    <LineIcon name="check" size={20} /> {counts.unmarked === students.length ? 'Cả lớp có mặt' : 'Các bạn còn lại có mặt'}
                  </button>
                )}
              </div>
              {alerts.length > 0 && <FeeReminder alerts={alerts} />}
              <ul className="cl-att-list">
                {students.map((st) => {
                  const m = marks[st.id] || {};
                  const av = avatarOf(st.fullName);
                  return (
                    <li key={st.id} className={`cl-att-row is-${m.status || 'unmarked'}`}>
                      <span className="cl-avatar" style={{ background: av.color }} aria-hidden="true">{av.letter}</span>
                      <div className="cl-att-name">
                        <strong>{st.fullName}</strong>
                        <span className="cl-att-done">đã học {st.tuition?.sessionsDone ?? 0} buổi</span>
                        {st.tuition?.alert && <AlertBadge alert={st.tuition.alert} short />}
                        {!st.isActive && <span className="cl-pill">Đã nghỉ học</span>}
                        {st.note && <span className="muted small-text">{st.note}</span>}
                      </div>
                      <div className="cl-att-btns" role="radiogroup" aria-label={`Điểm danh ${st.fullName}`}>
                        {ATTENDANCE.map((a) => (
                          <button
                            key={a.key}
                            type="button"
                            role="radio"
                            aria-checked={m.status === a.key}
                            disabled={!canEditNow}
                            className={`cl-att-btn is-${a.key} ${m.status === a.key ? 'is-on' : ''}`}
                            onClick={() => setMark(st.id, { status: a.key })}
                          >
                            {m.status === a.key && <LineIcon name="check" size={16} />}
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'diem-cong' && students.length > 0 && (
            <>
              <p className="muted">Bấm <strong>+</strong> mỗi khi học sinh trả lời tốt, làm bài tốt. Nhớ bấm "Lưu điểm danh" ở cuối trang.</p>
              <ul className="cl-bonus-list">
                {students.map((st) => {
                  const m = marks[st.id] || { bonus: 0 };
                  const av = avatarOf(st.fullName);
                  // Tổng cả lớp = tổng đã lưu - điểm buổi này đã lưu + điểm buổi này đang chỉnh
                  const total = st.stats.bonus - (saved[st.id]?.bonus || 0) + (m.bonus || 0);
                  return (
                    <li key={st.id} className="cl-bonus-row">
                      <span className="cl-avatar" style={{ background: av.color }} aria-hidden="true">{av.letter}</span>
                      <div className="cl-att-name">
                        <strong>{st.fullName}</strong>
                        <span className="muted small-text">Tổng điểm cộng trong lớp: {total}</span>
                      </div>
                      <div className="cl-stepper">
                        <button type="button" aria-label={`Bớt 1 điểm của ${st.fullName}`} disabled={!canEditNow || !m.bonus} onClick={() => setMark(st.id, { bonus: Math.max(0, (m.bonus || 0) - 1) })}>
                          <LineIcon name="minus" size={22} />
                        </button>
                        <span className={`cl-stepper-value ${m.bonus ? 'has-value' : ''}`} aria-live="polite">
                          <LineIcon name="star" size={18} /> {m.bonus || 0}
                        </span>
                        <button type="button" aria-label={`Cộng 1 điểm cho ${st.fullName}`} disabled={!canEditNow || (m.bonus || 0) >= MAX_BONUS} onClick={() => setMark(st.id, { bonus: (m.bonus || 0) + 1 })}>
                          <LineIcon name="plus" size={22} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === 'hoc-sinh' && isOwner && <SessionStudents classId={s.classId} sessionId={s.id} onChanged={() => load({ keepDraft: true })} />}

          {canEditNow && tab !== 'hoc-sinh' && students.length > 0 && (
            <div className="cl-savebar">
              <span className={`cl-savebar-text ${dirty || counts.unmarked ? 'is-warn' : ''}`}>
                {counts.unmarked > 0
                  ? `Còn ${counts.unmarked} học sinh chưa điểm danh`
                  : dirty
                    ? 'Có thay đổi chưa lưu'
                    : s.attendanceAt
                      ? '✓ Đã lưu điểm danh'
                      : 'Đã điểm danh đủ, bấm lưu'}
              </span>
              <button type="button" className="btn btn-sun cl-btn-icon" disabled={busy || (!dirty && Boolean(s.attendanceAt))} onClick={save}>
                <LineIcon name="check" size={22} /> {busy ? 'Đang lưu…' : 'Lưu điểm danh'}
              </button>
            </div>
          )}
        </>
      )}

      {dialog === 'edit' && (
        <SessionDialog
          mode="edit"
          session={s}
          onClose={() => setDialog(null)}
          onSaved={(d) => {
            setDialog(null);
            apply(d, { keepDraft: true });
            setNotice({ type: 'success', text: 'Đã lưu lịch mới. Giáo viên sẽ thấy thông báo.' });
          }}
        />
      )}
      {dialog === 'delete' && (
        <DeleteSessionDialog s={s} onClose={() => setDialog(null)} onDeleted={() => navigate(`/admin/thoi-khoa-bieu?ngay=${s.date}`, { replace: true })} />
      )}
    </div>
  );
}

/** Khối "Bắt đầu buổi học": chỉ bấm được từ 30 phút trước giờ học */
function StartCard({ s, isOwner, now, canStart, busy, onStart }) {
  const startFrom = Date.parse(s.startFrom);
  const expired = !isOwner && now >= Date.parse(s.editUntil);

  if (expired) {
    return (
      <div className="cl-start is-expired">
        <LineIcon name="alert" size={40} />
        <h2>Buổi học này chưa được điểm danh</h2>
        <p>Đã quá hạn để giáo viên điểm danh (hết ngày {lastEditDay(s)}). Hãy báo admin chính điểm danh giúp.</p>
      </div>
    );
  }
  if (!canStart) {
    return (
      <div className="cl-start is-waiting">
        <LineIcon name="clock" size={40} />
        <h2>Chưa tới giờ học</h2>
        <p>
          Bạn bấm "Bắt đầu" được từ <strong>{vnTimeOf(s.startFrom)} {relativeDay(s.date).toLowerCase()}</strong> (30 phút trước giờ học).
        </p>
        <p className="cl-start-count">Còn {durationText(startFrom - now)}</p>
        <button type="button" className="btn btn-large btn-primary" disabled>
          <LineIcon name="play" size={24} /> Bắt đầu buổi học
        </button>
      </div>
    );
  }
  return (
    <div className="cl-start is-ready">
      <span className="cl-start-pulse" aria-hidden="true" />
      <h2>{Date.parse(s.endsAt) <= now ? 'Buổi học đã kết thúc nhưng chưa điểm danh' : 'Sẵn sàng vào lớp!'}</h2>
      <p>Bấm nút bên dưới để mở <strong>điểm danh</strong>, <strong>danh sách học sinh</strong> và <strong>điểm cộng</strong>.</p>
      <button type="button" className="btn btn-large btn-sun cl-btn-icon cl-start-btn" disabled={busy} onClick={onStart}>
        <LineIcon name="play" size={26} /> {busy ? 'Đang mở…' : 'Bắt đầu buổi học'}
      </button>
    </div>
  );
}

/** Nhắc học phí trong trang điểm danh (giáo viên nhắc phụ huynh; không có số tiền) */
function FeeReminder({ alerts }) {
  return (
    <div className="cl-alert-fee">
      <LineIcon name="money" size={20} />
      <div>
        <p><strong>Nhắc phụ huynh đóng học phí:</strong></p>
        <ul className="tu-remind-list">
          {alerts.map((st) => (
            <li key={st.id}>{st.fullName}: <AlertBadge alert={st.tuition.alert} short /></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Trước khi bắt đầu: xem trước danh sách học sinh của buổi (số buổi đã học, cảnh báo học phí, điểm danh đã có) */
function RosterPreview({ students, alerts }) {
  if (students.length === 0) return null;
  return (
    <section className="card cl-roster-preview">
      <h3 className="cl-subtitle">Học sinh của buổi này ({students.length})</h3>
      {alerts.length > 0 && <p className="muted small-text">{alerts.length} học sinh cần nhắc phụ huynh đóng học phí (nhãn màu cạnh tên).</p>}
      <ul className="cl-roster-list">
        {students.map((st) => (
          <li key={st.id}>
            <strong>{st.fullName}</strong>
            <span className="muted small-text">đã học {st.tuition?.sessionsDone ?? 0} buổi</span>
            {st.attendance && <span className={`cl-count is-${st.attendance.status}`}>{ATTENDANCE.find((a) => a.key === st.attendance.status)?.label}</span>}
            {st.tuition?.alert && <AlertBadge alert={st.tuition.alert} short />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tab "Học sinh" trong buổi học (admin chính): thêm / sửa / cho nghỉ (danh sách đầy đủ của lớp) */
function SessionStudents({ classId, sessionId, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      apiGet(`/admin/classes/${classId}`)
        .then(setData)
        .catch((err) => setError(err.message)),
    [classId]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="alert-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  return (
    <StudentsTab
      cls={data.class}
      students={data.students}
      compact
      isOwner
      startSessionId={sessionId}
      onChanged={() => {
        load();
        onChanged();
      }}
    />
  );
}

/**
 * Xóa buổi học (admin chính): chỉ buổi này hoặc cả các buổi sau trong lịch lặp lại.
 * Buổi đã điểm danh không xóa được (server chặn). Xóa làm lệch kì học phí đã thu thì server hỏi lại.
 */
function DeleteSessionDialog({ s, onClose, onDeleted }) {
  const [scope, setScope] = useState('one');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const following = s.followingCount || 1;

  async function remove(force = false) {
    setBusy(true);
    setError('');
    try {
      await apiPost(`/admin/schedule/${s.id}/delete`, { scope, force });
      onDeleted();
    } catch (err) {
      setBusy(false);
      if (err.data?.reason === 'confirm') setConfirm(err.data);
      else setError(err.message);
    }
  }

  return (
    <Modal
      title="Xóa buổi học"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(false)}>
            {busy ? 'Đang xóa…' : scope === 'following' ? `Xóa ${following} buổi` : 'Xóa buổi này'}
          </button>
        </>
      }
    >
      <p>
        Xóa buổi học lớp <strong>{s.className}</strong> ngày {describeDate(s.date)}, {s.startTime}–{s.endTime}?
      </p>
      {following > 1 && (
        <fieldset className="cl-radio-group">
          <legend>Xóa</legend>
          <label className={`type-row ${scope === 'one' ? 'is-on' : ''}`}>
            <input type="radio" name="del-scope" checked={scope === 'one'} onChange={() => { setScope('one'); setConfirm(null); }} />
            <span className="type-row-text"><strong>Chỉ buổi này</strong></span>
          </label>
          <label className={`type-row ${scope === 'following' ? 'is-on' : ''}`}>
            <input type="radio" name="del-scope" checked={scope === 'following'} onChange={() => { setScope('following'); setConfirm(null); }} />
            <span className="type-row-text">
              <strong>Buổi này và {following - 1} buổi sau</strong>
              <span className="type-row-desc">ví dụ lớp kết thúc sớm, hoặc đổi hẳn lịch học</span>
            </span>
          </label>
        </fieldset>
      )}
      <p className="muted small-text">
        Xóa thì các buổi sau được đánh số lại. Giáo viên của các buổi chưa diễn ra sẽ nhận được thông báo.
      </p>
      {confirm && <ConfirmBox data={confirm} saving={busy} onConfirm={() => remove(true)} label="Vẫn xóa" />}
      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
    </Modal>
  );
}
