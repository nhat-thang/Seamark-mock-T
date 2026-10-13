import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { saveAttemptToken } from '../utils/attemptStorage.js';
import { classStyle } from '../utils/schedule.js';
import PageShell from '../components/brand/PageShell.jsx';
import { ArrowIcon } from '../components/brand/SiteHeader.jsx';
import '../components/ExamList.css';
import './StartPage.css';
import './ClassAssignmentPage.css';

const STEPS = ['Chọn lớp', 'Chọn tên', 'Làm bài'];
const PICKED_KEY = 'seamark_class_student'; // học sinh vừa bấm tên (mất khi đóng tab)
const AVATAR_COLORS = ['#2f6fe0', '#12998f', '#ec6a35', '#8358e8', '#d94585', '#3a9d4f', '#1f9bd4', '#d69a00'];
const BOOK_ICON = 'M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12v-4M9 8h6M9 12h4';

function readPicked() {
  try {
    return JSON.parse(sessionStorage.getItem(PICKED_KEY) || 'null');
  } catch {
    return null;
  }
}
function writePicked(value) {
  try {
    if (value) sessionStorage.setItem(PICKED_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PICKED_KEY);
  } catch {
    // Trình duyệt chặn bộ nhớ: bấm lại tên là được
  }
}

/** Chữ cái đầu của tên (tên tiếng Việt: chữ cuối) + màu cố định theo tên */
function avatarOf(name) {
  const last = name.trim().split(/\s+/).at(-1) || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { letter: last[0].toUpperCase(), color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}

/** "2026-10-13T..." -> "13/10" (giờ Việt Nam) */
const shortDate = (iso) => {
  const d = new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

/**
 * Class Assignment (đề riêng của lớp): chọn lớp -> bấm tên mình -> chọn bài của lớp để làm.
 * Học sinh không cần gõ tên: bấm tên là web nhận ra (giáo viên xem được ai làm, lúc nào, mấy lần).
 */
export default function ClassAssignmentPage() {
  const { classId } = useParams();
  return classId ? <ClassRoom classId={Number(classId)} /> : <ClassPicker />;
}

/** Bước 1: các lớp đang có */
function ClassPicker() {
  const [classes, setClasses] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiGet('/classes').then((d) => setClasses(d.classes)).catch((err) => setError(err.message));
  }, []);

  return (
    <PageShell title="Class Assignment" subtitle="Chọn lớp học của bạn." step={1} steps={STEPS}>
      <div className="card">
        {error && <p className="alert-error">{error}</p>}
        {!classes && !error && <p className="muted">Đang tải danh sách lớp…</p>}
        {classes && classes.length === 0 && <p className="exam-empty">Hiện chưa có lớp nào.</p>}
        <div className="ca-pick-grid">
          {(classes || []).map((c) => (
            <Link key={c.id} to={`/lop/${c.id}`} className="ca-pick-class" style={classStyle(c.color)}>
              <span className="ca-pick-class-name">{c.name}</span>
              <span className="ca-pick-class-meta">
                {c.studentCount} học sinh · {c.assignmentCount ? `${c.assignmentCount} bài đang mở` : 'chưa có bài'}
              </span>
              <ArrowIcon />
            </Link>
          ))}
        </div>
        <p className="ca-pick-foot">
          Không thuộc lớp nào? <Link to="/bat-dau">Làm Training Test</Link>
        </p>
      </div>
    </PageShell>
  );
}

