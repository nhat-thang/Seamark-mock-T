import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  blockAbove, confirmAllAiAnswers, deleteItem, deleteQuestions, detachFromBlock, duplicateItem, insertBlock, insertPart,
  insertQuestions, itemKey, MAX_ADD_AT_ONCE, moveItem, movePart, nudgeItem, reviewCounts, toItems, totalPoints, updateGroup,
  updatePart, updateQuestionById, upgradeContent,
} from '../../utils/customExam.js';
import { fileResolver } from '../../utils/fileRefs.js';
import { useAdmin, useMarkTourDone } from '../AdminLayout.jsx';
import Tour from '../Tour.jsx';
import PasteImport from './PasteImport.jsx';
import { BlockCard, PartCard, TitleCard } from './builder/Cards.jsx';
import QuestionCard from './builder/QuestionCard.jsx';
import Icon, { IconButton } from './builder/icons.jsx';
import { MediaPicker } from './builder/widgets.jsx';
import './builder/form-builder.css';

// Đổi tên khi hướng dẫn thay đổi nhiều: admin đã xem bản cũ vẫn được xem bản mới một lần
const TOUR_NAME = 'custom-builder-v2';

// Các bước hướng dẫn (chỉ vào phần tử có data-tour tương ứng; không có trên màn hình thì bỏ qua)
const TOUR_STEPS = [
  { target: 'title-card', title: 'Tên và mô tả đề', text: 'Bấm vào đây để sửa tên đề và viết mô tả. Học viên thấy mô tả trước khi làm bài.' },
  { target: 'question-card', title: 'Soạn question', text: 'Mỗi question là một thẻ. Bấm vào thẻ để soạn ngay trên thẻ: gõ câu hỏi, gõ các lựa chọn (nhấn Enter để thêm lựa chọn), chọn loại câu ở ô bên phải. Biểu tượng ảnh để chèn ảnh hoặc audio.' },
  { target: 'answer-key', title: 'Đáp án và điểm', text: 'Bấm "Đáp án" để chọn lựa chọn đúng (có dấu ✓ xanh) và đặt số điểm của question. Bấm "Xong" để quay lại soạn.' },
  { target: 'drag', title: 'Đổi thứ tự', text: 'Giữ chuột vào 6 chấm ở mép trên thẻ rồi kéo lên / xuống. Hoặc bấm vào 6 chấm rồi dùng phím mũi tên ↑ ↓.' },
  { target: 'toolbar', title: 'Thanh công cụ', text: 'Thanh này đi theo thẻ đang chọn. Từ trên xuống: thêm question, dán đề có sẵn, thêm tiêu đề và mô tả, thêm ảnh, thêm audio, thêm part. Thứ mới thêm nằm ngay dưới thẻ đang chọn.' },
  { target: 'tool-paste', title: 'Dán đề có sẵn', text: 'Có sẵn đề trên web hoặc Word? Copy cả đề rồi dán vào đây: máy tự tách question, lựa chọn, đáp án và đoạn văn.' },
  { target: 'tool-text', title: 'Đoạn văn cho nhiều question', text: 'Thêm khối "Tiêu đề và mô tả" (hoặc khối ảnh / audio) rồi thêm question ngay bên dưới. Các question có vạch nối bên trái thuộc khối đó: học viên thấy khối bên cạnh các question.' },
  { target: 'topbar', title: 'Thêm nhiều / xóa nhiều', text: 'Thêm nhiều question một lúc, hoặc bấm "Chọn nhiều để xóa". Tổng điểm của đề ở bên phải.' },
  { target: 'tab-info', title: 'Xáo trộn question', text: 'Ở tab "Thông tin đề": đặt thời gian làm bài, và bật "Xáo trộn question" để mỗi học viên làm theo một thứ tự khác nhau.' },
  { target: 'preview', title: 'Xem trước', text: 'Bấm "Xem trước" để làm thử đề giống hệt học viên.' },
  { target: 'tab-publish', title: 'Xuất bản', text: 'Soạn xong, vào "Kiểm tra & xuất bản" để kiểm tra lỗi và mở đề cho học viên. Cần xem lại hướng dẫn này: bấm "Xem lại hướng dẫn" ở thanh trên cùng.' },
];

