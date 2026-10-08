import { useEffect, useState } from 'react';
import PassageText from '../../components/PassageText.jsx';
import {
  addGroup, addOption, addPart, addQuestions, addQuestionsToGroup, deleteGroup, deletePart, deleteQuestion, deleteQuestions,
  MAX_ADD_AT_ONCE, MAX_OPTIONS, MIN_OPTIONS, moveInGroup, movePart, moveUnit, questionSummary, removeOption, renumber,
  unitKeyOf, unitsOfPart, updateGroup, updatePart, updateQuestionById,
} from '../../utils/customExam.js';
import { mediaKind, sameFile } from '../../utils/fileRefs.js';
import { useAdmin, useMarkTourDone } from '../AdminLayout.jsx';
import Tour from '../Tour.jsx';
import { FileSelect, UploadButton } from './FileSelect.jsx';

const TOUR_NAME = 'custom-builder';

// Các bước hướng dẫn (chỉ vào phần tử có data-tour tương ứng)
const TOUR_STEPS = [
  { target: 'outline', title: 'Dàn ý đề', text: 'Đây là dàn ý đề: các part và question theo đúng thứ tự học viên sẽ làm. Bấm vào một dòng để soạn nội dung ở khung bên phải.' },
  { target: 'part-title', title: 'Part của đề', text: 'Bấm vào tên part để đổi tên (ví dụ "Part 1 – Listening"), viết lời dặn và gắn audio cho cả part. Tên và lời dặn hiện cho học viên trước question đầu tiên của part.' },
  { target: 'add-question', title: 'Thêm question', text: 'Gõ số lượng rồi bấm để thêm một hoặc nhiều question cùng lúc. Question có thể chỉ có chữ, hoặc kèm ảnh, kèm audio, với 2 đến 6 lựa chọn.' },
  { target: 'add-group', title: 'Nhóm đọc hiểu', text: 'Thêm một đoạn văn (gõ chữ, ảnh chụp hoặc audio) đi kèm nhiều question. Học viên thấy đoạn văn bên cạnh các question.' },
  { target: 'add-part', title: 'Thêm part', text: 'Chia đề thành nhiều part, ví dụ Part 1 – Vocabulary, Part 2 – Reading. Số question được đánh tự động.' },
  { target: 'outline', title: 'Xóa nhiều question', text: 'Tích vào ô vuông ở đầu các dòng question (hoặc "Chọn tất cả") rồi bấm "Xóa các question đã chọn" để xóa nhiều question cùng lúc.' },
  { target: 'editor', title: 'Khung soạn', text: 'Soạn nội dung ở đây: question, ảnh, audio, các lựa chọn, và bấm "Đáp án đúng" ở lựa chọn đúng. Mọi thay đổi được tự động lưu.' },
  { target: 'tab-info', title: 'Xáo trộn question', text: 'Ở tab "Thông tin đề": đặt thời gian làm bài, và bật "Xáo trộn question" để mỗi học viên làm theo một thứ tự khác nhau.' },
  { target: 'preview', title: 'Xem trước', text: 'Bấm "Xem trước" để làm thử đề giống hệt học viên.' },
  { target: 'tab-publish', title: 'Xuất bản', text: 'Soạn xong, vào "Kiểm tra & xuất bản" để kiểm tra lỗi và mở đề cho học viên. Cần xem lại hướng dẫn này: bấm "Xem lại hướng dẫn" ở đầu dàn ý.' },
];

