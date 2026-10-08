import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../utils/api.js';
import { ExamStatusTag } from './ExamListPage.jsx';
import SettingsTab from './exam/SettingsTab.jsx';
import ImportTab from './exam/ImportTab.jsx';
import AnswersTab from './exam/AnswersTab.jsx';
import QuestionsTab from './exam/QuestionsTab.jsx';
import FilesTab from './exam/FilesTab.jsx';
import PublishTab from './exam/PublishTab.jsx';
import CustomBuilderTab from './exam/CustomBuilderTab.jsx';
import './exam/exam-edit.css';

const SAVE_DELAY_MS = 2000; // tự lưu 2 giây sau lần thay đổi cuối
const RETRY_DELAY_MS = 10000; // mất mạng: thử lại sau 10 giây
const HEARTBEAT_MS = 30000; // gia hạn khóa mỗi 30 giây
const LOCK_POLL_MS = 30000; // chế độ chỉ xem: kiểm tra người sửa đã rời đi chưa

// Đề tự thiết kế: soạn trong một tab "Soạn đề" (không có Excel mẫu / lưới 200 câu của TOEIC)
const CUSTOM_TABS = [
  { id: 'info', label: 'Thông tin đề' },
  { id: 'builder', label: 'Soạn đề' },
  { id: 'files', label: 'Ảnh & audio' },
  { id: 'publish', label: 'Kiểm tra & xuất bản' },
];

const TABS = [
  { id: 'info', label: 'Thông tin đề' },
  { id: 'import', label: 'Import Excel' },
  { id: 'answers', label: 'Nhập nhanh đáp án' },
  { id: 'questions', label: 'Câu hỏi & đoạn văn' },
  { id: 'files', label: 'Ảnh & audio' },
  { id: 'publish', label: 'Kiểm tra & xuất bản' },
];

const timeHHmm = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

// ----- Lưu tạm trên máy (localStorage) -----
const backupKey = (id) => `seamark_exam_${id}_draft`;
function readBackup(id) {
  try {
    return JSON.parse(localStorage.getItem(backupKey(id)) || 'null');
  } catch {
    return null;
  }
}
function writeBackup(id, data) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify(data));
  } catch {
    // bộ nhớ đầy / bị chặn: bỏ qua, server vẫn lưu
  }
}
function clearBackup(id) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    // bỏ qua
  }
}

const settingsKeys = ['code', 'title', 'durationMinutes', 'internalNote', 'allowSeekAudio', 'showAnswersAfter'];
const pickSettings = (exam) => Object.fromEntries(settingsKeys.map((k) => [k, exam[k]]));

// Trang /admin/de-thi/:id
export default function ExamEditPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/admin/exams/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <>
        <p className="alert-error admin-message">{error}</p>
        <Link to="/admin/de-thi" className="btn btn-secondary">Về danh sách đề</Link>
      </>
    );
  }
  if (!data) return <p className="muted">Đang tải đề…</p>;
  return <ExamEditor examId={id} initial={data} />;
}

