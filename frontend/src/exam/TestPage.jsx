import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../utils/api.js';
import { getAttemptToken } from '../utils/attemptStorage.js';
import ExamRunner from './ExamRunner.jsx';
import ResultView from './ResultView.jsx';
import './exam.css';

// Trang /lam-bai/:attemptId — đang làm thì hiện bài, đã nộp thì hiện kết quả.
export default function TestPage() {
  const { attemptId } = useParams();
  const token = getAttemptToken(attemptId);
  const [view, setView] = useState(null); // dữ liệu từ server
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) {
      setError('Không tìm thấy bài làm trên máy này. Hãy vào "Bắt đầu làm bài" và chọn lại đề (nếu đang làm dở, bài sẽ được mở lại).');
      return;
    }
    setError('');
    apiGet(`/attempts/${attemptId}`, { 'X-Attempt-Token': token })
      .then(setView)
      .catch((err) => setError(err.message));
  }, [attemptId, token]);

  useEffect(load, [load]);

  if (error) {
    return (
      <main className="simple-center">
        <div className="card exam-message-card">
          <p className="alert-error">{error}</p>
          <div className="exam-message-actions">
            {token && (
              <button type="button" className="btn btn-primary" onClick={load}>
                Thử lại
              </button>
            )}
            <Link to="/bat-dau" className="btn btn-secondary">
              Về danh sách đề
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="simple-center">
        <p className="muted">Đang mở bài làm…</p>
      </main>
    );
  }

  if (view.status === 'submitted') {
    return <ResultView view={view} />;
  }

  return <ExamRunner key={view.id} view={view} token={token} onSubmitted={setView} />;
}