const SNACK_MS = 10000;

// Tab "Soạn đề" của đề tự thiết kế: các thẻ xếp dọc (kiểu biểu mẫu), soạn trực tiếp trên thẻ đang chọn
export default function CustomBuilderTab(props) {
  const { readOnly, content: rawContent, updateContent, settings, updateSetting, media, examId, setMedia, handleConflict } = props;
  const admin = useAdmin();
  const markTourDone = useMarkTourDone();

  // Đề cũ được điền các trường mới (loại câu, điểm...) ngay khi mở; lần lưu tới sẽ lưu ở dạng mới
  const content = useMemo(() => upgradeContent(rawContent), [rawContent]);
  const items = useMemo(() => toItems(content), [content]);
  const url = useMemo(() => fileResolver(media), [media]);
  const uploader = { examId, setMedia, handleConflict };

  const [selKey, setSelKey] = useState(() => {
    const first = items.find((it) => it.kind === 'question');
    return first ? itemKey(first) : 'title';
  });
  const [answerKey, setAnswerKey] = useState(null); // thẻ đang ở chế độ "Đáp án"
  const [pasteOpen, setPasteOpen] = useState(false);
  const [picker, setPicker] = useState(null); // { kinds, title, onPick }
  const [snack, setSnack] = useState(null); // { text, prev, after } — xóa xong có "Hoàn tác"
  const [checkMode, setCheckMode] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [addCount, setAddCount] = useState('1');
  const [armedKey, setArmedKey] = useState(null); // bấm giữ tay cầm -> thẻ được phép kéo
  const [drag, setDrag] = useState(null); // { key, over: vị trí thả }
  const [toolTop, setToolTop] = useState(0);
  const [showTour, setShowTour] = useState(false);

  const contentRef = useRef(content);
  contentRef.current = content;
  const listRef = useRef(null);
  const toolbarRef = useRef(null);
  const focusReq = useRef(null); // { selector, until } — đưa con trỏ vào ô vừa tạo sau khi giao diện cập nhật

  // ---------- Hướng dẫn lần đầu ----------
  useEffect(() => {
    if (!(admin.toursDone || []).includes(TOUR_NAME)) {
      const t = setTimeout(() => setShowTour(true), 400);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closeTour = useCallback(() => {
    setShowTour(false);
    markTourDone(TOUR_NAME);
  }, [markTourDone]);

  // ---------- Lưu ----------
  const save = (next) => updateContent(next, { src: 'editor' });
  /** Lưu thay đổi có thể hoàn tác (xóa): hiện thanh báo "Hoàn tác" */
  function saveUndo(next, text) {
    setSnack({ text, prev: rawContent, after: next });
    save(next);
  }
  function undo() {
    // Chỉ hoàn tác khi chưa có thay đổi nào khác sau lần xóa
    if (snack && rawContent === snack.after) save(snack.prev);
    setSnack(null);
  }
  useEffect(() => {
    if (snack && rawContent !== snack.after) setSnack(null);
  }, [rawContent, snack]);
  useEffect(() => {
    if (!snack) return undefined;
    const t = setTimeout(() => setSnack(null), SNACK_MS);
    return () => clearTimeout(t);
  }, [snack]);

  // ---------- Chọn thẻ ----------
  const selExists = selKey === 'title' || items.some((it) => itemKey(it) === selKey);
  const current = selExists ? selKey : 'title';
  function select(key) {
    if (key === current) return;
    setSelKey(key);
    setAnswerKey(null);
  }

  // Đưa con trỏ vào ô vừa tạo (chờ thẻ hiện ra, tối đa 1 giây)
  useEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    const el = document.querySelector(req.selector);
    if (el) {
      el.focus();
      focusReq.current = null;
    } else if (Date.now() > req.until) {
      focusReq.current = null;
    }
  });
  const focusLater = (selector) => {
    focusReq.current = { selector, until: Date.now() + 1000 };
  };

  // Điểm chèn của thanh công cụ: ngay sau thẻ đang chọn (thẻ tiêu đề đề -> đầu Part 1)
  const anchor = current === 'title' ? 'p:1' : current;

  // ---------- Các thao tác dùng trong thẻ ----------
  function remove(key) {
    const cur = contentRef.current;
    const its = toItems(cur);
    const i = its.findIndex((it) => itemKey(it) === key);
    const it = its[i];
    if (!it || (it.kind === 'part' && cur.parts.length <= 1)) return;
    const text =
      it.kind === 'question'
        ? `Đã xóa question ${it.question.no}.`
        : it.kind === 'group'
          ? 'Đã xóa khối (các question của khối vẫn còn).'
          : `Đã xóa "${it.part.name}" — các question được gộp vào part bên cạnh.`;
    saveUndo(deleteItem(cur, key), text);
    setSelKey(i > 0 && it.kind !== 'part' ? itemKey(its[i - 1]) : 'title');
    setAnswerKey(null);
  }

  const ctx = {
    readOnly,
    media,
    url,
    saveQ: (id, patch) => save(updateQuestionById(contentRef.current, id, patch)),
    replaceQ: (nq) => save({ ...contentRef.current, questions: contentRef.current.questions.map((x) => (x.id === nq.id ? nq : x)) }),
    saveG: (code, patch) => save(updateGroup(contentRef.current, code, patch)),
    saveP: (no, patch) => save(updatePart(contentRef.current, no, patch)),
    duplicate: (key) => {
      const [next, k] = duplicateItem(contentRef.current, key);
      save(next);
      setSelKey(k);
    },
    remove,
    detach: (id) => save(detachFromBlock(contentRef.current, id)),
    movePart: (no, dir) => {
      save(movePart(contentRef.current, no, dir));
      setSelKey(`p:${no + dir}`);
    },
    openPicker: (opts) => setPicker(opts),
    focus: (key) => focusLater(`[data-focus="${key}"]`),
    focusLater,
  };

  // ---------- Thanh công cụ ----------
  function addQuestions(n = 1) {
    const [next, k] = insertQuestions(content, anchor, n);
    save(next);
    setSelKey(k);
    setAnswerKey(null);
    focusLater(`[data-focus="qtext:${k.slice(2)}"]`);
  }
  function addBlock(type) {
    const [next, k] = insertBlock(content, anchor, type);
    save(next);
    setSelKey(k);
    setAnswerKey(null);
    const code = k.slice(2);
    if (type === 'text') focusLater('.fb-block-title-input');
    if (type === 'image') {
      setPicker({ kinds: ['image'], title: 'Chọn ảnh cho khối', onPick: (name) => save(updateGroup(contentRef.current, code, { passageImages: [name] })) });
    }
    if (type === 'audio') {
      setPicker({ kinds: ['audio'], title: 'Chọn audio cho khối', onPick: (name) => save(updateGroup(contentRef.current, code, { audio: name })) });
    }
  }
  function addPart() {
    const [next, k] = insertPart(content, anchor);
    save(next);
    setSelKey(k);
    focusLater('.fb-part-title-input');
  }

  // Thanh công cụ đi theo thẻ đang chọn, nhưng luôn nằm trong màn hình khi cuộn
  const placeToolbar = useCallback(() => {
    const list = listRef.current;
    const tb = toolbarRef.current;
    if (!list || !tb) return;
    const el = list.querySelector(`[data-key="${current}"]`);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const h = tb.offsetHeight;
    let top = el.getBoundingClientRect().top - listRect.top;
    top = Math.min(Math.max(top, 16 - listRect.top), window.innerHeight - 16 - h - listRect.top);
    top = Math.max(0, Math.min(top, list.offsetHeight - h));
    setToolTop(Math.round(top));
  }, [current]);
  useLayoutEffect(placeToolbar);
  useEffect(() => {
    window.addEventListener('scroll', placeToolbar, { passive: true });
    window.addEventListener('resize', placeToolbar);
    // Ảnh tải xong / thẻ đổi chiều cao -> đặt lại
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(placeToolbar) : null;
    if (ro && listRef.current) ro.observe(listRef.current);
    return () => {
      window.removeEventListener('scroll', placeToolbar);
      window.removeEventListener('resize', placeToolbar);
      ro?.disconnect();
    };
  }, [placeToolbar]);

  // ---------- Kéo thả ----------
  useEffect(() => {
    if (!armedKey) return undefined;
    const off = () => setArmedKey(null);
    window.addEventListener('mouseup', off);
    return () => window.removeEventListener('mouseup', off);
  }, [armedKey]);

  /** Vị trí thả theo toạ độ chuột: trước thẻ đầu tiên có điểm giữa nằm dưới con trỏ */
  function dropIndex(y) {
    const cards = listRef.current.querySelectorAll('[data-index]');
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return Number(el.dataset.index);
    }
    return items.length;
  }

  function handleKeys(e, key) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    save(nudgeItem(content, key, e.key === 'ArrowUp' ? -1 : 1));
    focusLater(`[data-handle="${key}"]`);
  }

  // ---------- Xóa nhiều / đáp án AI ----------
  const allChecked = content.questions.length > 0 && checked.size === content.questions.length;
  function deleteChecked() {
    const n = checked.size;
    saveUndo(deleteQuestions(content, checked), `Đã xóa ${n} question.`);
    if (current.startsWith('q:') && checked.has(current.slice(2))) setSelKey('title');
    setChecked(new Set());
    setCheckMode(false);
  }
  const toggleCheck = (id) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const review = reviewCounts(content);
  function confirmAi() {
    if (!window.confirm(`Bạn đã xem lại ${review.aiAnswer} đáp án do AI gợi ý và đồng ý dùng các đáp án đó?\n(Đáp án sai có thể sửa sau bằng cách mở từng question.)`)) return;
    save(confirmAllAiAnswers(content));
  }

  const memberCount = useMemo(() => {
    const m = new Map();
    for (const q of content.questions) if (q.groupCode) m.set(q.groupCode, (m.get(q.groupCode) || 0) + 1);
    return m;
  }, [content.questions]);
  const firstQuestionKey = items.find((it) => it.kind === 'question');
  const n = Math.min(Math.max(Number.parseInt(addCount, 10) || 1, 1), MAX_ADD_AT_ONCE);

  // ---------- Dán đề có sẵn (giữ nguyên tính năng cũ) ----------
  if (pasteOpen && !readOnly) {
    return (
      <div className="fb">
        <div className="fb-column">
          <div className="fb-card fb-paste-card">
            <PasteImport
              content={content}
              onCancel={() => setPasteOpen(false)}
              onApply={(next, firstId, partNo) => {
                save(next);
                setPasteOpen(false);
                setSelKey(firstId ? `q:${firstId}` : `p:${partNo}`);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fb">
      <div className="fb-column">
        {/* Thanh trên cùng: số question, thêm nhiều, chọn nhiều để xóa, tổng điểm */}
        <div className="fb-topbar" data-tour="topbar">
          <span>
            <strong>{content.questions.length}</strong> question · Tổng điểm: <strong>{totalPoints(content)}</strong>
          </span>
          {!readOnly && !checkMode && (
            <span className="fb-add-many">
              <input
                type="number"
                min="1"
                max={MAX_ADD_AT_ONCE}
                className="fb-add-many-count"
                value={addCount}
                onChange={(e) => setAddCount(e.target.value)}
                aria-label="Số question muốn thêm"
              />
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  addQuestions(n);
                  setAddCount('1');
                }}
              >
                Thêm {n} question
              </button>
            </span>
          )}
          {!readOnly && content.questions.length > 0 && !checkMode && (
            <button type="button" className="btn btn-link small-text" onClick={() => setCheckMode(true)}>
              Chọn nhiều để xóa
            </button>
          )}
          <span className="fb-spacer" />
          <button type="button" className="btn btn-link small-text" onClick={() => setShowTour(true)}>
            Xem lại hướng dẫn
          </button>
        </div>

        {checkMode && (
          <div className="bulk-bar is-active fb-bulk">
            <label className="checkbox-label">
              <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(content.questions.map((q) => q.id)))} />
              Chọn tất cả
            </label>
            <span className="small-text">Đã chọn {checked.size} question</span>
            <button type="button" className="btn btn-danger btn-small" disabled={!checked.size} onClick={deleteChecked}>
              Xóa các question đã chọn
            </button>
            <button
              type="button"
              className="btn btn-link small-text"
              onClick={() => {
                setChecked(new Set());
                setCheckMode(false);
              }}
            >
              Xong
            </button>
          </div>
        )}

        {(review.aiAnswer > 0 || review.needsImage > 0) && (
          <div className="review-bar" role="status">
            {review.aiAnswer > 0 && (
              <p>
                {review.aiAnswer} đáp án do AI gợi ý chưa xác nhận.{' '}
                {!readOnly && (
                  <button type="button" className="btn btn-link small-text" onClick={confirmAi}>
                    Xác nhận tất cả
                  </button>
                )}
              </p>
            )}
            {review.needsImage > 0 && <p>{review.needsImage} question có thể cần ảnh (thẻ có dòng "Cần xem lại").</p>}
          </div>
        )}

        <fieldset disabled={readOnly} className="plain-fieldset">
          <div
            className="fb-list"
            ref={listRef}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const over = dropIndex(e.clientY);
              if (over !== drag.over) setDrag({ ...drag, over });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && drag.over !== null) save(moveItem(content, drag.key, drag.over));
              setDrag(null);
            }}
          >
            <div
              data-key="title"
              data-tour="title-card"
              className={`fb-card fb-title-card ${current === 'title' ? 'is-selected' : ''}`}
              onClick={() => select('title')}
              onFocusCapture={() => select('title')}
            >
              <TitleCard
                selected={current === 'title' && !readOnly}
                title={settings.title}
                description={content.description}
                onTitle={(v) => updateSetting('title', v)}
                onDescription={(v) => save({ ...contentRef.current, description: v })}
              />
            </div>

            {items.map((it, idx) => {
              const key = itemKey(it);
              const sel = key === current && !readOnly;
              const isQ = it.kind === 'question';
              const draggable = it.kind !== 'part' && !readOnly;
              const classes = [
                'fb-card',
                `fb-${it.kind}`,
                sel ? 'is-selected' : '',
                isQ && it.question.groupCode ? 'is-in-block' : '',
                drag?.key === key ? 'is-dragging' : '',
                isQ && checked.has(it.question.id) ? 'is-checked' : '',
              ].join(' ');
              return (
                <Fragment key={key}>
                  {drag && drag.over === idx && <div className="fb-drop-line" aria-hidden="true" />}
                  {it.kind === 'part' && content.parts.length > 1 && (
                    <div className="fb-part-tab">
                      Phần {it.no} trên {content.parts.length}
                    </div>
                  )}
                  <div
                    data-key={key}
                    data-index={idx}
                    data-tour={firstQuestionKey && key === itemKey(firstQuestionKey) ? 'question-card' : undefined}
                    className={classes}
                    onClick={() => select(key)}
                    onFocusCapture={() => select(key)}
                    draggable={armedKey === key}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', key);
                      setDrag({ key, over: null });
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setArmedKey(null);
                    }}
                  >
                    {draggable && (
                      <button
                        type="button"
                        className="fb-handle"
                        data-handle={key}
                        data-tour={firstQuestionKey && key === itemKey(firstQuestionKey) ? 'drag' : undefined}
                        aria-label="Kéo để đổi vị trí (hoặc bấm vào đây rồi dùng phím mũi tên lên / xuống)"
                        title="Kéo để đổi vị trí"
                        onMouseDown={() => setArmedKey(key)}
                        onKeyDown={(e) => handleKeys(e, key)}
                      >
                        <Icon name="drag" />
                      </button>
                    )}
                    {isQ && checkMode && (
                      <label className="fb-check-row" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(it.question.id)} onChange={() => toggleCheck(it.question.id)} />
                        Chọn question {it.question.no}
                      </label>
                    )}
                    {it.kind === 'part' && (
                      <PartCard
                        part={it.part}
                        no={it.no}
                        total={content.parts.length}
                        count={content.questions.filter((q) => q.part === it.no).length}
                        selected={sel}
                        ctx={ctx}
                      />
                    )}
                    {it.kind === 'group' && <BlockCard g={it.group} selected={sel} memberCount={memberCount.get(it.group.code) || 0} ctx={ctx} />}
                    {isQ && (
                      <QuestionCard
                        q={it.question}
                        selected={sel}
                        answerMode={answerKey === key}
                        setAnswerMode={(on) => setAnswerKey(on ? key : null)}
                        ctx={ctx}
                        attachCode={sel && !it.question.groupCode ? blockAbove(content, it.question.id) : null}
                      />
                    )}
                  </div>
                </Fragment>
              );
            })}
            {drag && drag.over === items.length && <div className="fb-drop-line" aria-hidden="true" />}

            {content.questions.length === 0 && (
              <p className="fb-empty muted">Đề chưa có question nào. Bấm ⊕ ở thanh bên phải để thêm question, hoặc ⇥ để dán đề có sẵn.</p>
            )}

            {!readOnly && (
              <div className="fb-toolbar" ref={toolbarRef} style={{ top: toolTop }} role="toolbar" aria-label="Thêm vào đề" data-tour="toolbar">
                <IconButton icon="add" label="Thêm câu hỏi" onClick={() => addQuestions(1)} />
                <IconButton icon="import" label="Nhập câu hỏi (dán đề có sẵn)" onClick={() => setPasteOpen(true)} data-tour="tool-paste" />
                <IconButton icon="title" label="Thêm tiêu đề và mô tả" onClick={() => addBlock('text')} data-tour="tool-text" />
                <IconButton icon="image" label="Thêm ảnh" onClick={() => addBlock('image')} />
                <IconButton icon="audio" label="Thêm audio" onClick={() => addBlock('audio')} />
                <IconButton icon="section" label="Thêm phần (part)" onClick={addPart} />
              </div>
            )}
          </div>
        </fieldset>
      </div>

      {picker && (
        <MediaPicker
          kinds={picker.kinds}
          title={picker.title}
          media={media}
          uploader={uploader}
          onClose={() => setPicker(null)}
          onPick={(name, kind) => {
            picker.onPick(name, kind);
            setPicker(null);
          }}
        />
      )}

      {snack && (
        <div className="fb-snackbar" role="status">
          <span>{snack.text}</span>
          <button type="button" className="fb-snackbar-btn" onClick={undo}>
            Hoàn tác
          </button>
          <IconButton icon="close" label="Đóng thông báo" onClick={() => setSnack(null)} />
        </div>
      )}

      {showTour && <Tour steps={TOUR_STEPS} onClose={closeTour} />}
    </div>
  );
}
