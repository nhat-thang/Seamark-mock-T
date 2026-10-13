import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { clearOngoing, getAttemptToken, getOngoing, saveAttemptToken, saveOngoing } from '../utils/attemptStorage.js';
import { ArrowIcon } from './brand/SiteHeader.jsx';
import './ExamList.css';

const EXAM_ICON = 'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm8 0v4h4M9 12h6M9 16h6';

/**
 * Bài đang làm dở của đúng người này trên máy này (Training Test chỉ nhập tên nên server không tự mở lại).
 * Trả về id bài nếu còn đang làm, ngược lại null.
 */
async function findOngoing(examId, student) {
  const saved = getOngoing(examId);
  const token = saved && getAttemptToken(saved.attemptId);
  if (!saved || !token || saved.name !== `${student.lastName} ${student.firstName}`) return null;
  try {
    const view = await apiGet(`/attempts/${saved.attemptId}`, { 'X-Attempt-Token': token });
    if (view.status === 'in_progress') return saved.attemptId;
  } catch {
    // Bài không còn (đã xóa...) -> làm bài mới
  }
  clearOngoing(examId);
  return null;
}

// Danh sách đề Training Test đã xuất bản (GET /api/exams). Đề Class Assignment nằm ở trang /lop.
export default function ExamList({ student }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [exams, setExams] = useState([]);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState('');

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
        'Nếu bạn đang làm dở đề này trên máy này, bài cũ sẽ được mở lại với thời gian còn lại.'
    );
    if (!ok) return;
    setStartingId(exam.id);
    setStartError('');
    try {
      const ongoing = await findOngoing(exam.id, student);
      if (ongoing) {
        navigate(`/lam-bai/${ongoing}`);
        return;
      }
      const data = await apiPost('/attempts', { lastName: student.lastName, firstName: student.firstName, examId: exam.id });
      saveAttemptToken(data.attemptId, data.token);
      saveOngoing(exam.id, { attemptId: data.attemptId, name: `${student.lastName} ${student.firstName}` });
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
    return <p className="exam-empty">Hiện chưa có đề Training Test</p>;
  }

  return (
    <>
      {startError && <p className="alert-error exam-start-error" role="alert">{startError}</p>}
      <ul className="exam-list">
        {exams.map((exam) => (
          <li key={exam.id} className="exam-item">
            <span className="exam-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24">
                <path d={EXAM_ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="exam-info">
              <h2 className="exam-title">{exam.title}</h2>
              <p className="exam-meta">
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
