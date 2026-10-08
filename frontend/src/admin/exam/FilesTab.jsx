import { useState } from 'react';
import { apiPost, apiUpload } from '../../utils/api.js';
import { fileSlots, formatSize, mediaKind, sameFile } from '../../utils/fileRefs.js';
import DropZone from './DropZone.jsx';

const ACCEPT = '.mp3,.m4a,.wav,.jpg,.jpeg,.png,.webp';

// Tab "Ảnh & audio": kéo thả nhiều file, tự khớp theo tên đã ghi trong Excel, gán tay file chưa khớp.
export default function FilesTab({ examId, readOnly, content, media, setMedia, updateContent, busy, setBusy, handleConflict }) {
  const [report, setReport] = useState(null); // kết quả lần tải lên gần nhất
  const [error, setError] = useState('');

  const slots = fileSlots(content);
  const usedBy = (m) => slots.filter((s) => s.name && sameFile(s.name, m.name)).map((s) => s.label);
  const unused = media.filter((m) => usedBy(m).length === 0);
  const missingCount = slots.filter((s) => s.name && !media.some((m) => sameFile(m.name, s.name))).length;

  async function upload(files) {
    setError('');
    setReport(null);
    setBusy(true);
    try {
      // Gửi từng đợt 10 file cho đỡ nặng
      const accepted = [];
      const rejected = [];
      for (let i = 0; i < files.length; i += 10) {
        const r = await apiUpload(`/admin/exams/${examId}/media`, 'files', files.slice(i, i + 10));
        accepted.push(...r.accepted);
        rejected.push(...r.rejected);
        setMedia(r.media);
      }
      setReport({ accepted, rejected });
    } catch (err) {
      if (!(err.status === 409 && handleConflict(err))) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    const used = usedBy(m);
    const msg = used.length
      ? `File "${m.name}" đang được dùng ở: ${used.join(', ')}.\nXóa thì các chỗ này sẽ thiếu file.\n\nVẫn xóa?`
      : `Xóa file "${m.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      const r = await apiPost(`/admin/exams/${examId}/media/${m.id}/delete`);
      setMedia(r.media);
    } catch (err) {
      if (!(err.status === 409 && handleConflict(err))) setError(err.message);
    }
  }

  // Gán file cho một chỗ trong đề (ghi tên file vào nội dung đề)
  function assign(slot, name) {
    updateContent(slot.set(content, name || null), { src: 'files' });
  }

  return (
    <>
      <section className="admin-section">
        <div className="card">
          <h2 className="admin-section-title">Tải ảnh / audio lên</h2>
          <p className="field-hint">
            Chọn cùng lúc nhiều file (mp3, m4a, wav, jpg, png, webp). File có tên trùng với tên đã ghi trong Excel sẽ{' '}
            <strong>tự khớp</strong> vào đúng câu. Tải lên file trùng tên với file cũ thì file mới sẽ thay file cũ.
          </p>
          {readOnly ? (
            <p className="muted">Bạn đang ở chế độ chỉ xem nên không tải file được.</p>
          ) : (
            <DropZone accept={ACCEPT} multiple disabled={busy} onFiles={upload}>
              {busy ? 'Đang tải lên…' : 'Kéo thả ảnh / audio vào đây, hoặc bấm để chọn file'}
            </DropZone>
          )}
          {error && <p className="alert-error admin-message" role="alert">{error}</p>}
          {report && (
            <div className="upload-report">
              {report.accepted.length > 0 && <p className="alert-success">Đã tải lên {report.accepted.length} file.</p>}
              {report.rejected.length > 0 && (
                <div className="check-result has-errors">
                  <p><strong>{report.rejected.length} file không nhận:</strong></p>
                  <ul>{report.rejected.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">
          Các chỗ cần file trong đề{' '}
          {missingCount > 0 ? <span className="tag tag-off">Còn thiếu {missingCount} file</span> : slots.length > 0 && <span className="tag tag-ok">Đủ file</span>}
        </h2>
        {slots.length === 0 ? (
          <p className="muted">Đề chưa có chỗ nào cần ảnh hay audio.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Chỗ dùng</th>
                  <th>Tên file trong đề</th>
                  <th>Trạng thái</th>
                  <th>Gán file khác</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const file = s.name ? media.find((m) => sameFile(m.name, s.name)) : null;
                  const choices = media.filter((m) => mediaKind(m) === s.kind);
                  return (
                    <tr key={s.id}>
                      <td>{s.label}</td>
                      <td>{s.name || <span className="muted">(chưa có)</span>}</td>
                      <td>
                        {file ? (
                          <span className="tag tag-ok">Đã có</span>
                        ) : (
                          <span className="tag tag-off">{s.name ? 'Chưa tải lên' : 'Trống'}</span>
                        )}
                        {file && (
                          <a href={file.url} target="_blank" rel="noreferrer" className="small-text file-open">
                            Mở xem
                          </a>
                        )}
                      </td>
                      <td>
                        <select
                          className="input input-small"
                          value={file ? file.name : ''}
                          disabled={readOnly}
                          onChange={(e) => assign(s, e.target.value)}
                          aria-label={`Gán file cho ${s.label}`}
                        >
                          <option value="">{file ? '(Bỏ gán)' : '— Chọn file —'}</option>
                          {choices.map((m) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">File đã tải lên ({media.length})</h2>
        {unused.length > 0 && (
          <p className="text-warn small-text admin-message">
            {unused.length} file chưa khớp với chỗ nào trong đề. Hãy gán ở bảng phía trên (cột "Gán file khác"), hoặc xóa nếu không cần.
          </p>
        )}
        {media.length === 0 ? (
          <p className="muted">Chưa có file nào.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên file</th>
                  <th>Loại</th>
                  <th>Dung lượng</th>
                  <th>Đang dùng ở</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {media.map((m) => {
                  const used = usedBy(m);
                  return (
                    <tr key={m.id}>
                      <td>
                        <a href={m.url} target="_blank" rel="noreferrer">{m.name}</a>
                      </td>
                      <td>{mediaKind(m) === 'audio' ? 'Audio' : 'Ảnh'}</td>
                      <td className="nowrap">{formatSize(m.size)}</td>
                      <td>{used.length ? used.join(', ') : <span className="tag tag-warn">Chưa dùng</span>}</td>
                      <td>
                        {!readOnly && (
                          <button type="button" className="btn btn-danger btn-small" onClick={() => remove(m)}>
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