// Tab "Soạn đề" của đề tự thiết kế
export default function CustomBuilderTab(props) {
  const { readOnly, content, updateContent } = props;
  const admin = useAdmin();
  const markTourDone = useMarkTourDone();
  const [selected, setSelected] = useState({ type: 'part', no: 1 });
  const [showTour, setShowTour] = useState(false);
  const [checked, setChecked] = useState(() => new Set()); // id các question được tích để xóa hàng loạt

  // Lần đầu admin vào đây: tự hiện hướng dẫn
  useEffect(() => {
    if (!(admin.toursDone || []).includes(TOUR_NAME)) {
      const t = setTimeout(() => setShowTour(true), 400); // chờ giao diện hiện xong
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bỏ tích những question không còn (đã bị xóa ở chỗ khác)
  useEffect(() => {
    const ids = new Set(content.questions.map((q) => q.id));
    setChecked((cur) => ([...cur].every((id) => ids.has(id)) ? cur : new Set([...cur].filter((id) => ids.has(id)))));
  }, [content.questions]);

  function closeTour() {
    setShowTour(false);
    markTourDone(TOUR_NAME);
  }

  const save = (next) => updateContent(next, { src: 'editor' });

  const toggleCheck = (id) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = content.questions.length > 0 && checked.size === content.questions.length;

  function deleteChecked() {
    const n = checked.size;
    if (!window.confirm(`Xóa ${n} question đã chọn? Không khôi phục được.`)) return;
    if (selected.type === 'question' && checked.has(selected.id)) setSelected({ type: 'part', no: 1 });
    save(deleteQuestions(content, checked));
    setChecked(new Set());
  }

  return (
    <div className="builder">
      <aside className="card builder-outline" data-tour="outline">
        <div className="builder-outline-head">
          <strong>Dàn ý đề ({content.questions.length} question)</strong>
          <button type="button" className="btn btn-link small-text" onClick={() => setShowTour(true)}>
            Xem lại hướng dẫn
          </button>
        </div>

        {/* Thanh xóa hàng loạt */}
        {!readOnly && content.questions.length > 0 && (
          <div className={`bulk-bar ${checked.size ? 'is-active' : ''}`}>
            <label className="checkbox-label bulk-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => setChecked(allChecked ? new Set() : new Set(content.questions.map((q) => q.id)))}
              />
              Chọn tất cả
            </label>
            {checked.size > 0 && (
              <>
                <span className="small-text">Đã chọn {checked.size} question</span>
                <button type="button" className="btn btn-danger btn-small" onClick={deleteChecked}>
                  Xóa các question đã chọn
                </button>
                <button type="button" className="btn btn-link small-text" onClick={() => setChecked(new Set())}>
                  Bỏ chọn
                </button>
              </>
            )}
          </div>
        )}

        {content.parts.map((part, pi) => {
          const partNo = pi + 1;
          const units = unitsOfPart(content, partNo);
          const isSel = selected.type === 'part' && selected.no === partNo;
          const outlineProps = { selected, onSelect: setSelected, checked, onCheck: toggleCheck, readOnly };
          return (
            <div key={partNo} className="outline-part">
              <button
                type="button"
                className={`outline-part-title ${isSel ? 'is-current' : ''}`}
                onClick={() => setSelected({ type: 'part', no: partNo })}
                data-tour={partNo === 1 ? 'part-title' : undefined}
              >
                {part.name || `Part ${partNo}`}
              </button>

              {units.length === 0 && <p className="muted small-text outline-empty">Part này chưa có question nào.</p>}
              <ul className="outline-list">
                {units.map((u) =>
                  u.kind === 'question' ? (
                    <li key={unitKeyOf(u)}>
                      <OutlineQuestion q={u.question} {...outlineProps} />
                    </li>
                  ) : (
                    <li key={unitKeyOf(u)} className="outline-group">
                      <button
                        type="button"
                        className={`outline-item outline-group-title ${selected.type === 'group' && selected.code === u.group.code ? 'is-current' : ''}`}
                        onClick={() => setSelected({ type: 'group', code: u.group.code })}
                      >
                        Nhóm đọc hiểu {u.group.code}
                        <span className="muted">
                          {' '}
                          {u.questions.length ? `(question ${u.questions[0].no}–${u.questions[u.questions.length - 1].no})` : '(chưa có question)'}
                        </span>
                      </button>
                      <ul className="outline-list outline-sublist">
                        {u.questions.map((q) => (
                          <li key={q.id}>
                            <OutlineQuestion q={q} {...outlineProps} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                )}
              </ul>

              {!readOnly && (
                <div className="outline-actions">
                  <AddManyButton
                    tour={partNo === 1 ? 'add-question' : undefined}
                    onAdd={(n) => {
                      const [next, id] = addQuestions(content, partNo, n);
                      save(next);
                      setSelected({ type: 'question', id });
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    data-tour={partNo === 1 ? 'add-group' : undefined}
                    onClick={() => {
                      const [next, code] = addGroup(content, partNo);
                      save(next);
                      setSelected({ type: 'group', code });
                    }}
                  >
                    Thêm nhóm đọc hiểu
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!readOnly && (
          <button
            type="button"
            className="btn btn-primary btn-small outline-add-part"
            data-tour="add-part"
            onClick={() => {
              const [next, no] = addPart(content);
              save(next);
              setSelected({ type: 'part', no });
            }}
          >
            Thêm part
          </button>
        )}
      </aside>

      <section className="card builder-editor" data-tour="editor">
        <Editor {...props} selected={selected} setSelected={setSelected} save={save} />
      </section>

      {showTour && <Tour steps={TOUR_STEPS} onClose={closeTour} />}
    </div>
  );
}

/** Ô số lượng + nút "Thêm N question" */
function AddManyButton({ onAdd, tour, label = 'question' }) {
  const [count, setCount] = useState('1');
  const n = Math.min(Math.max(Number.parseInt(count, 10) || 1, 1), MAX_ADD_AT_ONCE);
  return (
    <span className="add-many" data-tour={tour}>
      <input
        type="number"
        min="1"
        max={MAX_ADD_AT_ONCE}
        className="input add-many-count"
        value={count}
        onChange={(e) => setCount(e.target.value)}
        aria-label="Số question muốn thêm"
      />
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={() => {
          onAdd(n);
          setCount('1');
        }}
      >
        Thêm {n} {label}
      </button>
    </span>
  );
}

function OutlineQuestion({ q, selected, onSelect, checked, onCheck, readOnly }) {
  const isSel = selected.type === 'question' && selected.id === q.id;
  return (
    <div className={`outline-row ${checked.has(q.id) ? 'is-checked' : ''}`}>
      {!readOnly && (
        <input
          type="checkbox"
          className="outline-check"
          checked={checked.has(q.id)}
          onChange={() => onCheck(q.id)}
          aria-label={`Chọn question ${q.no}`}
        />
      )}
      <button type="button" className={`outline-item ${isSel ? 'is-current' : ''}`} onClick={() => onSelect({ type: 'question', id: q.id })}>
        <strong>Question {q.no}</strong> <span className="outline-summary">{questionSummary(q)}</span>
        {!q.answer && <span className="text-error small-text"> · chưa có đáp án</span>}
      </button>
    </div>
  );
}

// ================= Khung soạn bên phải =================
function Editor({ readOnly, content, media, examId, setMedia, handleConflict, selected, setSelected, save }) {
  const uploader = { examId, setMedia, handleConflict };

  if (selected.type === 'question') {
    const q = content.questions.find((x) => x.id === selected.id);
    if (q) return <QuestionForm {...{ readOnly, content, media, uploader, q, setSelected, save }} />;
  }
  if (selected.type === 'group') {
    const g = content.groups.find((x) => x.code === selected.code);
    if (g) return <GroupForm {...{ readOnly, content, media, uploader, g, setSelected, save }} />;
  }
  const partNo = selected.type === 'part' && selected.no <= content.parts.length ? selected.no : 1;
  return <PartForm {...{ readOnly, content, media, uploader, partNo, setSelected, save }} />;
}

// ---------- Phần ----------
function PartForm({ readOnly, content, media, uploader, partNo, setSelected, save }) {
  const part = content.parts[partNo - 1];
  const count = content.questions.filter((q) => q.part === partNo).length;
  const set = (patch) => save(updatePart(content, partNo, patch));

  function remove() {
    if (content.parts.length === 1) return window.alert('Đề phải có ít nhất một part.');
    if (!window.confirm(`Xóa "${part.name}"${count ? ` cùng ${count} question của part này` : ''}?`)) return;
    save(deletePart(content, partNo));
    setSelected({ type: 'part', no: Math.max(1, partNo - 1) });
  }

  return (
    <fieldset disabled={readOnly} className="plain-fieldset">
      <div className="qedit-head">
        <h2 className="admin-section-title">Part {partNo}</h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary btn-small" disabled={partNo === 1} onClick={() => { save(movePart(content, partNo, -1)); setSelected({ type: 'part', no: partNo - 1 }); }}>
            Lên
          </button>
          <button type="button" className="btn btn-secondary btn-small" disabled={partNo === content.parts.length} onClick={() => { save(movePart(content, partNo, 1)); setSelected({ type: 'part', no: partNo + 1 }); }}>
            Xuống
          </button>
          <button type="button" className="btn btn-danger btn-small" onClick={remove}>
            Xóa part
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="part-name">Tên part (học viên nhìn thấy)</label>
        <input id="part-name" className="input" value={part.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ví dụ: Part 1 – Listening" />
      </div>
      <div className="field">
        <label htmlFor="part-dir">Lời dặn (hiện trước question đầu tiên của part, có thể để trống)</label>
        <textarea id="part-dir" className="input textarea" rows={3} value={part.directions} onChange={(e) => set({ directions: e.target.value })} placeholder="Ví dụ: Nghe đoạn audio và chọn đáp án đúng." />
      </div>
      <div className="field">
        <label htmlFor="part-audio">Audio cho cả part (nếu có — ví dụ một bài nghe dùng cho mọi question của part)</label>
        <FileSelect id="part-audio" kind="audio" media={media} value={part.audio} onChange={(v) => set({ audio: v })} uploader={uploader} />
      </div>
      <p className="field-hint">Part này có {count} question. Thêm question bằng nút "Thêm … question" / "Thêm nhóm đọc hiểu" ở dàn ý bên trái.</p>
    </fieldset>
  );
}

// ---------- Câu hỏi ----------
function QuestionForm({ readOnly, content, media, uploader, q, setSelected, save }) {
  const set = (patch) => save(updateQuestionById(content, q.id, patch));
  const letters = Object.keys(q.options);
  const partNo = q.part;
  const unitKey = `q:${q.id}`;

  function move(dir) {
    save(q.groupCode ? moveInGroup(content, q.groupCode, q.id, dir) : moveUnit(content, partNo, unitKey, dir));
  }
  function remove() {
    if (!window.confirm(`Xóa question ${q.no}?`)) return;
    save(deleteQuestion(content, q.id));
    setSelected(q.groupCode ? { type: 'group', code: q.groupCode } : { type: 'part', no: partNo });
  }

  return (
    <fieldset disabled={readOnly} className="plain-fieldset">
      <div className="qedit-head">
        <h2 className="admin-section-title">
          Question {q.no}{' '}
          <span className="muted small-text">
            · {content.parts[partNo - 1]?.name}
            {q.groupCode ? ` · nhóm ${q.groupCode}` : ''}
          </span>
        </h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => move(-1)}>Lên</button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => move(1)}>Xuống</button>
          <button type="button" className="btn btn-danger btn-small" onClick={remove}>Xóa question</button>
        </div>
      </div>

      {!q.groupCode && content.parts.length > 1 && (
        <div className="field">
          <label htmlFor="q-part">Thuộc part</label>
          <select id="q-part" className="input" value={q.part} onChange={(e) => save(moveToPart(content, q.id, Number(e.target.value)))}>
            {content.parts.map((p, i) => <option key={i} value={i + 1}>{p.name || `Part ${i + 1}`}</option>)}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="q-text">Nội dung question</label>
        <textarea id="q-text" className="input textarea" rows={3} value={q.question} onChange={(e) => set({ question: e.target.value })} placeholder="Gõ question. Có thể để trống nếu question chỉ có ảnh hoặc audio." />
      </div>

      <div className="admin-form-row builder-media-row">
        <div className="field">
          <label htmlFor="q-image">Ảnh của question (nếu có)</label>
          <FileSelect id="q-image" kind="image" media={media} value={q.image} onChange={(v) => set({ image: v })} uploader={uploader} />
        </div>
        <div className="field">
          <label htmlFor="q-audio">Audio của question (nếu có)</label>
          <FileSelect id="q-audio" kind="audio" media={media} value={q.audio} onChange={(v) => set({ audio: v })} uploader={uploader} />
        </div>
      </div>

      <div className="field">
        <span className="field-label">Các lựa chọn ({letters.length}) — bấm "Đáp án đúng" ở lựa chọn đúng</span>
        <div className="builder-options">
          {letters.map((l) => (
            <div key={l} className={`builder-option ${q.answer === l ? 'is-answer' : ''}`}>
              <span className="option-letter">{l}</span>
              <input
                className="input"
                value={q.options[l]}
                onChange={(e) => set({ options: { ...q.options, [l]: e.target.value } })}
                aria-label={`Lựa chọn ${l}`}
                placeholder={`Nội dung lựa chọn ${l}`}
              />
              <label className="checkbox-label builder-answer">
                <input type="radio" name={`ans-${q.id}`} checked={q.answer === l} onChange={() => set({ answer: l })} />
                Đáp án đúng
              </label>
            </div>
          ))}
        </div>
        <div className="admin-form-actions">
          <button type="button" className="btn btn-secondary btn-small" disabled={letters.length >= MAX_OPTIONS} onClick={() => save(updateQuestionById(content, q.id, addOption(q)))}>
            Thêm lựa chọn
          </button>
          <button type="button" className="btn btn-secondary btn-small" disabled={letters.length <= MIN_OPTIONS} onClick={() => save(updateQuestionById(content, q.id, removeOption(q)))}>
            Bớt lựa chọn cuối
          </button>
        </div>
        {!q.answer && <p className="text-error small-text">Chưa chọn đáp án đúng.</p>}
      </div>

      <div className="field">
        <label htmlFor="q-expl">Giải thích (hiện cho học viên sau khi nộp, nếu đề cho xem đáp án)</label>
        <textarea id="q-expl" className="input textarea" rows={3} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} />
      </div>
    </fieldset>
  );
}

/** Chuyển question lẻ sang part khác (đặt ở cuối part đó) */
function moveToPart(content, id, partNo) {
  const q = content.questions.find((x) => x.id === id);
  const rest = content.questions.filter((x) => x.id !== id);
  return renumber({ ...content, questions: [...rest, { ...q, part: partNo }] });
}

// ---------- Nhóm đọc hiểu ----------
function GroupForm({ readOnly, content, media, uploader, g, setSelected, save }) {
  const set = (patch) => save(updateGroup(content, g.code, patch));
  const questions = content.questions.filter((q) => q.groupCode === g.code);
  const imageMedia = media.filter((m) => mediaKind(m) === 'image');

  function remove() {
    if (!window.confirm(`Xóa nhóm ${g.code}${questions.length ? ` cùng ${questions.length} question của nhóm` : ''}?`)) return;
    save(deleteGroup(content, g.code));
    setSelected({ type: 'part', no: g.part });
  }

  return (
    <fieldset disabled={readOnly} className="plain-fieldset">
      <div className="qedit-head">
        <h2 className="admin-section-title">
          Nhóm đọc hiểu {g.code} <span className="muted small-text">· {content.parts[g.part - 1]?.name}</span>
        </h2>
        <div className="table-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => save(moveUnit(content, g.part, `g:${g.code}`, -1))}>Lên</button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => save(moveUnit(content, g.part, `g:${g.code}`, 1))}>Xuống</button>
          <button type="button" className="btn btn-danger btn-small" onClick={remove}>Xóa nhóm</button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="g-passage">Đoạn văn (gõ chữ — hoặc dùng ảnh / audio ở dưới)</label>
        <textarea id="g-passage" className="input textarea passage-input" rows={10} value={g.passage} onChange={(e) => set({ passage: e.target.value })} />
        <p className="field-hint">
          Dòng chỉ có <code>---</code> để ngăn hai văn bản; dòng bắt đầu bằng <code>|</code> là một hàng của bảng.
        </p>
      </div>

      <div className="field">
        <span className="field-label">Ảnh đoạn văn (nếu đoạn văn là ảnh chụp, theo thứ tự)</span>
        <UploadButton
          {...uploader}
          multiple
          label="Tải ảnh đoạn văn lên"
          onUploaded={(names) => set({ passageImages: [...(g.passageImages || []).filter((x) => !names.some((n) => sameFile(n, x))), ...names] })}
        />
        {imageMedia.length > 0 && (
          <div className="check-list">
            {imageMedia.map((m) => {
              const on = (g.passageImages || []).some((x) => sameFile(x, m.name));
              return (
                <label key={m.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set({ passageImages: on ? g.passageImages.filter((x) => !sameFile(x, m.name)) : [...(g.passageImages || []), m.name] })}
                  />
                  {m.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="g-audio">Audio của đoạn (nếu là bài nghe)</label>
        <FileSelect id="g-audio" kind="audio" media={media} value={g.audio} onChange={(v) => set({ audio: v })} uploader={uploader} />
      </div>

      <div className="field">
        <span className="field-label">Question của nhóm ({questions.length})</span>
        <ul className="outline-list">
          {questions.map((q) => (
            <li key={q.id}>
              <button type="button" className="outline-item" onClick={() => setSelected({ type: 'question', id: q.id })}>
                <strong>Question {q.no}</strong> <span className="outline-summary">{questionSummary(q)}</span>
              </button>
            </li>
          ))}
        </ul>
        <AddManyButton
          label="question vào nhóm"
          onAdd={(n) => {
            const [next, id] = addQuestionsToGroup(content, g.code, n);
            save(next);
            setSelected({ type: 'question', id });
          }}
        />
      </div>

      {g.passage && (
        <div className="field">
          <span className="field-label">Xem trước đoạn văn</span>
          <div className="passage-preview">
            <PassageText text={g.passage} />
          </div>
        </div>
      )}
    </fieldset>
  );
}
