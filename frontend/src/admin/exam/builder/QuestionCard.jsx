// Thẻ một question trong trang soạn đề (kiểu biểu mẫu): xem gọn khi không chọn, soạn trực tiếp khi được chọn,
// chế độ "Đáp án" để chọn đáp án đúng + đặt điểm.
import { useState } from 'react';
import {
  clearReview, insertOptionAfter, isChoice, MAX_OPTIONS, MAX_POINTS, MIN_OPTIONS, QUESTION_TYPES, removeOptionAt,
} from '../../../utils/customExam.js';
import Icon, { IconButton } from './icons.jsx';
import { AutoText, DraftAudio, DraftImage, Menu, Switch } from './widgets.jsx';

const TYPE_ICON = { multiple_choice: 'radio', short_answer: 'shortText', paragraph: 'paragraph' };
const ALIGNS = [
  { id: 'left', label: 'Căn trái' },
  { id: 'center', label: 'Căn giữa' },
  { id: 'right', label: 'Căn phải' },
];

/** Question còn đánh dấu cần giáo viên xem lại (đáp án AI chưa xác nhận / có thể cần ảnh) */
export const needsReview = (q) => !!((q.review?.aiAnswer && q.answer) || (q.review?.needsImage && !q.image));

/** Câu đã có đáp án chưa (trả lời dài: chấm tay, không cần) */
function missingAnswer(q) {
  if (isChoice(q)) return !q.answer;
  if (q.type === 'short_answer') return q.othersWrong && !q.acceptedAnswers.some((a) => a.trim());
  return false;
}

