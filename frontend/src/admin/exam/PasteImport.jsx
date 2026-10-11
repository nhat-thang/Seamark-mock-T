import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import { appendPasted } from '../../utils/customExam.js';
import { htmlIsUseful, htmlToPasteText, imageReasonOf, IMAGE_MARK, parsePastedExam } from '../../utils/pasteParser.js';

const MAX_TOTAL = 300; // giống giới hạn số question của đề tự thiết kế (contentSchema.js)
const CHUNK_ITEMS = 25; // mỗi lần gửi AI tối đa 25 question
const CHUNK_CHARS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXAMPLE = `1. She ___ to school every day.
A. go
B. goes
C. going
D. gone
Đáp án: B

2. I have lived here ___ 2010.   A. for   B. since   C. in   D. at

(Hoặc để bảng đáp án ở cuối đề:)
ĐÁP ÁN
1B 2B`;

/**
 * Khung "Dán đề" của trang soạn đề tự thiết kế.
 * Bước 1: dán chữ -> máy tự tách question.  Bước 2: xem trước, AI kiểm tra (nếu có), giáo viên chỉnh -> Áp dụng.
 * Không ghi gì vào đề cho tới khi bấm "Áp dụng" (khi đó lưu qua đường lưu bản nháp như mọi thay đổi khác).
 */
