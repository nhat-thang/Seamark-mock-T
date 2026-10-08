import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiPost } from '../utils/api.js';
import { clearLocalAnswers, loadLocalAnswers, saveLocalAnswers } from '../utils/attemptStorage.js';
import { buildPages, GROUP_KIND_LABELS, pageIndexByQuestion } from '../utils/examLayout.js';
import { partName, shownNo } from '../utils/parts.js';
import PassageText from '../components/PassageText.jsx';
import Countdown from './Countdown.jsx';
import QuestionNav from './QuestionNav.jsx';
import QuestionCard, { hideOptionsFor } from './QuestionCard.jsx';
import { GroupImages, ListeningAudio, PartIntro } from './PageMedia.jsx';

const SAVE_DELAY_MS = 2500; // tự lưu sau khi ngừng thao tác 2,5 giây
const RETRY_DELAY_MS = 10000; // mất mạng: thử lưu lại sau 10 giây

const timeHHmm = (iso) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Giao diện làm bài.
 * Câu trả lời lưu ở 2 nơi: localStorage (ngay lập tức, dự phòng mất mạng) và server (tự lưu sau vài giây).
 */
export default function ExamRunner({ view, token, onSubmitted }) {
  const attemptId = view.id;
  const headers = useMemo(() => ({ 'X-Attempt-Token': token }), [token]);
  const pages = useMemo(() => buildPages(view.content), [view.content]);
  const pageOf = useMemo(() => pageIndexByQuestion(pages), [pages]);
  // Chênh lệch giờ máy học viên so với giờ server (đồng hồ đếm ngược theo giờ server)
  const [clockOffset] = useState(() => Date.parse(view.serverNow) - Date.now());

  // Trạng thái ban đầu: nếu trên máy còn bản chưa kịp lưu lên server thì dùng bản đó
  const [initial] = useState(() => {
    const local = loadLocalAnswers(attemptId);
    if (local?.dirty) return { answers: local.answers || {}, flagged: local.flagged || [], dirty: true };
    return { answers: view.answers || {}, flagged: view.flagged || [], dirty: false };
  });

  const [answers, setAnswers] = useState(initial.answers);
  const [flagged, setFlagged] = useState(initial.flagged);
  const [pageIndex, setPageIndex] = useState(0);
  const [navOpen, setNavOpen] = useState(false); // bảng số câu trên điện thoại
  const [saveState, setSaveState] = useState({ kind: initial.dirty ? 'pending' : 'idle', at: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Ref giữ giá trị mới nhất cho các hàm chạy bất đồng bộ (hẹn giờ, sự kiện)
  const latest = useRef({ answers: initial.answers, flagged: initial.flagged });
  const dirty = useRef(initial.dirty);
  const saveTimer = useRef(null);
  const submittingRef = useRef(false);

  // ---------- Nộp bài ----------
  const submit = useCallback(
    async ({ auto }) => {
      if (submittingRef.current) return;
      if (!auto) {
        const total = view.content.questions.length;
        const done = Object.keys(latest.current.answers).length;
        const msg =
          done < total
            ? `Bạn còn ${total - done} câu chưa làm.\n\nBạn có chắc muốn nộp bài? Sau khi nộp sẽ không sửa được nữa.`
            : 'Bạn có chắc muốn nộp bài? Sau khi nộp sẽ không sửa được nữa.';
        if (!window.confirm(msg)) return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError('');
      clearTimeout(saveTimer.current);
      try {
        const result = await apiPost(`/attempts/${attemptId}/submit`, latest.current, headers);
        dirty.current = false;
        clearLocalAnswers(attemptId);
        onSubmitted(result);
      } catch (err) {
        submittingRef.current = false;
        setSubmitting(false);
        setSubmitError(`${err.message} Bài làm vẫn được giữ trên máy, hệ thống sẽ thử nộp lại.`);
        // Hết giờ mà chưa nộp được (mất mạng): thử lại liên tục; server cũng tự nộp khi hết giờ
        if (auto) setTimeout(() => submit({ auto: true }), 5000);
      }
    },
    [attemptId, headers, onSubmitted, view.content.questions.length]
  );

  // ---------- Tự lưu ----------
  const save = useCallback(async () => {
    if (!dirty.current || submittingRef.current) return;
    const snapshot = latest.current;
    setSaveState((s) => ({ ...s, kind: 'saving' }));
    try {
      const r = await apiPost(`/attempts/${attemptId}/save`, snapshot, headers);
      // Trong lúc gửi mà học viên chọn thêm đáp án thì vẫn còn "dirty", lần lưu sau sẽ gửi tiếp
      if (latest.current === snapshot) {
        dirty.current = false;
        saveLocalAnswers(attemptId, { ...snapshot, dirty: false });
      }
      setSaveState({ kind: 'saved', at: r.savedAt });
    } catch (err) {
      if (err.status === 409) {
        // Server báo đã hết giờ và đã chốt bài -> lấy kết quả
        submit({ auto: true });
        return;
      }
      setSaveState((s) => ({ ...s, kind: 'offline' }));
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, RETRY_DELAY_MS);
    }
  }, [attemptId, headers, submit]);

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, SAVE_DELAY_MS);
  }

  function update(nextAnswers, nextFlagged) {
    latest.current = { answers: nextAnswers, flagged: nextFlagged };
    dirty.current = true;
    setAnswers(nextAnswers);
    setFlagged(nextFlagged);
    // Ghi ngay vào máy để mất mạng / tải lại trang vẫn còn
    saveLocalAnswers(attemptId, { ...latest.current, dirty: true });
    setSaveState((s) => ({ ...s, kind: 'pending' }));
    scheduleSave();
  }

  const choose = (no, letter) => update({ ...latest.current.answers, [no]: letter }, latest.current.flagged);

  const toggleFlag = (no) => {
    const cur = latest.current.flagged;
    const next = cur.includes(no) ? cur.filter((n) => n !== no) : [...cur, no].sort((a, b) => a - b);
    update(latest.current.answers, next);
  };

  // Khi mở trang: còn bản chưa lưu trên máy thì đẩy lên server ngay
  useEffect(() => {
    if (dirty.current) save();
    return () => clearTimeout(saveTimer.current);
  }, [save]);

  // Rời tab / ẩn trình duyệt -> lưu ngay; đóng trang khi còn thay đổi chưa lưu -> cảnh báo
  useEffect(() => {
    const onHidden = () => document.visibilityState === 'hidden' && save();
    const onBeforeUnload = (e) => {
      if (dirty.current && !submittingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [save]);

  // ---------- Chuyển trang ----------
  function goToPage(i) {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, i)));
    window.scrollTo({ top: 0 });
  }

  function goToQuestion(no) {
    setPageIndex(pageOf.get(no) ?? 0);
    setNavOpen(false);
    // Chờ trang mới hiện ra rồi cuộn tới câu đó
    setTimeout(() => document.getElementById(`q-${no}`)?.scrollIntoView({ block: 'center' }), 50);
  }

  const page = pages[pageIndex];
  const answeredCount = Object.keys(answers).length;
  const total = view.content.questions.length;
  const first = shownNo(page.questions[0]);
  const last = shownNo(page.questions[page.questions.length - 1]);

  return (
    <div className="exam-page">
      <header className="exam-header">
        <div className="exam-header-info">
          <strong className="exam-header-title">{view.examTitle}</strong>
          <span className="exam-header-student">
            {view.student.lastName} {view.student.firstName}
          </span>
        </div>
        <Countdown deadlineAt={view.deadlineAt} clockOffset={clockOffset} onExpire={() => submit({ auto: true })} />
        <div className="exam-header-actions">
          <SaveStatus state={saveState} />
          <button type="button" className="btn btn-secondary btn-small exam-nav-toggle" onClick={() => setNavOpen(true)}>
            Bảng câu hỏi ({answeredCount}/{total})
          </button>
          <button type="button" className="btn btn-primary btn-small" disabled={submitting} onClick={() => submit({ auto: false })}>
            {submitting ? 'Đang nộp…' : 'Nộp bài'}
          </button>
        </div>
      </header>

      {submitError && <p className="alert-error exam-submit-error" role="alert">{submitError}</p>}

      <div className="exam-body">
        <main className="exam-main">
          <div className="exam-part-title">
            {!page.firstOfPart && <span>{partName(view.content, page.part)}</span>}
            <span className="muted">
              {first === last ? `Question ${first}` : `Question ${first}–${last}`}
              {page.group && GROUP_KIND_LABELS[page.group.kind] ? ` · ${GROUP_KIND_LABELS[page.group.kind]}` : ''}
            </span>
          </div>

          {page.firstOfPart && <PartIntro content={view.content} part={page.part} />}
          <ListeningAudio content={view.content} part={page.part} allowSeek={view.allowSeekAudio} />

          <div className={hasPassage(page.group) ? 'exam-split' : 'exam-single'}>
            {hasPassage(page.group) && (
              <section className="exam-passage card" aria-label="Đoạn văn">
                {page.group.passage && <PassageText text={page.group.passage} />}
                <GroupImages group={page.group} allowSeek={view.allowSeekAudio} />
              </section>
            )}
            <section className="exam-questions">
              {page.questions.map((q) => (
                <QuestionCard
                  key={q.no}
                  question={q}
                  chosen={answers[q.no]}
                  flagged={flagged.includes(q.no)}
                  onChoose={choose}
                  onToggleFlag={toggleFlag}
                  hideOptionText={hideOptionsFor(view.content, q)}
                  examType={view.content.examType}
                  allowSeek={view.allowSeekAudio}
                />
              ))}
            </section>
          </div>

          <div className="exam-pager">
            <button type="button" className="btn btn-secondary" disabled={pageIndex === 0} onClick={() => goToPage(pageIndex - 1)}>
              Trang trước
            </button>
            <span className="muted">
              {pageIndex + 1} / {pages.length}
            </span>
            {pageIndex < pages.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => goToPage(pageIndex + 1)}>
                Trang sau
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => submit({ auto: false })}>
                Nộp bài
              </button>
            )}
          </div>
        </main>

        <aside className={`exam-nav ${navOpen ? 'open' : ''}`} aria-label="Bảng số câu">
          <div className="exam-nav-inner">
            <div className="exam-nav-head">
              <strong>
                Đã làm {answeredCount}/{total} câu
              </strong>
              <button type="button" className="btn btn-secondary btn-small exam-nav-close" onClick={() => setNavOpen(false)}>
                Đóng
              </button>
            </div>
            <QuestionNav
              content={view.content}
              answers={answers}
              flagged={flagged}
              currentNos={page.questions.map((q) => q.no)}
              onSelect={goToQuestion}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Nhóm có đoạn văn chữ hoặc ảnh để hiện bên cạnh câu hỏi không */
const hasPassage = (g) => !!g && (!!g.passage || (g.passageImages || []).length > 0 || !!g.image || !!g.audio);

function SaveStatus({ state }) {
  const text = {
    idle: '',
    pending: 'Chưa lưu…',
    saving: 'Đang lưu…',
    saved: state.at ? `Đã lưu lúc ${timeHHmm(state.at)}` : 'Đã lưu',
    offline: 'Mất kết nối, đã lưu tạm trên máy',
  }[state.kind];
  if (!text) return null;
  return <span className={`exam-save-status ${state.kind === 'offline' ? 'is-offline' : ''}`}>{text}</span>;
}
