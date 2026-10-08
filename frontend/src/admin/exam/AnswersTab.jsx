import { useMemo, useState } from 'react';
import { parseAnswerText } from '../../utils/answerParser.js';
import { lettersForPart, STANDARD_PARTS, standardPart, updateQuestion, emptyQuestion } from '../../utils/examStructure.js';

// Tab "Nhập nhanh đáp án": lưới 200 câu bấm A/B/C/D + ô dán chuỗi đáp án.
// Câu chưa có trong đề sẽ được tạo (ví dụ Part 1, 2 chỉ cần đáp án).
export default function AnswersTab({ readOnly, content, updateContent }) {
  const answers = useMemo(() => Object.fromEntries(content.questions.map((q) => [q.no, q.answer])), [content]);
  const total = Object.values(answers).filter(Boolean).length;

  function setAnswer(no, letter) {
    // Bấm lại đúng chữ đang chọn thì bỏ chọn
    const next = updateQuestion(content, no, (q) => ({ answer: q.answer === letter ? null : letter }));
    updateContent(next, { src: 'answers' });
  }

  return (
    <>
      <PasteBox readOnly={readOnly} content={content} updateContent={updateContent} />

      <section className="admin-section">
        <h2 className="admin-section-title">Bấm chọn đáp án ({total}/200 câu đã có đáp án)</h2>
        <p className="field-hint">Bấm vào chữ cái để chọn; bấm lại lần nữa để bỏ. Thay đổi được tự động lưu.</p>
        <fieldset className="answer-grid-wrap" disabled={readOnly}>
          {STANDARD_PARTS.map((p) => (
            <div key={p.part} className="card answer-part-card">
              <h3 className="answer-part-name">
                Part {p.part} – {p.name} <span className="muted">(câu {p.from}–{p.to})</span>
              </h3>
              <div className="answer-grid">
                {Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i).map((no) => (
                  <div key={no} className={`answer-cell ${answers[no] ? 'has-answer' : ''}`}>
                    <span className="answer-cell-no">{no}</span>
                    {lettersForPart(p.part).map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={`answer-letter ${answers[no] === l ? 'is-on' : ''}`}
                        onClick={() => setAnswer(no, l)}
                        aria-pressed={answers[no] === l}
                        aria-label={`Câu ${no} đáp án ${l}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      </section>
    </>
  );
}

function PasteBox({ readOnly, content, updateContent }) {
  const [text, setText] = useState('');
  const [startNo, setStartNo] = useState('101');
  const [parsed, setParsed] = useState(null);

  const hasNumbers = /\d/.test(text);

  function preview() {
    setParsed(parseAnswerText(text, Number(startNo) || 1));
  }

  function apply() {
    let next = content;
    for (const [no, letter] of Object.entries(parsed.answers)) {
      const n = Number(no);
      if (!next.questions.some((q) => q.no === n)) {
        next = { ...next, questions: [...next.questions, { ...emptyQuestion(n, next.groups), answer: letter }] };
      } else {
        next = { ...next, questions: next.questions.map((q) => (q.no === n ? { ...q, answer: letter } : q)) };
      }
    }
    next = { ...next, questions: [...next.questions].sort((a, b) => a.no - b.no) };
    updateContent(next, { src: 'answers', immediate: true });
    setText('');
    setParsed(null);
  }

  const count = parsed ? Object.keys(parsed.answers).length : 0;
  const nos = parsed ? Object.keys(parsed.answers).map(Number) : [];
  // Đếm bao nhiêu câu sẽ bị đổi đáp án đã có
  const changed = parsed
    ? nos.filter((n) => {
        const q = content.questions.find((x) => x.no === n);
        return q?.answer && q.answer !== parsed.answers[n];
      }).length
    : 0;

  return (
    <section className="admin-section">
      <div className="card">
        <h2 className="admin-section-title">Dán chuỗi đáp án</h2>
        <p className="field-hint paste-hint">
          Hai cách viết: có số câu, ví dụ <code>101A 102C 103B</code> (mỗi câu cách nhau bằng dấu cách hoặc xuống dòng — dán
          nguyên danh sách đáp án từ nơi khác cũng được), hoặc chỉ có chữ cái, ví dụ <code>ACBDDCBA…</code> kèm số câu bắt đầu.
        </p>
        <fieldset disabled={readOnly} className="paste-fieldset">
          <textarea
            className="input textarea paste-area"
            rows={5}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParsed(null);
            }}
            placeholder="Ví dụ: 101A 102C 103B …"
          />
          {!hasNumbers && text.trim() && (
            <div className="field paste-start">
              <label htmlFor="paste-start">Chữ cái đầu tiên là đáp án của câu số</label>
              <input id="paste-start" className="input" type="number" min="1" max="200" value={startNo} onChange={(e) => setStartNo(e.target.value)} />
            </div>
          )}
          <div className="admin-form-actions">
            <button type="button" className="btn btn-secondary" onClick={preview} disabled={!text.trim()}>
              Xem trước
            </button>
          </div>
        </fieldset>

        {parsed && (
          <div className="paste-result">
            {parsed.errors.length > 0 && (
              <div className="check-result has-errors">
                <p><strong>{parsed.errors.length} chỗ không đọc được (sẽ bị bỏ qua):</strong></p>
                <ul>{parsed.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            {count > 0 ? (
              <>
                <p>
                  Đọc được <strong>{count}</strong> đáp án (câu {Math.min(...nos)}–{Math.max(...nos)}).
                  {changed > 0 && <span className="text-warn"> {changed} câu đã có đáp án sẽ bị thay.</span>}
                </p>
                <p className="paste-sample muted">
                  {nos.slice(0, 20).map((n) => `${n}${parsed.answers[n]}`).join('  ')}
                  {nos.length > 20 ? '  …' : ''}
                </p>
                {nos.some((n) => standardPart(n) === null) ? null : (
                  <button type="button" className="btn btn-primary" onClick={apply} disabled={readOnly}>
                    Áp dụng {count} đáp án
                  </button>
                )}
              </>
            ) : (
              <p className="alert-error">Không đọc được đáp án nào. Hãy kiểm tra lại cách viết.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
