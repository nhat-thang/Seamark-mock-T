import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { saveAttemptToken } from '../utils/attemptStorage.js';
import { ArrowIcon } from './brand/SiteHeader.jsx';
import './ExamList.css';

const HOMEWORK_ICON = 'M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12v-4M9 8h6M9 12h4';
const EXAM_ICON = 'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm8 0v4h4M9 12h6M9 16h6';

/** "2026-10-13T..." -> "13/10" (giờ Việt Nam) */
function shortDate(iso) {
  const d = new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

// Danh sách đề đã xuất bản, lấy từ GET /api/exams.
// Hai mục: "Đề thi thử" và "Bài tập về nhà" (homework, kèm tên giáo viên ra đề, mới giao lên trước).
export default function ExamList({ student }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [exams, setExams] = useState([]);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState('');
  const [category, setCategory] = useState(null); // null = chưa chọn: tự chọn mục có đề
  const [teacher, setTeacher] = useState('');

  useEffect(() => {
    let cancelled = false; // tránh cập nhật state khi component đã bị gỡ
    setStatus('loading');
    apiGet('/exams')
      .then((data) => {
        if (cancelled) return;
        setExams(data.exams || []);
        setStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleStart(exam) {
    const ok = window.confirm(
      `Bắt đầu làm "${exam.title}"?\n\n` +
        `Thời gian làm bài: ${exam.durationMinutes} phút, tính ngay khi bạn bấm "OK".\n` +
        'Hết giờ, bài sẽ tự động nộp và chấm điểm.\n\n' +
        'Nếu bạn đang làm dở đề này, bài cũ sẽ được mở lại với thời gian còn lại.'
    );
    if (!ok) return;
    setStartingId(exam.id);
    setStartError('');
    try {
      const data = await apiPost('/attempts', { ...student, examId: exam.id });
      saveAttemptToken(data.attemptId, data.token);
      navigate(`/lam-bai/${data.attemptId}`);
    } catch (err) {
      setStartError(err.message);
      setStartingId(null);
    }
  }

  if (status === 'loading') {
    return <p className="muted">Đang tải danh sách đề…</p>;
  }

  if (status === 'error') {
    return (
      <div className="exam-error">
        <p className="alert-error">{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Thử lại
        </button>
      </div>
    );
  }

  if (exams.length === 0) {
    return <p className="exam-empty">Hiện chưa có đề thi</p>;
  }

  const mocks = exams.filter((e) => e.category !== 'homework');
  const homework = exams.filter((e) => e.category === 'homework').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const current = category || (mocks.length === 0 && homework.length > 0 ? 'homework' : 'exam');
  const teachers = [...new Set(homework.map((e) => e.teacherName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const shown = current === 'homework' ? homework.filter((e) => !teacher || e.teacherName === teacher) : mocks;

  return (
    <>
      {startError && <p className="alert-error exam-start-error" role="alert">{startError}</p>}
      <div className="exam-tabs" role="tablist" aria-label="Chọn loại bài">
        <button type="button" role="tab" aria-selected={current === 'exam'} className={current === 'exam' ? 'is-on' : ''} onClick={() => setCategory('exam')}>
          Đề thi thử <span className="exam-tab-count">{mocks.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={current === 'homework'} className={`is-hw ${current === 'homework' ? 'is-on' : ''}`} onClick={() => setCategory('homework')}>
          Bài tập về nhà (Homework) <span className="exam-tab-count">{homework.length}</span>
        </button>
      </div>

      {current === 'homework' && teachers.length > 1 && (
        <div className="exam-teacher-filter">
          <label htmlFor="hw-teacher">Giáo viên</label>
          <select id="hw-teacher" className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">Tất cả giáo viên</option>
            {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {shown.length === 0 && (
        <p className="exam-empty">{current === 'homework' ? 'Hiện chưa có bài tập về nhà.' : 'Hiện chưa có đề thi thử.'}</p>
      )}
      <ul className="exam-list">
        {shown.map((exam) => (
          <li key={exam.id} className={`exam-item ${exam.category === 'homework' ? 'is-hw' : ''}`}>
            <span className="exam-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24">
                <path d={exam.category === 'homework' ? HOMEWORK_ICON : EXAM_ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="exam-info">
              <h2 className="exam-title">{exam.title}</h2>
              <p className="exam-meta">
                {exam.teacherName && <span className="exam-chip is-teacher">Giáo viên: {exam.teacherName}</span>}
                {exam.category === 'homework' && <span className="exam-chip">Giao ngày {shortDate(exam.publishedAt)}</span>}
                <span className="exam-chip">{exam.questionCount} câu</span>
                <span className="exam-chip">{exam.durationMinutes} phút</span>
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary exam-start"
              disabled={startingId !== null}
              onClick={() => handleStart(exam)}
            >
              {startingId === exam.id ? 'Đang mở…' : 'Làm bài'}
              {startingId !== exam.id && <ArrowIcon />}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
