import { questionsByPart } from '../utils/examLayout.js';

// Bảng số câu: đã làm / chưa làm / cần xem lại. Bấm số để nhảy tới câu đó.
// Số hiện trên nút là số câu học viên thấy (đề xáo trộn có thể khác số gốc).
export default function QuestionNav({ content, answers, flagged, currentNos, onSelect }) {
  const flaggedSet = new Set(flagged);
  const current = new Set(currentNos);

  return (
    <div className="qnav">
      <div className="qnav-legend">
        <span><span className="qnav-swatch is-answered" aria-hidden="true" /> Đã làm</span>
        <span><span className="qnav-swatch" aria-hidden="true" /> Chưa làm</span>
        <span><span className="qnav-swatch is-flagged" aria-hidden="true" /> Cần xem lại</span>
      </div>
      {questionsByPart(content).map(([part, name, items]) => (
        <div key={part} className="qnav-part">
          <p className="qnav-part-title">{name}</p>
          <div className="qnav-grid">
            {items.map(({ no, label }) => {
              const cls = [
                'qnav-btn',
                answers[no] ? 'is-answered' : '',
                flaggedSet.has(no) ? 'is-flagged' : '',
                current.has(no) ? 'is-current' : '',
              ].join(' ');
              const state = [answers[no] ? 'đã làm' : 'chưa làm', flaggedSet.has(no) ? 'cần xem lại' : '']
                .filter(Boolean)
                .join(', ');
              return (
                <button key={no} type="button" className={cls} onClick={() => onSelect(no)} aria-label={`Question ${label}: ${state}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
