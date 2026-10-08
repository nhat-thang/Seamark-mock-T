import { useRef, useState } from 'react';
import { apiUpload } from '../../utils/api.js';
import { mediaKind, sameFile } from '../../utils/fileRefs.js';

const ACCEPT = {
  image: '.jpg,.jpeg,.png,.webp',
  audio: '.mp3,.m4a,.wav',
};

/**
 * Ô chọn file (ảnh hoặc audio): chọn trong các file đã tải lên, hoặc bấm "Tải … mới lên" (tải xong tự gán vào ô này).
 * Giữ cả tên file đã ghi (ví dụ từ Excel) nhưng chưa tải lên. Audio có trình phát để nghe thử.
 */
export function FileSelect({ id, kind, media, value, onChange, uploader }) {
  const noun = kind === 'audio' ? 'audio' : 'ảnh';
  const options = media.filter((m) => mediaKind(m) === kind);
  const missing = value && !options.some((m) => sameFile(m.name, value));
  return (
    <>
      <div className="file-select-row">
        <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">(Không có)</option>
          {missing && <option value={value}>{value} — chưa tải lên</option>}
          {options.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        {uploader && <UploadButton {...uploader} kind={kind} label={`Tải ${noun} mới lên`} onUploaded={(names) => onChange(names[0])} />}
      </div>
      {missing && (
        <p className="text-error small-text">
          File "{value}" chưa được tải lên. Bấm "Tải {noun} mới lên" và chọn đúng file có tên này.
        </p>
      )}
      {kind === 'audio' && value && !missing && (
        <audio
          className="audio-preview"
          controls
          preload="none"
          src={options.find((m) => sameFile(m.name, value))?.url}
          aria-label={`Nghe thử ${value}`}
        />
      )}
    </>
  );
}

/** Nút tải file lên ngay tại chỗ (kind: 'image' | 'audio'). onUploaded(danh sách tên file đã nhận) */
export function UploadButton({ examId, setMedia, handleConflict, label, kind = 'image', multiple = false, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiUpload(`/admin/exams/${examId}/media`, 'files', files);
      setMedia(r.media);
      if (r.accepted.length) onUploaded(r.accepted);
      if (r.rejected.length) setError(r.rejected.join(' '));
    } catch (err) {
      if (!(err.status === 409 && handleConflict(err))) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-small upload-inline" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Đang tải lên…' : label}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT[kind]} multiple={multiple} hidden onChange={upload} />
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
