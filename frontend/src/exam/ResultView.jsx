import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../utils/format.js';
import { partName } from '../utils/parts.js';
import PassageText from '../components/PassageText.jsx';
import { GroupImages } from './PageMedia.jsx';

// Trang kết quả sau khi nộp bài
export default function ResultView({ view }) {
  const r = view.result;

  return (
    <div className="result-page">
      <header className="result-header">
        <img src="/images/logo-seamark.png" alt="Seamark" className="result-logo" />
      </header>

      <main className="result-main">
        <section className="card result-summary">
          <h1 className="result-title">Kết quả bài làm</h1>
          <p className="result-meta">
            <strong>{view.examTitle}</strong>
            <br />
            {view.student.lastName} {view.student.firstName} · Nộp lúc {formatDateTime(view.submittedAt)}
          </p>

          {r.examType === 'CUSTOM' ? (
            <CustomScores result={r} />
          ) : (
          <div className="result-scores">
            {r.listeningTotal > 0 && (
              <ScoreBox label="Listening" correct={r.listeningCorrect} total={r.listeningTotal} score={r.listeningScore} />
            )}
            {r.readingTotal > 0 && (
              <ScoreBox label="Reading" correct={r.readingCorrect} total={r.readingTotal} score={r.readingScore} />
            )}
            {r.totalScore !== null && (
              <div className="score-box score-total">
                <span className="score-label">Tổng điểm ước tính</span>
                <span className="score-big">{r.totalScore}</span>
                <span className="score-sub">/ 990</span>
              </div>
            )}
          </div>
          )}

          {(r.listeningScore !== null || r.readingScore !== null) && (
            <p className="result-note">
              Điểm quy đổi là <strong>điểm ước tính</strong> để tham khảo, không phải điểm TOEIC chính thức.
            </p>
          )}

          <div className="result-actions">
            <Link to="/bat-dau" className="btn btn-primary">Làm đề khác</Link>
            <Link to="/" className="btn btn-secondary">Về trang chủ</Link>
          </div>
        </section>

        {r.showAnswers && r.details && <AnswerReview content={r.content} details={r.details} />}
      </main>
    </div>
  );
}

