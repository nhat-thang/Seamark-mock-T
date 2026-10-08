import AudioPlayer from './AudioPlayer.jsx';
import { shownNo } from '../utils/parts.js';

// Một câu hỏi trắc nghiệm khi đang làm bài.
// hideOptionText: đề TOEIC Part 1, 2 chỉ hiện chữ cái A/B/C (nội dung nằm trong audio).
// examType: 'TOEIC_LR' | 'CUSTOM' — đề TOEIC Part 6 hiện gợi ý "chỗ trống" khi câu không có chữ.
export default function QuestionCard({
  question: q, chosen, flagged, onChoose, onToggleFlag, showFlag = true, hideOptionText = false, allowSeek = false,
  examType = 'TOEIC_LR',
}) {
  const letters = Object.keys(q.options || {});
  const label = shownNo(q);

  return (
    <div id={`q-${q.no}`} className={`question-card ${flagged ? 'is-flagged' : ''}`}>
      <div className="question-head">
        <span className="question-no">Question {label}</span>
        {showFlag && (
          <label className="checkbox-label question-flag">
            <input type="checkbox" checked={flagged} onChange={() => onToggleFlag(q.no)} />
            Cần xem lại
          </label>
        )}
      </div>

      {q.audio && <AudioPlayer key={q.audio} src={q.audio} allowSeek={allowSeek} label={`Audio question ${label}`} />}
      {q.image && <img src={q.image} alt={`Ảnh question ${label}`} className="question-image" />}

      {q.question ? (
        <p className="question-text">{q.question}</p>
      ) : examType !== 'CUSTOM' && q.part === 6 ? (
        <p className="question-text muted">Chọn đáp án phù hợp cho chỗ trống ({label}) trong đoạn văn.</p>
      ) : null}

      <div className={`question-options ${hideOptionText ? 'is-compact' : ''}`} role="radiogroup" aria-label={`Question ${label}`}>
        {letters.map((letter) => (
          <label key={letter} className={`option ${chosen === letter ? 'is-chosen' : ''}`}>
            <input
              type="radio"
              name={`q-${q.no}`}
              value={letter}
              checked={chosen === letter}
              onChange={() => onChoose(q.no, letter)}
            />
            <span className="option-letter">{letter}</span>
            {!hideOptionText && <span className="option-text">{q.options[letter]}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Đề TOEIC Part 1, 2: chỉ hiện chữ cái */
export const hideOptionsFor = (content, q) => content.examType !== 'CUSTOM' && q.part <= 2;
