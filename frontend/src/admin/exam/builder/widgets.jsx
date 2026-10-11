// Các phần nhỏ dùng chung của trang soạn đề: menu ⋮, ô chữ tự giãn, nút gạt, popup chọn ảnh / audio.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { mediaKind } from '../../../utils/fileRefs.js';
import { UploadButton } from '../FileSelect.jsx';
import Icon, { IconButton } from './icons.jsx';

/** Ô chữ nhiều dòng tự giãn chiều cao theo nội dung */
export function AutoText({ value, onChange, className = '', minRows = 1, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={minRows} className={`fb-text ${className}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
  );
}

/** Nút gạt bật / tắt */
export function Switch({ checked, onChange, label }) {
  return (
    <label className="fb-switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="fb-switch-track" aria-hidden="true" />
    </label>
  );
}

/**
 * Menu mở ra khi bấm nút (⋮ hoặc nút tùy chọn).
 * items: [{ label, onClick, checked?, disabled?, icon? }] (null = bỏ qua). Đóng khi bấm ra ngoài hoặc phím Esc.
 */
export function Menu({ label, icon = 'more', items, align = 'right', button }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();
  const list = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Mở bằng bàn phím: đưa con trỏ vào mục đầu tiên
    ref.current?.querySelector('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onListKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const btns = [...ref.current.querySelectorAll('.fb-menu-item:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
  }

  return (
    <div className="fb-menu-wrap" ref={ref}>
      {button ? (
        button({ open, toggle: () => setOpen((o) => !o), menuId: id })
      ) : (
        <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} />
      )}
      {open && (
        <div className={`fb-menu fb-menu-${align}`} role="menu" id={id} aria-label={label} onKeyDown={onListKey}>
          {list.map((it) => (
            <button
              key={it.label}
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked === undefined ? undefined : it.checked}
              className="fb-menu-item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <span className="fb-menu-check" aria-hidden="true">
                {it.icon ? <Icon name={it.icon} size={20} /> : it.checked ? <Icon name="check" size={20} /> : null}
              </span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { image: 'Ảnh', audio: 'Audio' };

/**
 * Popup chọn ảnh / audio: tải file mới lên, hoặc chọn file đã có trong thư viện của đề (giống tab "Ảnh & audio").
 * kinds: ['image'] | ['audio'] | ['image', 'audio'].  onPick(tên file, loại)
 */
export function MediaPicker({ kinds, media, uploader, onPick, onClose, title = 'Chèn' }) {
  const [kind, setKind] = useState(kinds[0]);
  const ref = useRef(null);
  const files = media.filter((m) => mediaKind(m) === kind);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fb-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fb-modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="fb-modal-head">
          <strong>{title}</strong>
          <IconButton icon="close" label="Đóng" onClick={onClose} />
        </div>
        {kinds.length > 1 && (
          <div className="fb-tabs" role="tablist">
            {kinds.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={`fb-tab ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                <Icon name={k === 'image' ? 'image' : 'music'} size={20} /> {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        <div className="fb-modal-body">
          <div className="fb-picker-upload">
            <Icon name="upload" size={36} />
            <p>Tải {kind === 'image' ? 'ảnh' : 'audio'} mới từ máy tính lên</p>
            <UploadButton {...uploader} kind={kind} label={`Chọn file ${kind === 'image' ? 'ảnh' : 'audio'}`} onUploaded={(names) => onPick(names[0], kind)} />
            <p className="muted small-text">{kind === 'image' ? 'jpg, png, webp' : 'mp3, m4a, wav'}</p>
          </div>

          <p className="fb-picker-sub">Hoặc chọn file đã tải lên cho đề này ({files.length})</p>
          {files.length === 0 && <p className="muted small-text">Chưa có file {kind === 'image' ? 'ảnh' : 'audio'} nào.</p>}
          {kind === 'image' ? (
            <div className="fb-picker-grid">
              {files.map((m) => (
                <button key={m.id} type="button" className="fb-picker-thumb" onClick={() => onPick(m.name, 'image')} title={m.name}>
                  <img src={m.url} alt="" loading="lazy" />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <ul className="fb-picker-audio">
              {files.map((m) => (
                <li key={m.id}>
                  <span className="fb-picker-audio-name">{m.name}</span>
                  <audio controls preload="none" src={m.url} aria-label={`Nghe thử ${m.name}`} />
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => onPick(m.name, 'audio')}>
                    Chọn
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ảnh trong thẻ (theo tên file của bản nháp). File chưa tải lên -> báo đỏ. */
export function DraftImage({ name, url, className = '', alt = '' }) {
  if (!name) return null;
  if (!url) return <p className="text-error small-text">Ảnh "{name}" chưa được tải lên.</p>;
  return <img src={url} alt={alt} className={className} />;
}

/** Audio trong thẻ */
export function DraftAudio({ name, url }) {
  if (!name) return null;
  if (!url) return <p className="text-error small-text">Audio "{name}" chưa được tải lên.</p>;
  return <audio className="fb-audio" controls preload="none" src={url} aria-label={`Audio ${name}`} />;
}