/** Kết quả đề tự thiết kế: số câu đúng, điểm thang 10, từng phần */
export function CustomScores({ result: r }) {
  const fmt = (x) => (x === null || x === undefined ? '—' : String(x).replace('.', ','));
  return (
    <>
      <div className="result-scores">
        <div className="score-box">
          <span className="score-label">Số câu đúng</span>
          <span className="score-big">
            {r.correct ?? '—'}
            <span className="score-sub"> / {r.total} câu</span>
          </span>
        </div>
        <div className="score-box score-total">
          <span className="score-label">Điểm</span>
          <span className="score-big">{fmt(r.score10)}</span>
          <span className="score-sub">/ 10</span>
        </div>
      </div>
      {r.parts?.length > 1 && (
        <div className="table-wrap result-parts">
          <table className="table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Số câu đúng</th>
              </tr>
            </thead>
            <tbody>
              {r.parts.map((p) => (
                <tr key={p.no}>
                  <td>{p.name}</td>
                  <td>
                    {p.correct} / {p.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ScoreBox({ label, correct, total, score }) {
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

// Đáp án từng câu, nút "Chi tiết" mở lời giải ngay bên dưới
export function AnswerReview({ content, details, chosenLabel = 'Bạn chọn' }) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [open, setOpen] = useState(() => new Set());

  const questionByNo = useMemo(() => new Map(content.questions.map((q) => [q.no, q])), [content]);
  const groupByCode = useMemo(() => new Map((content.groups || []).map((g) => [g.code, g])), [content]);

  const shown = onlyWrong ? details.filter((d) => !d.isCorrect) : details;
  const parts = [...new Set(shown.map((d) => d.part))];

  const toggle = (no) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });

  const wrongCount = details.filter((d) => !d.isCorrect).length;

  return (
    <section className="card result-review">
      <h2 className="result-review-title">Đáp án và giải thích</h2>
      <p className="muted result-review-hint">Bấm "Chi tiết" ở mỗi câu để xem câu hỏi, đáp án đúng và lý do.</p>

      <div className="result-filter" role="group" aria-label="Lọc câu">
        <button type="button" className={`btn btn-small ${!onlyWrong ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOnlyWrong(false)}>
          Tất cả ({details.length})
        </button>
        <button type="button" className={`btn btn-small ${onlyWrong ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOnlyWrong(true)}>
          Câu sai và chưa làm ({wrongCount})
        </button>
      </div>

      {shown.length === 0 && <p className="alert-success">Bạn đã làm đúng tất cả các câu.</p>}

      {parts.map((part) => (
        <div key={part} className="answer-part">
          <h3 className="answer-part-title">{partName(content, part)}</h3>
          {shown
            .filter((d) => d.part === part)
            .map((d) => (
              <AnswerRow
                key={d.no}
                detail={d}
                question={questionByNo.get(d.no)}
                group={groupByCode.get(questionByNo.get(d.no)?.groupCode)}
                isOpen={open.has(d.no)}
                chosenLabel={chosenLabel}
                examType={content.examType}
                onToggle={() => toggle(d.no)}
              />
            ))}
        </div>
      ))}
    </section>
  );
}

function AnswerRow({ detail: d, question: q, group, isOpen, onToggle, chosenLabel, examType }) {
  const [showPassage, setShowPassage] = useState(false);
  const status = d.chosen === null ? 'blank' : d.isCorrect ? 'correct' : 'wrong';
  const statusText = { blank: 'Chưa làm', correct: 'Đúng', wrong: 'Sai' }[status];

  return (
    <div className={`answer-row is-${status} ${isOpen ? 'is-open' : ''}`}>
      <div className="answer-line">
        <span className="answer-no">{d.displayNo ?? d.no}</span>
        <span className="answer-key">
          Đáp án: <strong>{d.answer}</strong>
        </span>
        <span className="answer-chosen">
          {chosenLabel}: <strong>{d.chosen ?? 'chưa trả lời'}</strong>
        </span>
        <span className={`answer-tag answer-tag-${status}`}>{statusText}</span>
        <button type="button" className="btn btn-secondary btn-small answer-toggle" onClick={onToggle} aria-expanded={isOpen}>
          {isOpen ? 'Ẩn chi tiết' : 'Chi tiết'}
        </button>
      </div>

      {isOpen && q && (
        <div className="answer-detail">
          {q.audio && <audio className="audio-preview" controls preload="none" src={q.audio} aria-label={`Audio question ${d.displayNo ?? q.no}`} />}
          {q.image && <img src={q.image} alt={`Ảnh question ${d.displayNo ?? q.no}`} className="question-image" />}
          {q.question ? (
            <p className="answer-question">{q.question}</p>
          ) : (
            examType !== 'CUSTOM' && q.part === 6 && <p className="answer-question muted">Chỗ trống ({q.no}) trong đoạn văn.</p>
          )}

          <ul className="answer-options">
            {Object.entries(q.options).map(([letter, text]) => {
              const isKey = letter === d.answer;
              const isChosen = letter === d.chosen;
              const cls = isKey ? 'is-key' : isChosen ? 'is-wrong-choice' : '';
              return (
                <li key={letter} className={cls}>
                  <span className="option-letter">{letter}</span>
                  <span className="answer-option-text">{text}</span>
                  {isKey && <span className="answer-mark">Đáp án đúng</span>}
                  {isChosen && !isKey && <span className="answer-mark">{chosenLabel}</span>}
                </li>
              );
            })}
          </ul>

          {q.explanation && (
            <div className="answer-explanation">
              <strong>Giải thích: </strong>
              {q.explanation}
            </div>
          )}

          {group && (group.passage || (group.passageImages || []).length > 0 || group.image) && (
            <div className="answer-passage">
              <button type="button" className="btn btn-link" onClick={() => setShowPassage((v) => !v)}>
                {showPassage ? 'Ẩn đoạn văn' : 'Xem lại đoạn văn'}
              </button>
              {showPassage && (
                <div className="answer-passage-box">
                  {group.passage && <PassageText text={group.passage} />}
                  <GroupImages group={group} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