export default function PasteImport({ content, onApply, onCancel }) {
  const [text, setText] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  // Đề chưa có question nào -> dán thẳng vào Part 1 (không tạo thêm part, để thừa Part 1 trống)
  const [target, setTarget] = useState(content.questions.length === 0 ? '1' : 'new');
  const [parsed, setParsed] = useState(null); // kết quả tách đề (bước 2)
  const [items, setItems] = useState([]); // lựa chọn của giáo viên cho từng question: { include, answer, source }
  const [aiStatus, setAiStatus] = useState(null);
  const [ai, setAi] = useState({ running: false, done: 0, total: 0, error: '', results: {} });
  const [onlyReview, setOnlyReview] = useState(false);
  const textRef = useRef(null);
  const stopRef = useRef(false);

  useEffect(() => {
    apiGet('/admin/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false }));
    return () => {
      stopRef.current = true; // rời trang thì dừng gọi AI
    };
  }, []);

  // ----- Bước 1: dán -----
  function handlePaste(e) {
    // Copy từ web / Word: dùng bản có định dạng để biết chỗ nào có ảnh, danh sách đánh số
    const html = e.clipboardData?.getData('text/html');
    if (!htmlIsUseful(html)) return; // để trình duyệt dán chữ như bình thường
    e.preventDefault();
    const pasted = htmlToPasteText(html);
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + pasted + text.slice(end));
  }

  function split() {
    const r = parsePastedExam(text, { answerKey });
    setParsed(r);
    setItems(r.questions.map((q) => ({ include: true, answer: q.answer, source: q.answer ? q.answerFrom : null })));
    setAi({ running: false, done: 0, total: 0, error: '', results: {} });
    setOnlyReview(false);
    if (!r.errors.length && aiStatus?.configured) runAi(r);
  }

  // ----- Bước 2: AI kiểm tra (chia đợt, gọi lần lượt) -----
  async function runAi(r = parsed) {
    stopRef.current = false;
    const chunks = makeChunks(r);
    setAi({ running: true, done: 0, total: r.questions.length, error: '', results: {} });
    let results = {};
    for (const chunk of chunks) {
      if (stopRef.current) break;
      try {
        const res = await apiPost('/admin/ai/check', chunk.body);
        results = { ...results, ...res.results };
        const got = res.results;
        // Question chưa có đáp án -> điền đáp án AI gợi ý (giáo viên vẫn phải xác nhận)
        setItems((cur) =>
          cur.map((it, i) =>
            !it.answer && got[i]?.suggestedAnswer ? { ...it, answer: got[i].suggestedAnswer, source: 'ai' } : it
          )
        );
        setAi((cur) => ({ ...cur, done: cur.done + chunk.count, results }));
      } catch (err) {
        setAi((cur) => ({ ...cur, running: false, error: err.message }));
        return;
      }
      await sleep(1500); // giãn cách để không vượt giới hạn số lần gọi mỗi phút của gói miễn phí
    }
    setAi((cur) => ({ ...cur, running: false }));
    apiGet('/admin/ai/status').then(setAiStatus).catch(() => {});
  }

  // ----- Thông tin từng question sau khi gộp kết quả máy tách + AI + giáo viên -----
  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.questions.map((q, i) => {
      const aiRes = ai.results[i] || null;
      const it = items[i] || { include: true, answer: q.answer, source: q.answerFrom };
      const needsImage = imageReasonOf(q, aiRes);
      const errors = q.flags.filter((f) => f.level === 'error');
      const doubt = aiRes?.answerDoubt && it.source !== 'manual';
      const review = !!needsImage || errors.length > 0 || it.source === 'ai' || !it.answer || doubt || (aiRes?.issues || []).length > 0
        || q.flags.some((f) => f.level === 'warn');
      return { q, i, it, aiRes, needsImage, errors, doubt, review };
    });
  }, [parsed, items, ai.results]);

  const setItem = (i, patch) => setItems((cur) => cur.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const included = rows.filter((r) => r.it.include);
  const counts = {
    image: included.filter((r) => r.needsImage).length,
    aiAnswer: included.filter((r) => r.it.source === 'ai').length,
    noAnswer: included.filter((r) => !r.it.answer).length,
    errors: included.filter((r) => r.errors.length).length,
  };
  const overLimit = content.questions.length + included.length > MAX_TOTAL;

  function apply() {
    if (!included.length) return;
    const notes = [];
    if (counts.image) notes.push(`${counts.image} question có thể cần ảnh`);
    if (counts.aiAnswer) notes.push(`${counts.aiAnswer} đáp án do AI gợi ý`);
    if (counts.noAnswer) notes.push(`${counts.noAnswer} question chưa có đáp án`);
    if (counts.errors) notes.push(`${counts.errors} question bị lỗi (thiếu / sai lựa chọn)`);
    const where = target === 'new' ? 'một part mới' : `"${content.parts[target - 1]?.name}"`;
    const msg = `Thêm ${included.length} question vào ${where}?${notes.length ? `\n\nCòn: ${notes.join(', ')}.\nCác question này được đánh dấu để bạn xử lý tiếp trong trang soạn đề; đề chưa xuất bản được tới khi xử lý xong.` : ''}`;
    if (!window.confirm(msg)) return;
    stopRef.current = true;
    const payload = included.map(({ q, it, needsImage }) => ({
      question: q.question,
      options: Object.keys(q.options).length ? q.options : { A: '', B: '', C: '', D: '' },
      answer: it.answer,
      aiAnswer: it.source === 'ai',
      explanation: q.explanation,
      group: q.group,
      needsImage,
    }));
    const [next, firstId, partNo] = appendPasted(content, target === 'new' ? 'new' : Number(target), payload, parsed.groups.map((g) => g.passage));
    onApply(next, firstId, partNo);
  }

  // ================= Giao diện =================
  if (!parsed) {
    return (
      <div className="paste">
        <div className="qedit-head">
          <h2 className="admin-section-title">Dán đề có sẵn</h2>
          <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Đóng</button>
        </div>
        <ol className="paste-steps">
          <li>Mở đề có sẵn (trang web, Word, PDF), bấm <kbd>Ctrl</kbd> + <kbd>A</kbd> rồi <kbd>Ctrl</kbd> + <kbd>C</kbd> để copy.</li>
          <li>Bấm vào ô bên dưới, bấm <kbd>Ctrl</kbd> + <kbd>V</kbd> để dán, rồi bấm <strong>"Tách đề"</strong>.</li>
          <li>Máy tự tách question, lựa chọn, đáp án, đoạn văn đọc hiểu. {aiStatus?.configured ? 'Sau đó AI kiểm tra lại và gợi ý đáp án.' : ''} Bạn xem lại rồi bấm <strong>"Áp dụng"</strong>.</li>
        </ol>
        <p className="field-hint">
          Ảnh và audio <strong>không</strong> đi theo khi copy chữ. Question nào có vẻ cần ảnh sẽ được đánh dấu để bạn tải ảnh lên sau.
        </p>

        <div className="field">
          <label htmlFor="paste-text">Nội dung đề</label>
          <textarea
            id="paste-text"
            ref={textRef}
            className="input textarea paste-text"
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            placeholder={EXAMPLE}
          />
          {text.includes(IMAGE_MARK) && (
            <p className="field-hint">Chỗ ghi <code>{IMAGE_MARK}</code> là chỗ bản gốc có ảnh. Cứ để nguyên, máy sẽ đánh dấu question ở đó.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="paste-key">Bảng đáp án (nếu đề để đáp án riêng ở chỗ khác — có thể để trống)</label>
          <textarea id="paste-key" className="input textarea" rows={2} value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} placeholder="Ví dụ: 1A 2C 3B 4D …  hoặc  ACBD…" />
        </div>

        <div className="field">
          <label htmlFor="paste-target">Thêm vào</label>
          <select id="paste-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">Một part mới (cuối đề)</option>
            {content.parts.map((p, i) => (
              <option key={i} value={i + 1}>Cuối "{p.name || `Part ${i + 1}`}"</option>
            ))}
          </select>
        </div>

        <div className="admin-form-actions">
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={split}>
            Tách đề
          </button>
          {aiStatus && !aiStatus.configured && <span className="muted small-text">Chưa cài AI cho web — vẫn tách đề được, chỉ không có bước AI kiểm tra.</span>}
        </div>
      </div>
    );
  }

  const shown = onlyReview ? rows.filter((r) => r.review) : rows;
  return (
    <div className="paste">
      <div className="qedit-head">
        <h2 className="admin-section-title">Kết quả tách đề</h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { stopRef.current = true; setParsed(null); }}>
            Quay lại sửa chữ
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Đóng</button>
        </div>
      </div>

      {parsed.errors.map((e) => (
        <p key={e} className="alert-error admin-message" role="alert">{e}</p>
      ))}

      {rows.length > 0 && (
        <>
          <div className="paste-summary">
            <span>Tách được <strong>{rows.length}</strong> question{parsed.groups.length ? <>, <strong>{parsed.groups.length}</strong> đoạn văn đọc hiểu</> : null}.</span>
            {counts.errors > 0 && <span className="text-error">{counts.errors} question lỗi</span>}
            {counts.image > 0 && <span className="paste-tag tag-image">{counts.image} có thể cần ảnh</span>}
            {counts.aiAnswer > 0 && <span className="paste-tag tag-ai">{counts.aiAnswer} đáp án AI gợi ý</span>}
            {counts.noAnswer > 0 && <span className="paste-tag tag-warn">{counts.noAnswer} chưa có đáp án</span>}
          </div>

          <AiBar aiStatus={aiStatus} ai={ai} onRun={() => runAi()} onStop={() => { stopRef.current = true; }} />

          <label className="checkbox-label paste-filter">
            <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
            Chỉ hiện question cần xem lại ({rows.filter((r) => r.review).length})
          </label>

          <div className="paste-list">
            {shown.map((r) => (
              <PreviewRow key={r.i} row={r} parsed={parsed} showPassage={r.q.group !== null && (r.i === 0 || parsed.questions[r.i - 1].group !== r.q.group)} setItem={setItem} />
            ))}
          </div>

          {parsed.ignored.length > 0 && (
            <details className="paste-ignored">
              <summary>{parsed.ignored.length} dòng không thuộc question nào (tiêu đề, lời dặn…) — đã bỏ qua</summary>
              <pre>{parsed.ignored.join('\n')}</pre>
            </details>
          )}

          {overLimit && <p className="alert-error admin-message">Đề tối đa {MAX_TOTAL} question. Bỏ bớt question (bỏ tích "Đưa vào đề") hoặc chia đề.</p>}
          <div className="admin-form-actions paste-apply">
            <button type="button" className="btn btn-primary" disabled={!included.length || overLimit || ai.running} onClick={apply}>
              Áp dụng {included.length} question
            </button>
            {ai.running && <span className="muted small-text">Chờ AI kiểm tra xong (hoặc bấm "Dừng AI") rồi áp dụng.</span>}
          </div>
        </>
      )}
    </div>
  );
}

