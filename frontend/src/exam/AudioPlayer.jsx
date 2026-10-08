import { useEffect, useRef, useState } from 'react';

const fmt = (sec) => {
  if (!Number.isFinite(sec)) return '--:--';
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Trình phát audio Listening.
 * allowSeek = false: chỉ có nút Phát / Tạm dừng, thanh tiến trình chỉ để xem (không kéo được).
 * allowSeek = true : dùng thanh điều khiển có sẵn của trình duyệt (tua được).
 */
export default function AudioPlayer({ src, allowSeek, label }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [error, setError] = useState('');

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setError('');
  }, [src]);

  if (allowSeek) {
    return (
      <div className="audio-bar">
        {label && <span className="audio-label">{label}</span>}
        <audio controls src={src} preload="metadata" className="audio-native" controlsList="nodownload" />
      </div>
    );
  }

  async function toggle() {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) await a.play();
      else a.pause();
    } catch {
      setError('Không phát được audio. Hãy thử lại hoặc báo giáo viên.');
    }
  }

  const percent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="audio-bar">
      {label && <span className="audio-label">{label}</span>}
      <button type="button" className="btn btn-primary btn-small audio-btn" onClick={toggle}>
        {playing ? 'Tạm dừng' : time > 0 ? 'Phát tiếp' : 'Phát audio'}
      </button>
      <div className="audio-progress" aria-hidden="true">
        <div className="audio-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="audio-time">
        {fmt(time)} / {fmt(duration)}
      </span>
      {error && <span className="text-error small-text">{error}</span>}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setError('Không tải được file audio.')}
      />
    </div>
  );
}