/** Bước 2 + 3: bấm tên mình, rồi chọn bài của lớp */
function ClassRoom({ classId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => {
    const p = readPicked();
    return p && p.classId === classId ? p : null;
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet(`/classes/${classId}`)
      .then((d) => {
        setData(d);
        // Tên đã chọn lúc trước không còn trong lớp (đã nghỉ...) -> chọn lại
        setPicked((p) => (p && d.students.some((s) => s.id === p.id) ? p : null));
      })
      .catch((err) => setError(err.message));
  }, [classId]);

  function pick(student) {
    const p = { classId, id: student.id, fullName: student.fullName };
    writePicked(p);
    setPicked(p);
    window.scrollTo({ top: 0 });
  }
  function unpick() {
    writePicked(null);
    setPicked(null);
  }

  if (error) {
    return (
      <PageShell title="Class Assignment" step={1} steps={STEPS}>
        <div className="card">
          <p className="alert-error">{error}</p>
          <Link to="/lop" className="btn btn-secondary">Chọn lại lớp</Link>
        </div>
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell title="Class Assignment" step={2} steps={STEPS}>
        <div className="card"><p className="muted">Đang tải…</p></div>
      </PageShell>
    );
  }

  if (!picked) {
    const q = search.trim().toLowerCase();
    const shown = data.students.filter((s) => !q || s.fullName.toLowerCase().includes(q));
    return (
      <PageShell title={`Lớp ${data.class.name}`} subtitle="Bấm vào tên của bạn." step={2} steps={STEPS}>
        <div className="card">
          <div className="start-card-head">
            <h2 className="start-card-title">Bạn là ai?</h2>
            <Link to="/lop" className="btn btn-link">Đổi lớp</Link>
          </div>
          {data.students.length > 12 && (
            <input
              className="input ca-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên của bạn…"
              aria-label="Tìm tên"
            />
          )}
          <div className="ca-names">
            {shown.map((s) => {
              const av = avatarOf(s.fullName);
              return (
                <button key={s.id} type="button" className="ca-name" onClick={() => pick(s)}>
                  <span className="ca-avatar" style={{ background: av.color }} aria-hidden="true">{av.letter}</span>
                  {s.fullName}
                </button>
              );
            })}
          </div>
          {shown.length === 0 && <p className="exam-empty">Không thấy tên này trong lớp. Hãy báo giáo viên.</p>}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={`Xin chào ${picked.fullName}!`} subtitle={`Lớp ${data.class.name} · chọn bài để làm.`} step={3} steps={STEPS}>
      <div className="card">
        <div className="start-card-head">
          <h2 className="start-card-title">Bài của lớp</h2>
          <button type="button" className="btn btn-link" onClick={unpick}>Không phải bạn? Chọn lại tên</button>
        </div>
        <Assignments classId={classId} student={picked} onStarted={(id) => navigate(`/lam-bai/${id}`)} />
      </div>
    </PageShell>
  );
}

/** Danh sách bài của lớp + số lần học sinh này đã làm; đề có mật khẩu thì hỏi mật khẩu trước khi vào */
function Assignments({ classId, student, onStarted }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [askPw, setAskPw] = useState(null); // id đề đang hỏi mật khẩu
  const [password, setPassword] = useState('');
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState({ id: null, text: '' });

  useEffect(() => {
    apiGet(`/classes/${classId}/assignments?student=${student.id}`)
      .then((d) => setItems(d.assignments))
      .catch((err) => setError(err.message));
  }, [classId, student.id]);

  async function start(a, pw) {
    if (a.needsPassword && pw === undefined) {
      setAskPw(a.id);
      setPassword('');
      setStartError({ id: null, text: '' });
      return;
    }
    if (!a.inProgress) {
      const ok = window.confirm(
        `Bắt đầu làm "${a.title}"?\n\nThời gian làm bài: ${a.durationMinutes} phút, tính ngay khi bạn bấm "OK".\nHết giờ, bài sẽ tự động nộp và chấm điểm.`
      );
      if (!ok) return;
    }
    setStartingId(a.id);
    setStartError({ id: null, text: '' });
    try {
      const r = await apiPost('/attempts', { classStudentId: student.id, examId: a.id, password: pw });
      saveAttemptToken(r.attemptId, r.token);
      onStarted(r.attemptId);
    } catch (err) {
      setStartError({ id: a.id, text: err.message });
      setStartingId(null);
    }
  }

  if (error) return <p className="alert-error">{error}</p>;
  if (!items) return <p className="muted">Đang tải bài của lớp…</p>;
  if (items.length === 0) return <p className="exam-empty">Lớp chưa có bài nào đang mở. Hãy quay lại khi giáo viên giao bài.</p>;

  return (
    <ul className="exam-list">
      {items.map((a) => (
        <li key={a.id} className="exam-item is-hw ca-item">
          <div className="ca-item-row">
            <span className="exam-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24">
                <path d={BOOK_ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="exam-info">
              <h2 className="exam-title">{a.title}</h2>
              <p className="exam-meta">
                {a.teacherName && <span className="exam-chip is-teacher">Giáo viên: {a.teacherName}</span>}
                <span className="exam-chip">Giao ngày {shortDate(a.publishedAt)}</span>
                <span className="exam-chip">{a.questionCount} câu</span>
                <span className="exam-chip">{a.durationMinutes} phút</span>
                {a.needsPassword && <span className="exam-chip">🔒 Cần mật khẩu</span>}
              </p>
              <p className="ca-mine">
                {a.inProgress ? (
                  <span className="ca-status is-live">Đang làm dở</span>
                ) : a.doneCount ? (
                  <span className="ca-status is-done">
                    ✓ Đã làm {a.doneCount} lần
                    {a.lastTotal ? ` · lần gần nhất đúng ${a.lastCorrect}/${a.lastTotal} câu` : ''}
                  </span>
                ) : (
                  <span className="ca-status">Chưa làm</span>
                )}
              </p>
            </div>
            {askPw !== a.id && (
              <button type="button" className="btn btn-primary exam-start" disabled={startingId !== null} onClick={() => start(a)}>
                {startingId === a.id ? 'Đang mở…' : a.inProgress ? 'Làm tiếp' : a.doneCount ? 'Làm lại' : 'Làm bài'}
                {startingId !== a.id && <ArrowIcon />}
              </button>
            )}
          </div>
          {askPw === a.id && (
            <form
              className="ca-pw"
              onSubmit={(e) => {
                e.preventDefault();
                start(a, password);
              }}
            >
              <label htmlFor={`pw-${a.id}`}>Mật khẩu đề (giáo viên cho)</label>
              <div className="ca-pw-row">
                <input id={`pw-${a.id}`} className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" />
                <button type="submit" className="btn btn-primary" disabled={!password.trim() || startingId !== null}>
                  {startingId === a.id ? 'Đang mở…' : 'Vào làm'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAskPw(null)}>Hủy</button>
              </div>
            </form>
          )}
          {startError.id === a.id && <p className="alert-error ca-error" role="alert">{startError.text}</p>}
        </li>
      ))}
    </ul>
  );
}
