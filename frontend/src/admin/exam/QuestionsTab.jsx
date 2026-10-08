import { useState } from 'react';
import { FileSelect, UploadButton } from './FileSelect.jsx';
import PassageText from '../../components/PassageText.jsx';
import { emptyQuestion, KIND_OPTIONS, lettersForPart, STANDARD_PARTS, updateQuestion } from '../../utils/examStructure.js';
import { mediaKind, sameFile } from '../../utils/fileRefs.js';
import '../../exam/exam.css';

// Tab "Câu hỏi & đoạn văn": sửa từng câu / từng nhóm cho các chỉnh sửa nhỏ. Tự động lưu.
export default function QuestionsTab(props) {
  const [view, setView] = useState('question'); // 'question' | 'group'
  return (
    <>
      <div className="segmented" role="group" aria-label="Chọn loại">
        <button type="button" className={`btn btn-small ${view === 'question' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('question')}>
          Từng câu hỏi
        </button>
        <button type="button" className={`btn btn-small ${view === 'group' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('group')}>
          Nhóm câu / đoạn văn ({props.content.groups.length})
        </button>
      </div>
      {view === 'question' ? <QuestionEditor {...props} /> : <GroupEditor {...props} />}
    </>
  );
}

// ================= Sửa từng câu =================
function QuestionEditor({ readOnly, content, media, updateContent, examId, setMedia, handleConflict, goToTab }) {
  const uploader = { examId, setMedia, handleConflict };
  const [selected, setSelected] = useState(content.questions[0]?.no ?? 101);
  const byNo = new Map(content.questions.map((q) => [q.no, q]));
  const q = byNo.get(selected);

  const change = (patch) => updateContent(updateQuestion(content, selected, () => patch), { src: 'editor' });

  function addQuestion() {
    const next = { ...content, questions: [...content.questions, emptyQuestion(selected, content.groups)].sort((a, b) => a.no - b.no) };
    updateContent(next, { src: 'editor' });
  }
  function removeQuestion() {
    if (!window.confirm(`Xóa câu ${selected} khỏi bản nháp?`)) return;
    updateContent({ ...content, questions: content.questions.filter((x) => x.no !== selected) }, { src: 'editor' });
  }

  return (
    <div className="qedit-layout">
      <aside className="card qedit-nav">
        <p className="field-hint">Viền đỏ: chưa có đáp án. Ô nét đứt: câu chưa có trong đề.</p>
        {STANDARD_PARTS.map((p) => (
          <div key={p.part}>
            <p className="qnav-part-title">Part {p.part}</p>
            <div className="qnav-grid">
              {Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i).map((no) => {
                const item = byNo.get(no);
                const cls = ['qnav-btn', !item ? 'is-missing' : !item.answer ? 'is-noanswer' : '', no === selected ? 'is-current' : ''].join(' ');
                return (
                  <button key={no} type="button" className={cls} onClick={() => setSelected(no)}>
                    {no}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <section className="card qedit-form">
        {!q ? (
          <>
            <h2 className="admin-section-title">Câu {selected}</h2>
            <p>Câu {selected} chưa có trong đề.</p>
            {!readOnly && (
              <button type="button" className="btn btn-primary" onClick={addQuestion}>
                Thêm câu {selected}
              </button>
            )}
          </>
        ) : (
          <fieldset disabled={readOnly} className="plain-fieldset">
            <div className="qedit-head">
              <h2 className="admin-section-title">
                Câu {q.no} <span className="muted small-text">· Part {q.part}</span>
              </h2>
              {!readOnly && (
                <button type="button" className="btn btn-danger btn-small" onClick={removeQuestion}>
                  Xóa câu này
                </button>
              )}
            </div>

            {q.part <= 4 && (
              <p className="question-audio-note">
                Audio của câu này:{' '}
                <strong>{content.audio?.full || content.audio?.parts?.[q.part] || 'chưa có'}</strong>
                {' — '}
                <button type="button" className="btn btn-link" onClick={() => goToTab('info')}>
                  đổi / tải audio ở tab "Thông tin đề"
                </button>
              </p>
            )}

            {[3, 4, 6, 7].includes(q.part) && (
              <div className="field">
                <label htmlFor="q-group">Nhóm câu / đoạn văn</label>
                <select id="q-group" className="input" value={q.groupCode || ''} onChange={(e) => change({ groupCode: e.target.value || null })}>
                  <option value="">(Không thuộc nhóm nào)</option>
                  {content.groups.filter((g) => g.part === q.part).map((g) => (
                    <option key={g.code} value={g.code}>{g.code} (câu {g.from}–{g.to})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="q-text">Câu hỏi</label>
              <textarea
                id="q-text"
                className="input textarea"
                rows={3}
                value={q.question}
                onChange={(e) => change({ question: e.target.value })}
                placeholder={q.part <= 2 ? 'Part 1, 2: câu hỏi nằm trong audio, có thể để trống' : q.part === 6 ? 'Part 6: có thể để trống (điền chỗ trống trong đoạn văn)' : ''}
              />
            </div>

            <div className="qedit-options">
              {lettersForPart(q.part).map((l) => (
                <div key={l} className="field qedit-option">
                  <label htmlFor={`q-opt-${l}`}>Lựa chọn {l}</label>
                  <input id={`q-opt-${l}`} className="input" value={q.options[l] ?? ''} onChange={(e) => change({ options: { ...q.options, [l]: e.target.value } })} />
                </div>
              ))}
            </div>

            <div className="field">
              <span className="field-label">Đáp án đúng</span>
              <div className="answer-choices">
                {lettersForPart(q.part).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`answer-letter answer-letter-big ${q.answer === l ? 'is-on' : ''}`}
                    onClick={() => change({ answer: l })}
                    aria-pressed={q.answer === l}
                  >
                    {l}
                  </button>
                ))}
                {!q.answer && <span className="text-error">Chưa có đáp án</span>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="q-image">Ảnh của câu {q.part === 1 ? '(bắt buộc với Part 1)' : '(nếu có)'}</label>
              <FileSelect id="q-image" kind="image" media={media} value={q.image} onChange={(v) => change({ image: v })} uploader={uploader} />
            </div>

            <div className="field">
              <label htmlFor="q-expl">Giải thích (hiện cho học viên sau khi nộp, nếu đề cho xem đáp án)</label>
              <textarea id="q-expl" className="input textarea" rows={3} value={q.explanation} onChange={(e) => change({ explanation: e.target.value })} />
            </div>
          </fieldset>
        )}
      </section>
    </div>
  );
}

// ================= Sửa nhóm câu / đoạn văn =================
function GroupEditor({ readOnly, content, media, updateContent, examId, setMedia, handleConflict }) {
  const uploader = { examId, setMedia, handleConflict };
  const [selected, setSelected] = useState(content.groups[0]?.code ?? null);
  const g = content.groups.find((x) => x.code === selected);

  function changeGroup(patch) {
    let next = { ...content, groups: content.groups.map((x) => (x.code === selected ? { ...x, ...patch } : x)) };
    // Đổi mã nhóm -> cập nhật các câu đang thuộc nhóm đó
    if (patch.code !== undefined && patch.code !== selected) {
      next = { ...next, questions: next.questions.map((q) => (q.groupCode === selected ? { ...q, groupCode: patch.code } : q)) };
      setSelected(patch.code);
    }
    updateContent(next, { src: 'editor' });
  }

  function addGroup() {
    let n = content.groups.length + 1;
    while (content.groups.some((x) => x.code === `NHOM-${n}`)) n++;
    const code = `NHOM-${n}`;
    updateContent({ ...content, groups: [...content.groups, { code, part: 7, kind: 'single', from: 147, to: 148, passage: '', passageImages: [], image: null }] }, { src: 'editor' });
    setSelected(code);
  }

  function removeGroup() {
    const used = content.questions.filter((q) => q.groupCode === selected).length;
    if (!window.confirm(`Xóa nhóm ${selected}?${used ? `\n\n${used} câu đang thuộc nhóm này sẽ không còn đoạn văn.` : ''}`)) return;
    updateContent(
      {
        ...content,
        groups: content.groups.filter((x) => x.code !== selected),
        questions: content.questions.map((q) => (q.groupCode === selected ? { ...q, groupCode: null } : q)),
      },
      { src: 'editor' }
    );
    setSelected(content.groups.find((x) => x.code !== selected)?.code ?? null);
  }

  const imageMedia = media.filter((m) => mediaKind(m) === 'image');

  return (
    <div className="qedit-layout">
      <aside className="card qedit-nav">
        <ul className="group-list">
          {content.groups.map((x) => (
            <li key={x.code}>
              <button type="button" className={`group-item ${x.code === selected ? 'is-current' : ''}`} onClick={() => setSelected(x.code)}>
                <strong>{x.code}</strong> <span className="muted">câu {x.from}–{x.to}</span>
                {[6, 7].includes(x.part) && !x.passage && !(x.passageImages || []).length && <span className="text-error"> · chưa có đoạn văn</span>}
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button type="button" className="btn btn-secondary btn-small" onClick={addGroup}>
            Thêm nhóm
          </button>
        )}
      </aside>

      <section className="card qedit-form">
        {!g ? (
          <p className="muted">Chưa có nhóm nào. Import file Excel hoặc bấm "Thêm nhóm".</p>
        ) : (
          <fieldset disabled={readOnly} className="plain-fieldset">
            <div className="qedit-head">
              <h2 className="admin-section-title">Nhóm {g.code}</h2>
              {!readOnly && (
                <button type="button" className="btn btn-danger btn-small" onClick={removeGroup}>
                  Xóa nhóm
                </button>
              )}
            </div>
            <div className="admin-form-row group-row">
              <GroupCodeInput
                key={g.code}
                code={g.code}
                taken={(c) => content.groups.some((x) => x.code === c && x.code !== g.code)}
                onCommit={(c) => changeGroup({ code: c })}
              />
              <div className="field">
                <label htmlFor="g-part">Part</label>
                <select id="g-part" className="input" value={g.part ?? ''} onChange={(e) => changeGroup({ part: Number(e.target.value) })}>
                  {[3, 4, 6, 7].map((p) => <option key={p} value={p}>Part {p}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-kind">Loại</label>
                <select id="g-kind" className="input" value={g.kind} onChange={(e) => changeGroup({ kind: e.target.value })}>
                  {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-from">Từ câu</label>
                <input id="g-from" className="input" type="number" value={g.from ?? ''} onChange={(e) => changeGroup({ from: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="g-to">Đến câu</label>
                <input id="g-to" className="input" type="number" value={g.to ?? ''} onChange={(e) => changeGroup({ to: Number(e.target.value) })} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="g-passage">Đoạn văn (chữ)</label>
              <textarea id="g-passage" className="input textarea passage-input" rows={12} value={g.passage} onChange={(e) => changeGroup({ passage: e.target.value })} />
              <p className="field-hint">
                Cách viết đặc biệt: dòng chỉ có <code>---</code> để ngăn các văn bản (đoạn đôi, đoạn ba); dòng bắt đầu bằng{' '}
                <code>|</code> là một hàng của bảng (ví dụ <code>| Item | Price</code>); <code>__(131)__</code> là chỗ trống câu 131.
              </p>
            </div>

            <div className="field">
              <span className="field-label">Ảnh đoạn văn (nếu đoạn văn là ảnh chụp, chọn theo thứ tự)</span>
              <UploadButton
                {...uploader}
                multiple
                label="Tải ảnh đoạn văn lên"
                onUploaded={(names) =>
                  changeGroup({
                    passageImages: [...(g.passageImages || []).filter((x) => !names.some((n) => sameFile(n, x))), ...names],
                  })
                }
              />
              {imageMedia.length === 0 ? (
                <p className="muted small-text">Chưa có ảnh nào. Bấm "Tải ảnh đoạn văn lên" (chọn được nhiều ảnh cùng lúc).</p>
              ) : (
                <div className="check-list">
                  {imageMedia.map((m) => {
                    const on = (g.passageImages || []).some((x) => sameFile(x, m.name));
                    return (
                      <label key={m.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            changeGroup({
                              passageImages: on ? g.passageImages.filter((x) => !sameFile(x, m.name)) : [...(g.passageImages || []), m.name],
                            })
                          }
                        />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              )}
              {(g.passageImages || []).filter((x) => !media.some((m) => sameFile(m.name, x))).map((x) => (
                <p key={x} className="text-error small-text">"{x}" chưa được tải lên.</p>
              ))}
            </div>

            <div className="field">
              <label htmlFor="g-image">Ảnh kèm (nếu có — ví dụ biểu đồ, bảng của Part 3, 4)</label>
              <FileSelect id="g-image" kind="image" media={media} value={g.image} onChange={(v) => changeGroup({ image: v })} uploader={uploader} />
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
        )}
      </section>
    </div>
  );
}

/** Ô mã nhóm: chỉ áp dụng khi rời ô và mã hợp lệ (không rỗng, không trùng nhóm khác) */
function GroupCodeInput({ code, taken, onCommit }) {
  const [value, setValue] = useState(code);
  const [error, setError] = useState('');
  function commit() {
    const c = value.trim().toUpperCase().replace(/\s/g, '');
    if (c === code) return setError('');
    if (!c) {
      setValue(code);
      return setError('Mã nhóm không được để trống.');
    }
    if (taken(c)) {
      setValue(code);
      return setError(`Mã "${c}" đã có nhóm khác dùng.`);
    }
    setError('');
    onCommit(c);
  }
  return (
    <div className="field">
      <label htmlFor="g-code">Mã nhóm</label>
      <input
        id="g-code"
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