/** Thanh trạng thái AI kiểm tra */
function AiBar({ aiStatus, ai, onRun, onStop }) {
  if (!aiStatus) return null;
  if (!aiStatus.configured) {
    return <p className="paste-ai muted small-text">Chưa cài AI cho web (thêm AI_API_KEY vào file .env trên máy chủ). Bạn tự xem lại các question được đánh dấu bên dưới.</p>;
  }
  return (
    <div className="paste-ai">
      {ai.running ? (
        <>
          <span>AI đang kiểm tra… {ai.done}/{ai.total} question</span>
          <progress max={ai.total || 1} value={ai.done} />
          <button type="button" className="btn btn-secondary btn-small" onClick={onStop}>Dừng AI</button>
        </>
      ) : ai.error ? (
        <>
          <span className="text-error">AI dừng giữa chừng: {ai.error}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={onRun}>Thử lại</button>
        </>
      ) : ai.done > 0 ? (
        <span className="text-success">AI đã kiểm tra {ai.done}/{ai.total} question. Gợi ý của AI nằm trong khung xanh, bắt đầu bằng "AI".</span>
      ) : (
        <button type="button" className="btn btn-secondary btn-small" onClick={onRun}>Kiểm tra bằng AI</button>
      )}
      <span className="muted small-text paste-ai-usage">Hôm nay đã dùng {aiStatus.callsToday}/{aiStatus.dailyLimit} lượt AI.</span>
    </div>
  );
}

