import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import { AnswerReview, CustomScores } from '../exam/ResultView.jsx';
import '../exam/exam.css';

// Chi tiết một lượt làm bài — mọi admin. Luôn thấy đáp án, kể cả khi học viên không được xem.
export default function ResultDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    apiGet(`/admin/results/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="alert-error admin-message">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;

  const a = data.attempt;
  const r = data.result;
  const done = a.status === 'submitted';

  return (
    <>
      <p className="breadcrumb">
        <Link to="/admin/ket-qua">Kết quả làm bài</Link> / {a.student.lastName} {a.student.firstName}
      </p>
      <h1 className="admin-title">
        {a.student.lastName} {a.student.firstName}
      </h1>

      <section className="admin-section">
        <div className="card">
          <div className="detail-grid">
            <Info label="Số điện thoại" value={a.student.phone} />
            <Info label="Đề" value={`${a.exam.title} (${a.exam.code}, lần xuất bản ${a.exam.versionNo})`} />
            <Info label="Bắt đầu" value={formatDateTime(a.startedAt)} />
            <Info
              label={done ? 'Nộp bài' : 'Hết giờ lúc'}
              value={done ? `${formatDateTime(a.submittedAt)} (làm ${a.minutesUsed} phút)` : formatDateTime(data.deadlineAt)}
            />
            <Info label="Trạng thái" value={done ? 'Đã nộp' : `Đang làm — đã trả lời ${a.answered}/${a.questionCount} câu`} />
          </div>

          {r.examType === 'CUSTOM' ? (
            <CustomScores result={done ? r : { ...r, score10: null }} />
          ) : (
          <div className="result-scores">
            {r.listeningTotal > 0 && <Score label="Listening" correct={r.listeningCorrect} total={r.listeningTotal} score={r.listeningScore} />}
            {r.readingTotal > 0 && <Score label="Reading" correct={r.readingCorrect} total={r.readingTotal} score={r.readingScore} />}
            {r.totalScore !== null && (
              <div className="score-box score-total">
                <span className="score-label">Tổng điểm ước tính</span>
                <span className="score-big">{r.totalScore}</span>
                <span className="score-sub">/ 990</span>
              </div>
            )}
          </div>
          )}
          {!done && <p className="text-warn result-note">Học viên đang làm bài: số câu đúng ở trên chỉ là tạm tính.</p>}
        </div>
      </section>

      <AnswerReview content={r.content} details={r.details} chosenLabel="Học viên chọn" />

      {data.otherAttempts.length > 0 && (
        <section className="admin-section other-attempts">
          <h2 className="admin-section-title">Các lần làm khác của học viên này</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Bắt đầu</th>
                  <th>Đề</th>
                  <th>Trạng thái</th>
                  <th>Listening đúng</th>
                  <th>Reading đúng</th>
                  <th>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {data.otherAttempts.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap"><Link to={`/admin/ket-qua/${o.id}`} className="row-link">{formatDateTime(o.startedAt)}</Link></td>
                    <td>{o.examTitle}</td>
                    <td>{o.status === 'submitted' ? 'Đã nộp' : 'Đang làm'}</td>
                    <td>{o.listeningCorrect ?? '—'}</td>
                    <td>{o.readingCorrect ?? '—'}</td>
                    <td>{o.totalScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="muted small-text">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

function Score({ label, correct, total, score }) {
  return (
    <div className="score-box">
      <span className="score-label">{label}</span>
      <span className="score-big">
        {correct}
        <span className="score-sub"> / {total} câu đúng</span>
      </span>
      {score !== null && <span className="score-scaled">Điểm ước tính: <strong>{score}</strong> / 495</span>}
    </div>
  );
}
