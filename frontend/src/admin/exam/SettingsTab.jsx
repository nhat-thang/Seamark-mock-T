import { useState } from 'react';
import { FileSelect } from './FileSelect.jsx';
import { partsOf, TOEIC_PART_DEFAULTS } from '../../utils/parts.js';

// Tab "Thông tin đề": mã, tên, thời gian, cài đặt hiển thị, ghi chú nội bộ, audio phần nghe.
export default function SettingsTab(props) {
  const { readOnly, settings: form, updateSetting: update, meta } = props;
  return (
    <>
    <section className="admin-section">
      <fieldset className="card exam-settings" disabled={readOnly}>
        <div className="admin-form-row">
          <div className="field">
            <label htmlFor="e-code">Mã đề</label>
            <input id="e-code" className="input" value={form.code} onChange={(e) => update('code', e.target.value.toUpperCase())} />
          </div>
          <div className="field exam-settings-title">
            <label htmlFor="e-title">Tên đề (học viên nhìn thấy)</label>
            <input id="e-title" className="input" value={form.title} onChange={(e) => update('title', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="e-duration">Thời gian làm bài (phút)</label>
            <input
              id="e-duration"
              className="input"
              type="number"
              min="1"
              max="600"
              value={form.durationMinutes}
              onChange={(e) => update('durationMinutes', e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        <div className="exam-settings-checks">
          <label className="checkbox-label">
            <input type="checkbox" checked={form.showAnswersAfter} onChange={(e) => update('showAnswersAfter', e.target.checked)} />
            Cho học viên xem đáp án và giải thích sau khi nộp bài
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.allowSeekAudio} onChange={(e) => update('allowSeekAudio', e.target.checked)} />
            Cho học viên tua audio (mặc định: chỉ được phát / tạm dừng)
          </label>
        </div>

        <div className="field">
          <label htmlFor="e-note">Ghi chú nội bộ</label>
          <textarea
            id="e-note"
            className="input textarea"
            rows={4}
            value={form.internalNote}
            onChange={(e) => update('internalNote', e.target.value)}
            placeholder="Ví dụ: nguồn đề, lớp nào đã làm, câu nào cần sửa…"
          />
          <p className="field-hint">Chỉ admin thấy. Học viên không bao giờ thấy ghi chú này.</p>
        </div>
      </fieldset>
      <p className="field-hint">
        Thay đổi được tự động lưu vào bản nháp. Học viên chỉ thấy thay đổi (kể cả tên đề, thời gian, các ô đánh dấu) sau khi
        bạn bấm "{meta.published ? 'Xuất bản lại' : 'Xuất bản'}" ở tab "Kiểm tra & xuất bản".
      </p>
    </section>

    {props.content.examType === 'CUSTOM' ? (
      <CustomSettings {...props} />
    ) : (
      <>
        <AudioSettings {...props} />
        <ToeicPartsSettings {...props} />
      </>
    )}
    </>
  );
}

/**
 * Audio phần nghe: 1 file cho cả Listening, hoặc mỗi Part (1–4) một file.
 * Học viên nghe file cả bài nếu có, không thì nghe file của Part đang làm.
 */
function AudioSettings({ readOnly, content, media, updateContent, examId, setMedia, handleConflict }) {
  const audio = content.audio || { full: null, parts: {} };
  const partNames = [1, 2, 3, 4].map((p) => audio.parts?.[p]).filter(Boolean);
  const [mode, setMode] = useState(partNames.length && !audio.full ? 'parts' : 'full');
  const uploader = { examId, setMedia, handleConflict };

  const setAudio = (next) => updateContent({ ...content, audio: next }, { src: 'files' });

  function switchMode(m) {
    if (m === mode) return;
    const losing = m === 'full' ? partNames : audio.full ? [audio.full] : [];
    if (
      losing.length &&
      !window.confirm(`Đổi cách dùng audio sẽ bỏ gán: ${losing.join(', ')}.
(File vẫn còn trong tab "Ảnh & audio".)

Tiếp tục?`)
    ) {
      return;
    }
    setMode(m);
    setAudio(m === 'full' ? { full: audio.full, parts: { 1: null, 2: null, 3: null, 4: null } } : { full: null, parts: { ...audio.parts } });
  }

  const hasListening = content.questions.some((q) => q.part <= 4);

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Audio phần nghe (Listening)</h2>
      <fieldset className="card exam-settings" disabled={readOnly}>
        {!hasListening && (
          <p className="field-hint">Đề chưa có câu Part 1–4. Có thể tải audio trước, học viên chỉ nghe khi đề có câu phần nghe.</p>
        )}
        <div className="exam-settings-checks" role="radiogroup" aria-label="Cách dùng audio">
          <label className="checkbox-label">
            <input type="radio" name="audio-mode" checked={mode === 'full'} onChange={() => switchMode('full')} />
            Một file audio cho cả phần nghe (Part 1–4)
          </label>
          <label className="checkbox-label">
            <input type="radio" name="audio-mode" checked={mode === 'parts'} onChange={() => switchMode('parts')} />
            Mỗi Part một file riêng
          </label>
        </div>

        {mode === 'full' ? (
          <div className="field">
            <label htmlFor="audio-full">File audio cả phần nghe</label>
            <FileSelect
              id="audio-full"
              kind="audio"
              media={media}
              value={audio.full}
              onChange={(v) => setAudio({ ...audio, full: v })}
              uploader={uploader}
            />
          </div>
        ) : (
          [1, 2, 3, 4].map((p) => (
            <div key={p} className="field">
              <label htmlFor={`audio-p${p}`}>Audio Part {p}</label>
              <FileSelect
                id={`audio-p${p}`}
                kind="audio"
                media={media}
                value={audio.parts?.[p] || null}
                onChange={(v) => setAudio({ ...audio, parts: { ...audio.parts, [p]: v } })}
                uploader={uploader}
              />
            </div>
          ))
        )}
        <p className="field-hint">
          Nhận file mp3, m4a, wav. Bấm nút phát để nghe thử. Học viên có được tua hay không: xem ô "Cho học viên tua audio" ở trên.
          Đổi audio xong cũng cần bấm "Xuất bản lại" thì học viên mới nghe bản mới.
        </p>
      </fieldset>
    </section>
  );
}

/** Đề tự thiết kế: xáo trộn câu hỏi cho từng học viên */
function CustomSettings({ readOnly, content, updateContent }) {
  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Thứ tự question</h2>
      <fieldset className="card exam-settings" disabled={readOnly}>
        <label className="checkbox-label exam-settings-big-check">
          <input
            type="checkbox"
            checked={!!content.shuffleQuestions}
            onChange={(e) => updateContent({ ...content, shuffleQuestions: e.target.checked }, { src: 'editor' })}
          />
          Xáo trộn question: mỗi học viên làm theo một thứ tự question khác nhau
        </label>
        <p className="field-hint">
          Question được xáo trong từng part (các part vẫn theo đúng thứ tự); các question của cùng một nhóm đọc hiểu luôn đi liền nhau.
          Số question học viên thấy được đánh lại 1, 2, 3… theo thứ tự của họ. Trang "Xem trước" luôn hiện thứ tự gốc.
        </p>
      </fieldset>
    </section>
  );
}

/** Đề TOEIC: tên + lời dặn của 7 Part (hiện cho học viên trước câu đầu tiên của mỗi Part) */
function ToeicPartsSettings({ readOnly, content, updateContent }) {
  const parts = partsOf(content);
  const setPart = (no, patch) =>
    updateContent({ ...content, parts: parts.map((p) => (p.no === no ? { ...p, ...patch } : p)) }, { src: 'editor' });
  const resetAll = () => {
    if (window.confirm('Đưa tên và lời dặn của cả 7 Part về mặc định?')) {
      updateContent({ ...content, parts: TOEIC_PART_DEFAULTS.map((d) => ({ ...d })) }, { src: 'editor' });
    }
  };
  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Tên và lời dặn từng Part</h2>
      <fieldset className="card exam-settings" disabled={readOnly}>
        <p className="field-hint parts-hint">Học viên thấy tên Part và lời dặn ngay trước câu đầu tiên của mỗi Part. Để trống lời dặn nếu không cần.</p>
        {parts.map((p) => (
          <div key={p.no} className="part-setting">
            <div className="field">
              <label htmlFor={`pn-${p.no}`}>Tên Part {p.no}</label>
              <input id={`pn-${p.no}`} className="input" value={p.name} onChange={(e) => setPart(p.no, { name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`pd-${p.no}`}>Lời dặn</label>
              <textarea id={`pd-${p.no}`} className="input textarea" rows={2} value={p.directions} onChange={(e) => setPart(p.no, { directions: e.target.value })} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-small" onClick={resetAll}>
          Đưa về mặc định
        </button>
      </fieldset>
    </section>
  );
}