const SOURCE_LABEL = { text: 'có sẵn trong đề', key: 'từ bảng đáp án', ai: 'AI gợi ý — cần xác nhận', manual: 'bạn chọn' };

/** Một question trong bảng xem trước */
function PreviewRow({ row, parsed, showPassage, setItem }) {
  const { q, i, it, aiRes, needsImage, errors, doubt } = row;
  const letters = Object.keys(q.options);
  const group = q.group !== null ? parsed.groups[q.group] : null;
  return (
    <>
      {showPassage && (
        <details className="paste-passage">
          <summary>Đoạn văn đọc hiểu (đi cùng các question bên dưới)</summary>
          <pre>{group.passage}</pre>
        </details>
      )}
      <div className={`paste-item ${it.include ? '' : 'is-excluded'} ${row.review ? 'needs-review' : ''}`}>
        <div className="paste-item-head">
          <label className="checkbox-label">
            <input type="checkbox" checked={it.include} onChange={(e) => setItem(i, { include: e.target.checked })} />
            <strong>Question {i + 1}</strong>
            <span className="muted small-text"> (số {q.srcNo} trong đề gốc{group ? ', thuộc đoạn văn' : ''})</span>
          </label>
        </div>
        {q.question && <p className="paste-q">{q.question}</p>}

        <div className="paste-options">
          {letters.map((l) => (
            <button
              key={l}
              type="button"
              className={`paste-option ${it.answer === l ? `is-answer ${it.source === 'ai' ? 'by-ai' : ''}` : ''}`}
              onClick={() => setItem(i, { answer: l, source: 'manual' })}
              title="Bấm để chọn làm đáp án đúng"
            >
              <span className="option-letter">{l}</span> {q.options[l] || <em className="muted">(trống)</em>}
            </button>
          ))}
        </div>
        <p className="small-text muted">
          {it.answer ? <>Đáp án: <strong>{it.answer}</strong> ({SOURCE_LABEL[it.source] || ''}). </> : 'Chưa có đáp án. '}
          Bấm vào một lựa chọn để chọn làm đáp án.
        </p>

        <ul className="paste-flags">
          {errors.map((f) => <li key={f.text} className="flag-error">{f.text}</li>)}
          {q.flags.filter((f) => f.level === 'warn').map((f) => <li key={f.text} className="flag-warn">{f.text}</li>)}
          {needsImage && <li className="flag-image">Có thể cần ảnh: {needsImage}. Áp dụng xong, mở question này để tải ảnh lên (hoặc bấm "Không cần ảnh").</li>}
          {doubt && (
            <li className="flag-ai">
              AI cho rằng đáp án {it.answer} có thể sai{aiRes.answerReason ? `: ${aiRes.answerReason}` : '.'}
              {aiRes.suggestedAnswer && aiRes.suggestedAnswer !== it.answer && (
                <> AI gợi ý <strong>{aiRes.suggestedAnswer}</strong>.{' '}
                  <button type="button" className="btn btn-link small-text" onClick={() => setItem(i, { answer: aiRes.suggestedAnswer, source: 'manual' })}>Dùng {aiRes.suggestedAnswer}</button>
                  <button type="button" className="btn btn-link small-text" onClick={() => setItem(i, { source: 'manual' })}>Giữ {it.answer}</button>
                </>
              )}
            </li>
          )}
          {(aiRes?.issues || []).map((s) => <li key={s} className="flag-ai">AI: {s}</li>)}
        </ul>
      </div>
    </>
  );
}

/** Chia các question thành từng đợt gửi AI (kèm đoạn văn của nhóm, mỗi đoạn văn gửi một lần trong đợt) */
function makeChunks(parsed) {
  const chunks = [];
  let cur = null;
  parsed.questions.forEach((q, i) => {
    const item = { key: String(i), question: q.question, options: q.options, answer: q.answer, passageKey: q.group === null ? null : `p${q.group}` };
    const passage = q.group === null ? '' : parsed.groups[q.group].passage;
    const size = JSON.stringify(item).length + (cur && item.passageKey && cur.body.passages[item.passageKey] !== undefined ? 0 : passage.length);
    if (!cur || cur.body.items.length >= CHUNK_ITEMS || cur.size + size > CHUNK_CHARS) {
      cur = { body: { items: [], passages: {} }, size: 0, count: 0 };
      chunks.push(cur);
    }
    cur.body.items.push(item);
    if (item.passageKey) cur.body.passages[item.passageKey] = passage;
    cur.size += size;
    cur.count += 1;
  });
  return chunks;
}