function ExamEditor({ examId, initial }) {
  const isCustom = initial.exam.examType === 'CUSTOM';
  const tabs = isCustom ? CUSTOM_TABS : TABS;
  const [tab, setTab] = useState(isCustom ? 'builder' : 'info');

  // ---------- Dữ liệu đang sửa ----------
  const [meta, setMeta] = useState(initial); // thông tin xuất bản, lịch sử
  const [settings, setSettings] = useState(() => pickSettings(initial.exam));
  const [content, setContent] = useState(initial.content);
  const [media, setMedia] = useState(initial.media || []);
  const version = useRef(initial.exam.version); // version của bản mình đang sửa

  // Giá trị mới nhất + cờ "còn thay đổi chưa lưu", dùng trong các hàm chạy bất đồng bộ
  const latest = useRef({ settings: pickSettings(initial.exam), content: initial.content });
  const dirty = useRef(false);
  const contentDirty = useRef(false); // nội dung đề có đổi không (chỉ gửi nội dung khi cần)
  const source = useRef({ source: 'editor', sourceName: '' }); // để ghi lịch sử
  const saveTimer = useRef(null);

  // ---------- Khóa ----------
  // mode: 'checking' (đang xin khóa) | 'edit' | 'readonly'
  const [mode, setMode] = useState('checking');
  const modeRef = useRef('checking');
  const [lock, setLock] = useState(initial.lock);
  const [lockMessage, setLockMessage] = useState('');

  // ---------- Trạng thái hiển thị ----------
  const [saveState, setSaveState] = useState({ kind: 'idle', at: null, message: '' });
  const [conflict, setConflict] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const changeMode = (m) => {
    modeRef.current = m;
    setMode(m);
  };

  /** Tải lại đề từ server */
  const refresh = useCallback(
    async ({ resetDraft }) => {
      const d = await apiGet(`/admin/exams/${examId}`);
      setMeta(d);
      setLock(d.lock);
      setMedia(d.media || []);
      if (resetDraft) {
        const s = pickSettings(d.exam);
        version.current = d.exam.version;
        latest.current = { settings: s, content: d.content };
        dirty.current = false;
        contentDirty.current = false;
        setSettings(s);
        setContent(d.content);
      }
      return d;
    },
    [examId]
  );

  // 409 do mất khóa hoặc version cũ -> chuyển chế độ, KHÔNG ghi đè
  function handleConflict(err) {
    const reason = err.data?.reason;
    if (reason === 'lock') {
      setLock(err.data.lock);
      changeMode('readonly');
      setLockMessage(err.message);
      setSaveState({ kind: 'idle', at: null, message: '' });
      return true;
    }
    if (reason === 'version') {
      setConflict(err.message);
      setSaveState({ kind: 'idle', at: null, message: '' });
      return true;
    }
    return false;
  }

  // ---------- Lưu ----------
  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!dirty.current || modeRef.current !== 'edit') return true;
    const snapshot = latest.current;
    const sendContent = contentDirty.current;
    const src = source.current;
    setSaveState((s) => ({ ...s, kind: 'saving' }));
    try {
      const body = { version: version.current, settings: snapshot.settings };
      if (sendContent) Object.assign(body, { content: snapshot.content, source: src.source, sourceName: src.sourceName });
      const r = await apiPost(`/admin/exams/${examId}/save`, body);
      version.current = r.version;
      // Trong lúc gửi mà người dùng sửa tiếp thì vẫn còn "dirty", lần lưu sau gửi tiếp
      if (latest.current === snapshot) {
        dirty.current = false;
        contentDirty.current = false;
        source.current = { source: 'editor', sourceName: '' };
        clearBackup(examId);
      }
      setSaveState({ kind: 'saved', at: r.updatedAt, message: '' });
      setMeta((m) => ({
        ...m,
        exam: { ...m.exam, ...snapshot.settings, version: r.version, updatedAt: r.updatedAt },
        content: snapshot.content,
        hasUnpublishedChanges: !!m.published,
      }));
      return true;
    } catch (err) {
      if (err.status === 409 && handleConflict(err)) return false;
      if (err.status === 400 || err.status === 409) {
        // Dữ liệu chưa hợp lệ (ví dụ mã đề trùng): chờ người dùng sửa, không tự thử lại
        setSaveState({ kind: 'invalid', at: null, message: err.message });
        return false;
      }
      setSaveState((s) => ({ ...s, kind: 'offline' }));
      saveTimer.current = setTimeout(save, RETRY_DELAY_MS);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  /** Ghi nhận thay đổi: lưu tạm trên máy ngay, lên server sau 2 giây (hoặc ngay nếu immediate) */
  function applyChange({ settings: s, content: c }, { src = 'editor', sourceName = '', immediate = false } = {}) {
    const next = { settings: s ?? latest.current.settings, content: c ?? latest.current.content };
    latest.current = next;
    dirty.current = true;
    if (c) {
      contentDirty.current = true;
      // "import" được ưu tiên giữ lại để ghi đúng lịch sử, kể cả khi có sửa nhỏ ngay sau đó
      if (source.current.source !== 'import' || src === 'import') source.current = { source: src, sourceName };
    }
    if (s) setSettings(s);
    if (c) setContent(c);
    writeBackup(examId, { baseVersion: version.current, ...next, contentDirty: contentDirty.current });
    setSaveState((st) => ({ ...st, kind: 'pending' }));
    clearTimeout(saveTimer.current);
    if (immediate) return save();
    saveTimer.current = setTimeout(save, SAVE_DELAY_MS);
    return Promise.resolve(true);
  }

  const updateSetting = (name, value) => applyChange({ settings: { ...latest.current.settings, [name]: value } });
  const updateContent = (c, opts) => applyChange({ content: c }, opts);

  // ---------- Xin khóa khi mở trang ----------
  useEffect(() => {
    let cancelled = false;
    apiPost(`/admin/exams/${examId}/lock`)
      .then((r) => {
        if (cancelled) return;
        setLock(r.lock);
        if (r.ok) {
          changeMode('edit');
          // Còn thay đổi lưu tạm trên máy từ lần trước (cùng version) -> khôi phục
          const b = readBackup(examId);
          if (b && b.baseVersion === version.current && b.settings) {
            latest.current = { settings: b.settings, content: b.content || latest.current.content };
            dirty.current = true;
            contentDirty.current = !!b.contentDirty;
            setSettings(latest.current.settings);
            setContent(latest.current.content);
            setNotice({ type: 'info', text: 'Đã khôi phục những thay đổi chưa kịp lưu lần trước trên máy này.' });
            saveTimer.current = setTimeout(save, 500);
          } else if (b) {
            clearBackup(examId);
          }
        } else {
          changeMode('readonly');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          changeMode('readonly');
          setLockMessage(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [examId, save]);

  // ---------- Heartbeat (chế độ sửa) / theo dõi khóa (chế độ xem) ----------
  useEffect(() => {
    if (mode === 'edit') {
      const t = setInterval(async () => {
        try {
          const r = await apiPost(`/admin/exams/${examId}/heartbeat`);
          if (!r.ok) {
            changeMode('readonly');
            setLock(r.lock);
            setLockMessage(`${r.lock?.displayName || 'Người khác'} đã giành quyền chỉnh sửa. Bạn đang ở chế độ chỉ xem.`);
          }
        } catch {
          // mất mạng: lần sau thử lại
        }
      }, HEARTBEAT_MS);
      return () => clearInterval(t);
    }
    if (mode === 'readonly') {
      const t = setInterval(async () => {
        try {
          setLock((await apiGet(`/admin/exams/${examId}/lock`)).lock);
        } catch {
          // bỏ qua
        }
      }, LOCK_POLL_MS);
      return () => clearInterval(t);
    }
    return undefined;
  }, [mode, examId]);

  // ---------- Rời trang: lưu ngay, trả khóa, cảnh báo nếu còn thay đổi chưa lưu ----------
  useEffect(() => {
    const release = () => {
      if (modeRef.current !== 'edit') return;
      // keepalive: request vẫn được gửi dù trang đang đóng
      fetch(`/api/admin/exams/${examId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {});
    };
    const onHidden = () => document.visibilityState === 'hidden' && save();
    const onBeforeUnload = (e) => {
      if (dirty.current && modeRef.current === 'edit') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', release);
      // Rời trang trong web (bấm menu khác)
      clearTimeout(saveTimer.current);
      if (dirty.current && modeRef.current === 'edit') save().finally(release);
      else release();
    };
  }, [examId, save]);

  // ---------- Giành quyền / bắt đầu sửa ----------
  async function takeOver() {
    const ok = window.confirm(
      `${lock?.displayName || 'Người khác'} đang chỉnh sửa đề này.\n\n` +
        'Nếu bạn giành quyền, những thay đổi chưa lưu của người đó sẽ không được lưu nữa ' +
        '(họ sẽ được báo trên màn hình).\n\nBạn có chắc muốn giành quyền chỉnh sửa?'
    );
    if (ok) await startEditing('/takeover');
  }

  async function startEditing(path = '/lock') {
    setBusy(true);
    try {
      const r = await apiPost(`/admin/exams/${examId}${path}`);
      if (r.ok === false) {
        setLock(r.lock);
        setLockMessage(`${r.lock?.displayName} vừa mở đề này trước bạn.`);
        return;
      }
      clearBackup(examId);
      await refresh({ resetDraft: true });
      setLockMessage('');
      setConflict('');
      changeMode('edit');
      setNotice({ type: 'success', text: 'Bạn đang giữ quyền chỉnh sửa đề này.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const readOnly = mode !== 'edit';
  const exam = meta.exam;

  // Các tab dùng chung những thứ này
  const tabProps = {
    examId,
    readOnly,
    settings,
    content,
    media,
    setMedia,
    updateSetting,
    updateContent,
    applyChange,
    save,
    refresh,
    meta,
    setNotice,
    busy,
    setBusy,
    version,
    handleConflict,
    goToTab: setTab,
  };

  return (
    <>
      <p className="breadcrumb">
        <Link to="/admin/de-thi">Đề thi</Link> / {exam.code}
      </p>

      <div className="page-head">
        <div>
          <h1 className="admin-title">{settings.title || exam.title}</h1>
          <div className="exam-edit-status">
            <ExamStatusTag exam={{ status: exam.status, hasUnpublishedChanges: meta.hasUnpublishedChanges, everPublished: !!meta.published }} />
            <span className="muted small-text">{content.questions.length} {isCustom ? 'question' : 'câu'}</span>
            {mode === 'edit' && <SaveStatus state={saveState} />}
          </div>
        </div>
        <div className="page-head-actions">
          {mode === 'edit' && (
            <button type="button" className="btn btn-secondary" onClick={save} disabled={busy}>
              Lưu
            </button>
          )}
          <a href={`/admin/xem-truoc/${examId}`} target="_blank" rel="noreferrer" className="btn btn-secondary" data-tour="preview">
            Xem trước
          </a>
        </div>
      </div>

      {mode === 'checking' && <p className="muted">Đang kiểm tra quyền chỉnh sửa…</p>}

      {mode === 'readonly' && (
        <div className="lock-banner">
          {lock && !lock.isMine ? (
            <>
              <p>
                <strong>{lock.displayName}</strong> đang chỉnh sửa đề này từ {timeHHmm(lock.since)}. Bạn đang ở{' '}
                <strong>chế độ chỉ xem</strong>.
              </p>
              {lockMessage && <p>{lockMessage}</p>}
              <p className="small-text">
                Nếu bạn giành quyền, trang sẽ lấy bản mới nhất trên server; thay đổi chưa lưu của bạn (nếu có) sẽ không được giữ.
              </p>
              <button type="button" className="btn btn-danger btn-small" onClick={takeOver} disabled={busy}>
                Giành quyền chỉnh sửa
              </button>
            </>
          ) : (
            <>
              <p>{lockMessage || 'Hiện không còn ai chỉnh sửa đề này.'}</p>
              <button type="button" className="btn btn-primary btn-small" onClick={() => startEditing()} disabled={busy}>
                Bắt đầu chỉnh sửa
              </button>
            </>
          )}
        </div>
      )}

      {conflict && (
        <div className="lock-banner is-error" role="alert">
          <p>{conflict}</p>
          <p>Thay đổi chưa lưu của bạn sẽ mất khi tải lại.</p>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {
              dirty.current = false;
              clearBackup(examId);
              window.location.reload();
            }}
          >
            Tải lại trang
          </button>
        </div>
      )}

      {notice.text && (
        <p
          className={`admin-message ${notice.type === 'error' ? 'alert-error' : notice.type === 'success' ? 'alert-success' : 'login-notice'}`}
          role="status"
        >
          {notice.text}
        </p>
      )}

      <nav className="edit-tabs" aria-label="Các phần của đề">
        {tabs.map((t) => (
          <button
            key={t.id}
            data-tour={`tab-${t.id}`}
            type="button"
            className={`edit-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => {
              setNotice({ type: '', text: '' });
              setTab(t.id);
            }}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="edit-tab-body">
        {tab === 'info' && <SettingsTab {...tabProps} />}
        {tab === 'import' && <ImportTab {...tabProps} />}
        {tab === 'answers' && <AnswersTab {...tabProps} />}
        {tab === 'questions' && <QuestionsTab {...tabProps} />}
        {tab === 'files' && <FilesTab {...tabProps} />}
        {tab === 'publish' && <PublishTab {...tabProps} />}
        {tab === 'builder' && <CustomBuilderTab {...tabProps} />}
      </div>
    </>
  );
}

function SaveStatus({ state }) {
  const text = {
    idle: '',
    pending: 'Chưa lưu…',
    saving: 'Đang lưu…',
    saved: `Đã lưu lúc ${timeHHmm(state.at)}`,
    offline: 'Mất kết nối, đã lưu tạm trên máy',
    invalid: `Chưa lưu: ${state.message}`,
  }[state.kind];
  if (!text) return null;
  const bad = state.kind === 'offline' || state.kind === 'invalid';
  return (
    <span className={`save-status ${bad ? 'is-bad' : ''}`} role="status">
      {text}
    </span>
  );
}
