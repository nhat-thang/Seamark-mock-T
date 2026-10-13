import { useMemo, useState } from 'react';
import { apiPost, apiUpload } from '../../utils/api.js';
import { FIELD_OPTIONS, buildStudents, mappingError } from '../../utils/rosterImport.js';
import { formatDate, vnToday } from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import Modal from './Modal.jsx';

const MAX_IMPORT = 300;

/**
 * Nhập danh sách lớp từ file Excel bất kỳ:
 * 1. Chọn file -> server đọc và đoán từng cột (Họ và tên / phụ huynh / SĐT / CCCD / Ngày vào học / cột lạ...).
 *    Nhập từ Excel chỉ bắt buộc họ tên; thiếu thông tin phụ huynh thì lớp hiện nhãn "Thiếu thông tin" để bổ sung sau.
 * 2. Giáo viên kiểm tra các cột (đổi nếu đoán sai), xem trước từng dòng, bỏ tích dòng không muốn nhập.
 * 3. Bấm "Nhập" -> lưu qua API thêm học sinh như bình thường (có ghi lịch sử).
 */
export default function ImportStudentsDialog({ cls, existing, defaultJoinedOn, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fields, setFields] = useState([]);
  // '' = các dòng không ghi ngày bắt đầu từ buổi sắp tới gần nhất của lớp (server tự chọn)
  const [joinedOn, setJoinedOn] = useState(defaultJoinedOn || '');
  const [toggled, setToggled] = useState({}); // số dòng -> có nhập hay không (giáo viên tự bấm)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function readFile(f, sheet) {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const query = sheet !== undefined ? `?sheet=${sheet}` : '';
      const p = await apiUpload(`/admin/classes/${cls.id}/import/preview${query}`, 'file', [f]);
      setFile(f);
      setPreview(p);
      setFields(p.columns.map((c) => c.field));
      setToggled({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const problem = preview ? mappingError(fields) : '';
  const students = useMemo(() => {
    if (!preview || problem) return [];
    return buildStudents({ columns: preview.columns, rows: preview.rows, fields, defaultJoinedOn: joinedOn, existing }).map((s) => ({
      ...s,
      include: s.problems.length === 0 && (toggled[s.rowNumber] ?? s.include),
    }));
  }, [preview, fields, joinedOn, existing, toggled, problem]);
  const chosen = students.filter((s) => s.include);
  const tooMany = chosen.length > MAX_IMPORT;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await apiPost(`/admin/classes/${cls.id}/students`, {
        fileName: preview.fileName,
        students: chosen.map((s) => ({
          fullName: s.fullName, parentName: s.parentName, parentPhone: s.parentPhone, parentIdNumber: s.parentIdNumber, joinedOn: s.joinedOn || undefined, note: s.note,
        })),
      });
      onDone(chosen.length, preview.fileName);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const footer = preview ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
      <button type="button" className="btn btn-primary cl-btn-icon" disabled={busy || Boolean(problem) || chosen.length === 0 || tooMany} onClick={submit}>
        <LineIcon name="check" size={20} /> {busy ? 'Đang nhập…' : `Nhập ${chosen.length} học sinh`}
      </button>
    </>
  ) : null;

  return (
    <Modal title="Nhập danh sách lớp từ Excel" onClose={onClose} footer={footer} wide xl={Boolean(preview)}>
      {!preview ? (
        <>
          <label
            className={`cl-drop ${dragging ? 'is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="cl-sr"
              onChange={(e) => readFile(e.target.files[0])}
            />
            <LineIcon name="upload" size={40} />
            <strong>{busy ? 'Đang đọc file…' : 'Bấm để chọn file Excel (.xlsx)'}</strong>
            <span>hoặc kéo thả file vào đây</span>
          </label>
          <ul className="cl-import-tips">
            <li>
              Dùng luôn file danh sách bạn đang có. Cột họ tên đặt tên gì cũng được ("Họ và tên", "Họ tên", "Name", "Tên học
              sinh"…). Web tự nhận cột, bạn kiểm tra lại trước khi nhập.
            </li>
            <li>Web nhận cả cột <strong>tên phụ huynh, SĐT phụ huynh, CCCD phụ huynh</strong>. Chỉ cột họ tên là bắt buộc — thiếu gì thì bổ sung sau.</li>
            <li>Cột khác như ngày sinh, trường… sẽ được <strong>gộp vào Ghi chú</strong>.</li>
            <li>Google Trang tính: <strong>Tệp → Tải xuống → Microsoft Excel (.xlsx)</strong> rồi chọn file vừa tải.</li>
            <li>
              Chưa có file? <a href="/api/admin/classes/import-template" download>Tải file mẫu</a> về điền.
            </li>
          </ul>
          {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        </>
      ) : (
        <div className="cl-import">
          <div className="cl-import-file">
            <LineIcon name="exam" size={22} />
            <strong>{preview.fileName}</strong>
            {preview.sheets.length > 1 && (
              <select className="input cl-filter" value={preview.sheetIndex} onChange={(e) => readFile(file, Number(e.target.value))} aria-label="Trang trong file">
                {preview.sheets.map((s) => (
                  <option key={s.index} value={s.index}>Trang «{s.name}» ({s.rows} dòng)</option>
                ))}
              </select>
            )}
            <button type="button" className="btn btn-link small-text" onClick={() => { setPreview(null); setError(''); }}>Chọn file khác</button>
          </div>

          <h3 className="cl-subtitle">1. Kiểm tra các cột</h3>
          <p className="muted small-text">
            {preview.headerRowNumber ? `Tên cột ở dòng ${preview.headerRowNumber} của file. ` : 'File không có dòng tên cột, web đoán theo nội dung. '}
            Cột nào web đoán sai thì chọn lại ở ô bên phải.
          </p>
          <div className="cl-map">
            {preview.columns.map((c, i) => (
              <div key={c.index} className={`cl-map-row ${fields[i] === 'skip' ? 'is-skip' : ''} ${['fullName', 'lastName', 'firstName'].includes(fields[i]) ? 'is-name' : ''}`}>
                <div className="cl-map-col">
                  <span className="cl-map-letter">{c.letter}</span>
                  <span className="cl-map-head">
                    <strong>{c.header || `(cột không có tên)`}</strong>
                    <span className="muted small-text">{c.samples.length ? c.samples.join(' · ') : 'trống'}</span>
                  </span>
                </div>
                <div className="cl-map-pick">
                  <select
                    className="input"
                    value={fields[i]}
                    aria-label={`Cột ${c.letter} là`}
                    onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? e.target.value : x)))}
                  >
                    {FIELD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {c.guessedBy === 'content' && fields[i] === c.field && <span className="cl-pill is-soon">Web đoán theo nội dung — kiểm tra lại</span>}
                </div>
              </div>
            ))}
          </div>
          {problem && <p className="alert-error admin-message" role="alert">{problem}</p>}

          <div className="cl-import-date field">
            <label htmlFor="imp-joined">Ngày vào học cho các dòng không ghi ngày</label>
            <input id="imp-joined" type="date" className="input" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
            <p className="field-hint">Để trống = bắt đầu từ buổi sắp tới gần nhất của lớp. Có ngày thì bắt đầu từ buổi đầu tiên của lớp kể từ ngày đó.</p>
          </div>

          {!problem && (
            <>
              <h3 className="cl-subtitle">
                2. Xem trước — sẽ nhập <span className="cl-import-count">{chosen.length}</span> / {students.length} học sinh
              </h3>
              <div className="table-wrap cl-import-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nhập</th>
                      <th>Dòng</th>
                      <th>Họ và tên</th>
                      <th>Phụ huynh</th>
                      <th>SĐT phụ huynh</th>
                      <th>CCCD</th>
                      <th>Vào học</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.rowNumber} className={s.problems.length ? 'is-error' : s.include ? '' : 'is-off'}>
                        <td>
                          <input
                            type="checkbox"
                            className="cl-check"
                            checked={s.include}
                            disabled={s.problems.length > 0}
                            aria-label={`Nhập dòng ${s.rowNumber}`}
                            onChange={(e) => setToggled((t) => ({ ...t, [s.rowNumber]: e.target.checked }))}
                          />
                        </td>
                        <td className="muted">{s.rowNumber}</td>
                        <td>
                          <strong>{s.fullName || '—'}</strong>
                          {s.problems.map((p) => <div key={p} className="text-error small-text">{p}</div>)}
                          {s.duplicate && <div className="small-text muted">{s.duplicate} (đã bỏ tích)</div>}
                          {s.warnings.map((w) => <div key={w} className="text-warn small-text">{w}</div>)}
                        </td>
                        <td>{s.parentName || <span className="muted">—</span>}</td>
                        <td className="nowrap">{s.parentPhone || <span className="muted">—</span>}</td>
                        <td className="nowrap">{s.parentIdNumber || <span className="muted">—</span>}</td>
                        <td className="nowrap">{s.joinedOn ? formatDate(s.joinedOn) : <span className="muted">Buổi sắp tới</span>}</td>
                        <td className="cl-import-note">{s.note || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {students.length === 0 && <p className="table-empty">File không có dòng học sinh nào.</p>}
              </div>
              {tooMany && <p className="alert-error admin-message">Mỗi lần nhập tối đa {MAX_IMPORT} học sinh. Hãy bỏ tích bớt hoặc chia file.</p>}
            </>
          )}
          {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