export default function QuestionCard({ q, selected, answerMode, setAnswerMode, ctx, attachCode }) {
  const { readOnly, url } = ctx;
  const [showDesc, setShowDesc] = useState(!!q.description);
  const [showFeedback, setShowFeedback] = useState(!!q.explanation);
  const set = (patch) => ctx.saveQ(q.id, patch);
  const letters = Object.keys(q.options);
  const choice = isChoice(q);

  // ---------- Xem gọn (không được chọn) ----------
  if (!selected) {
    return (
      <>
        <QuestionHead q={q} />
        <p className={`fb-q-title ${q.question ? '' : 'is-empty'}`}>{q.question || 'Câu hỏi chưa có nội dung'}</p>
        {q.description && <p className="fb-q-desc">{q.description}</p>}
        <QuestionMedia q={q} url={url} />
        {choice ? (
          <ul className="fb-preview-options">
            {letters.map((l) => (
              <li key={l} className={q.answer === l ? 'is-correct' : ''}>
                <span className="fb-radio" aria-hidden="true" />
                <span className="fb-opt-letter">{l}</span>
                <span>{q.options[l] || <span className="muted">(trống)</span>}</span>
                {q.answer === l && (
                  <span className="fb-correct-mark" aria-label="Đáp án đúng">
                    <Icon name="check" />
                  </span>
                )}
                {q.optionImages?.[l] && <DraftImage name={q.optionImages[l]} url={url(q.optionImages[l])} className="fb-opt-thumb" />}
              </li>
            ))}
          </ul>
        ) : (
          <TextAnswerLine type={q.type} />
        )}
        <Warnings q={q} />
        {needsReview(q) && <p className="review-badge">Cần xem lại (từ lúc dán đề) — bấm vào để xử lý</p>}
      </>
    );
  }

  // ---------- Chế độ "Đáp án" ----------
  if (answerMode) {
    return (
      <>
        <div className="fb-key-head">
          <span className="fb-key-title">
            <Icon name="answerKey" /> Chọn câu trả lời đúng
          </span>
          <label className="fb-points">
            <input
              type="number"
              min="0"
              max={MAX_POINTS}
              value={q.points}
              onChange={(e) => set({ points: Math.min(Math.max(Number.parseInt(e.target.value, 10) || 0, 0), MAX_POINTS) })}
              aria-label="Số điểm của question"
            />
            điểm
          </label>
        </div>
        <p className="fb-q-title">{q.question || <span className="muted">(Câu hỏi chưa có nội dung)</span>}</p>
        <QuestionMedia q={q} url={url} />

        {choice && (
          <div className="fb-key-options" role="radiogroup" aria-label="Đáp án đúng">
            {letters.map((l) => {
              const on = q.answer === l;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`fb-key-opt ${on ? 'is-correct' : ''}`}
                  // Giáo viên tự chọn đáp án = đã xác nhận -> bỏ đánh dấu "AI gợi ý"
                  onClick={() => ctx.replaceQ(clearReview({ ...q, answer: l }, 'aiAnswer'))}
                >
                  <span className={`fb-radio ${on ? 'is-on' : ''}`} aria-hidden="true" />
                  <span className="fb-opt-letter">{l}</span>
                  <span className="fb-key-text">{q.options[l] || <span className="muted">(trống)</span>}</span>
                  {q.optionImages?.[l] && <DraftImage name={q.optionImages[l]} url={url(q.optionImages[l])} className="fb-opt-thumb" />}
                  {on && <Icon name="check" />}
                </button>
              );
            })}
          </div>
        )}

        {q.type === 'short_answer' && (
          <div className="fb-accepts">
            {q.acceptedAnswers.map((a, i) => (
              <div key={i} className="fb-accept">
                <input
                  className="fb-line-input"
                  value={a}
                  placeholder="Câu trả lời đúng"
                  data-focus={`acc:${q.id}:${i}`}
                  aria-label={`Câu trả lời đúng ${i + 1}`}
                  onChange={(e) => set({ acceptedAnswers: q.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)) })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      set({ acceptedAnswers: [...q.acceptedAnswers, ''] });
                      ctx.focus(`acc:${q.id}:${q.acceptedAnswers.length}`);
                    }
                  }}
                />
                <IconButton icon="close" label={`Xóa câu trả lời đúng ${i + 1}`} onClick={() => set({ acceptedAnswers: q.acceptedAnswers.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <button
              type="button"
              className="fb-link"
              onClick={() => {
                set({ acceptedAnswers: [...q.acceptedAnswers, ''] });
                ctx.focus(`acc:${q.id}:${q.acceptedAnswers.length}`);
              }}
            >
              Thêm câu trả lời đúng
            </button>
            <label className="checkbox-label fb-check">
              <input type="checkbox" checked={q.othersWrong} onChange={(e) => set({ othersWrong: e.target.checked })} />
              Đánh dấu các câu trả lời khác là sai
            </label>
            <p className="fb-hint">
              Học viên trả lời giống một câu ở trên (không phân biệt chữ hoa / thường, bỏ khoảng trắng thừa) là đúng.
              {!q.othersWrong && ' Câu trả lời khác: giáo viên chấm tay.'}
            </p>
          </div>
        )}

        {q.type === 'paragraph' && (
          <p className="fb-hint">Câu trả lời dài được giáo viên chấm tay sau khi học viên nộp bài. Số điểm ở trên là điểm tối đa của câu.</p>
        )}

        {showFeedback ? (
          <div className="fb-feedback">
            <label className="fb-sub-label" htmlFor={`fb-${q.id}`}>
              Phản hồi câu trả lời (hiện cho học viên sau khi nộp, nếu đề cho xem đáp án)
            </label>
            <AutoText id={`fb-${q.id}`} className="fb-boxed" minRows={2} value={q.explanation} onChange={(v) => set({ explanation: v })} />
          </div>
        ) : (
          <button type="button" className="fb-link" onClick={() => setShowFeedback(true)}>
            Thêm phản hồi câu trả lời
          </button>
        )}

        <div className="fb-footer">
          <span className="fb-spacer" />
          <button type="button" className="btn btn-primary btn-small" onClick={() => setAnswerMode(false)}>
            Xong
          </button>
        </div>
      </>
    );
  }

  // ---------- Soạn (được chọn) ----------
  const changeType = (type) => set({ type, ...(type === 'multiple_choice' ? {} : { answer: null }) });
  const addOption = (after) => {
    const r = insertOptionAfter(q, after);
    if (!r) return;
    set(r[0]);
    ctx.focus(`opt:${q.id}:${r[1]}`);
  };
  const removeOption = (l, focusPrev) => {
    const patch = removeOptionAt(q, l);
    if (!patch) return;
    set(patch);
    if (focusPrev) ctx.focus(`opt:${q.id}:${letters[Math.max(0, letters.indexOf(l) - 1)]}`);
  };

  return (
    <>
      <QuestionHead q={q} />
      <div className="fb-q-top">
        <AutoText
          className="fb-q-input"
          value={q.question}
          onChange={(v) => set({ question: v })}
          placeholder="Câu hỏi (có thể để trống nếu chỉ có ảnh / audio)"
          aria-label={`Nội dung question ${q.no}`}
          data-focus={`qtext:${q.id}`}
        />
        <IconButton
          icon="image"
          label="Chèn ảnh hoặc audio cho question"
          onClick={() => ctx.openPicker({ kinds: ['image', 'audio'], title: 'Chèn ảnh / audio cho question', onPick: (name, kind) => set(kind === 'image' ? { image: name } : { audio: name }) })}
        />
        <Menu
          label="Loại câu hỏi"
          align="right"
          items={QUESTION_TYPES.map((t) => ({ label: t.label, icon: TYPE_ICON[t.id], onClick: () => changeType(t.id) }))}
          button={({ open, toggle, menuId }) => (
            <button type="button" className="fb-type-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={toggle} aria-label="Loại câu hỏi">
              <Icon name={TYPE_ICON[q.type]} />
              <span>{QUESTION_TYPES.find((t) => t.id === q.type)?.label}</span>
              <Icon name="dropDown" />
            </button>
          )}
        />
      </div>

      {showDesc && (
        <AutoText className="fb-desc-input" value={q.description} onChange={(v) => set({ description: v })} placeholder="Mô tả" aria-label="Mô tả cho câu hỏi" />
      )}

      <QuestionMedia q={q} url={url} editable ctx={ctx} set={set} />

      {needsReview(q) && <ReviewBox q={q} ctx={ctx} />}

      {choice ? (
        <div className="fb-options">
          {letters.map((l, i) => (
            <div key={l} className="fb-opt-block">
              <div className="fb-opt">
                <span className="fb-radio" aria-hidden="true" />
                <span className="fb-opt-letter">{l}</span>
                <input
                  className="fb-opt-input"
                  value={q.options[l]}
                  placeholder={`Tùy chọn ${i + 1}`}
                  aria-label={`Lựa chọn ${l}`}
                  data-focus={`opt:${q.id}:${l}`}
                  onChange={(e) => set({ options: { ...q.options, [l]: e.target.value } })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOption(l);
                    } else if (e.key === 'Backspace' && !q.options[l] && !q.optionImages?.[l] && letters.length > MIN_OPTIONS) {
                      e.preventDefault();
                      removeOption(l, true);
                    }
                  }}
                />
                <IconButton
                  icon="image"
                  className="fb-opt-img-btn"
                  label={`Thêm ảnh cho lựa chọn ${l}`}
                  onClick={() => ctx.openPicker({ kinds: ['image'], title: `Ảnh cho lựa chọn ${l}`, onPick: (name) => set({ optionImages: { ...q.optionImages, [l]: name } }) })}
                />
                {q.answer === l && (
                  <span className="fb-correct-mark" title="Đáp án đúng" aria-label="Đáp án đúng">
                    <Icon name="check" />
                  </span>
                )}
                {letters.length > MIN_OPTIONS && <IconButton icon="close" label={`Xóa lựa chọn ${l}`} onClick={() => removeOption(l)} />}
              </div>
              {q.optionImages?.[l] && (
                <div className="fb-opt-image">
                  <DraftImage name={q.optionImages[l]} url={url(q.optionImages[l])} />
                  <IconButton
                    icon="close"
                    label={`Xóa ảnh của lựa chọn ${l}`}
                    onClick={() => {
                      const { [l]: _x, ...rest } = q.optionImages; // eslint-disable-line no-unused-vars
                      set({ optionImages: rest });
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          {letters.length < MAX_OPTIONS ? (
            <div className="fb-opt fb-opt-add">
              <span className="fb-radio" aria-hidden="true" />
              <button type="button" className="fb-add-option" onClick={() => addOption(null)}>
                Thêm tùy chọn
              </button>
            </div>
          ) : (
            <p className="fb-hint">Tối đa {MAX_OPTIONS} lựa chọn (A–F).</p>
          )}
        </div>
      ) : (
        <TextAnswerLine type={q.type} />
      )}

      <Warnings q={q} />

      <div className="fb-footer">
        <button type="button" className="fb-key-link" onClick={() => setAnswerMode(true)} data-tour="answer-key">
          <Icon name="answerKey" /> Đáp án
        </button>
        <span className="muted">({q.points} điểm)</span>
        <span className="fb-spacer" />
        <IconButton icon="copy" label="Nhân bản question" onClick={() => ctx.duplicate(`q:${q.id}`)} />
        <IconButton icon="delete" label="Xóa question" onClick={() => ctx.remove(`q:${q.id}`)} />
        <span className="fb-divider" aria-hidden="true" />
        <Switch label="Bắt buộc" checked={q.required} onChange={(v) => set({ required: v })} />
        <Menu
          label="Tùy chọn khác của question"
          items={[
            {
              label: 'Thêm mô tả cho câu hỏi',
              checked: showDesc,
              onClick: () => {
                if (showDesc) set({ description: '' });
                else ctx.focusLater('.fb-desc-input');
                setShowDesc(!showDesc);
              },
            },
            choice && { label: 'Xáo trộn thứ tự lựa chọn', checked: q.shuffleOptions, onClick: () => set({ shuffleOptions: !q.shuffleOptions }) },
            q.groupCode && { label: 'Tách khỏi khối ở trên', onClick: () => ctx.detach(q.id) },
            !q.groupCode && attachCode && { label: 'Gắn vào khối ở trên', onClick: () => set({ groupCode: attachCode }) },
          ]}
        />
      </div>
    </>
  );
}

function QuestionHead({ q }) {
  return (
    <p className="fb-q-no">
      Question {q.no}
      {q.required && (
        <span className="fb-required" title="Bắt buộc">
          {' '}*
        </span>
      )}
    </p>
  );
}

/** Dòng gạch "Văn bản câu trả lời ngắn / dài" (học viên gõ vào đây) */
function TextAnswerLine({ type }) {
  return <p className={`fb-text-answer ${type === 'paragraph' ? 'is-long' : ''}`}>{type === 'paragraph' ? 'Văn bản câu trả lời dài' : 'Văn bản câu trả lời ngắn'}</p>;
}

function Warnings({ q }) {
  return (
    <>
      {missingAnswer(q) && (
        <p className="fb-warning" role="note">
          <Icon name="error" size={18} />
          {isChoice(q) ? 'Chưa chọn đáp án đúng — bấm "Đáp án" để chọn.' : 'Chưa có câu trả lời đúng — bấm "Đáp án" để thêm.'}
        </p>
      )}
      {!isChoice(q) && (
        <p className="fb-note">Loại câu này chưa xuất bản được cho học viên (sẽ có ở bản cập nhật tới).</p>
      )}
    </>
  );
}

/** Ảnh + audio của question. editable: có menu căn lề / thay đổi / xóa */
function QuestionMedia({ q, url, editable = false, ctx, set }) {
  if (!q.image && !q.audio) return null;
  return (
    <>
      {q.image && (
        <div className={`fb-media fb-align-${q.imageAlign || 'left'}`}>
          <div className="fb-media-inner">
            <DraftImage name={q.image} url={url(q.image)} className="fb-q-image" alt={`Ảnh question ${q.no}`} />
            {editable && (
              <div className="fb-media-menu">
                <Menu
                  label="Tùy chọn ảnh"
                  align="left"
                  items={[
                    ...ALIGNS.map((a) => ({ label: a.label, checked: (q.imageAlign || 'left') === a.id, onClick: () => set({ imageAlign: a.id }) })),
                    { label: 'Thay đổi', onClick: () => ctx.openPicker({ kinds: ['image'], title: 'Đổi ảnh của question', onPick: (name) => set({ image: name }) }) },
                    { label: 'Xoá', onClick: () => set({ image: null }) },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {q.audio && (
        <div className="fb-audio-row">
          <DraftAudio name={q.audio} url={url(q.audio)} />
          {editable && <IconButton icon="close" label="Xóa audio của question" onClick={() => set({ audio: null })} />}
        </div>
      )}
    </>
  );
}

/** Đánh dấu cần xem lại sau khi dán đề (AI gợi ý đáp án / có thể cần ảnh) */
function ReviewBox({ q, ctx }) {
  return (
    <div className="review-box" role="status">
      <strong>Cần xem lại (từ lúc dán đề)</strong>
      {q.review?.aiAnswer && q.answer && (
        <p>
          Đáp án <strong>{q.answer}</strong> do AI gợi ý. Kiểm tra lại: đúng thì bấm "Xác nhận", sai thì bấm "Đáp án" ở dưới để chọn lại.{' '}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => ctx.replaceQ(clearReview(q, 'aiAnswer'))}>
            Xác nhận đáp án {q.answer}
          </button>
        </p>
      )}
      {q.review?.needsImage && !q.image && (
        <p>
          Có thể cần ảnh: {q.review.needsImage}. Bấm biểu tượng ảnh cạnh ô câu hỏi để thêm, hoặc nếu không cần ảnh thì{' '}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => ctx.replaceQ(clearReview(q, 'needsImage'))}>
            Không cần ảnh
          </button>
        </p>
      )}
    </div>
  );
}
