import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { saveAttemptToken } from '../utils/attemptStorage.js';
import './ExamList.css';

// Danh sách đề đã xuất bản, lấy từ GET /api/exams
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

  return (
    <>
      {startError && <p className="alert-error exam-start-error" role="alert">{startError}</p>}
      <ul className="exam-list">
        {exams.map((exam) => (
          <li key={exam.id} className="exam-item">
            <div className="exam-info">
              <h2 className="exam-title">{exam.title}</h2>
              <p className="exam-meta">
                {exam.questionCount} câu · {exam.durationMinutes} phút
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary exam-start"
              disabled={startingId !== null}
              onClick={() => handleStart(exam)}
            >
              {startingId === exam.id ? 'Đang mở…' : 'Làm bài'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
