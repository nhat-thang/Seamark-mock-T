import AudioPlayer from './AudioPlayer.jsx';
import { isCustomExam, partsOf } from '../utils/parts.js';

/**
 * Audio chung cho trang hiện tại:
 * - Đề TOEIC: 1 file cả bài Listening, hoặc file riêng của Part 1–4
 * - Đề tự thiết kế: audio của cả phần (nếu admin có gắn)
 */
export function audioForPart(content, part) {
  if (isCustomExam(content)) return partsOf(content).find((p) => p.no === part)?.audio || null;
  if (part > 4) return null;
  return content.audio?.full || content.audio?.parts?.[part] || null;
}

/** Thanh audio ở đầu trang (giữ nguyên khi chuyển câu nếu cùng file) */
export function ListeningAudio({ content, part, allowSeek }) {
  const src = audioForPart(content, part);
  if (!src) return null;
  let label = `Audio Part ${part}`;
  if (isCustomExam(content)) label = `Audio: ${partsOf(content).find((p) => p.no === part)?.name || `Part ${part}`}`;
  else if (content.audio?.full) label = 'Audio Listening';
  return <AudioPlayer key={src} src={src} allowSeek={allowSeek} label={label} />;
}

/** Tên phần + lời dặn, hiện ở trang đầu tiên của mỗi phần (trước câu đầu của phần) */
export function PartIntro({ content, part }) {
  const p = partsOf(content).find((x) => x.no === part);
  if (!p) return null;
  return (
    <div className="part-intro" role="note">
      <p className="part-intro-name">{p.name}</p>
      {p.directions && <p className="part-intro-directions">{p.directions}</p>}
    </div>
  );
}

/** Ảnh đoạn văn + ảnh kèm (+ audio) của nhóm câu */
export function GroupImages({ group, allowSeek = false }) {
  const images = [...(group.passageImages || []), ...(group.image ? [group.image] : [])];
  if (images.length === 0 && !group.audio) return null;
  return (
    <div className="group-images">
      {group.audio && <AudioPlayer key={group.audio} src={group.audio} allowSeek={allowSeek} label="Audio đoạn văn" />}
      {images.map((src, i) => (
        <img key={src + i} src={src} alt={`Ảnh ${i + 1} của nhóm câu`} className="group-image" loading="lazy" />
      ))}
    </div>
  );
}
