import { useRef, useState } from 'react';

// Ô kéo thả file (hoặc bấm để chọn file). Không dùng icon, chỉ chữ.
export default function DropZone({ accept, multiple = true, disabled, onFiles, children }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <span>{children}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = ''; // cho phép chọn lại cùng file
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
