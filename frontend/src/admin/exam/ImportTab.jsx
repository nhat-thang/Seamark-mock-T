import { useState } from 'react';
import { apiUpload } from '../../utils/api.js';
import { STANDARD_PARTS } from '../../utils/examStructure.js';
import { CheckResult } from './PublishTab.jsx';
import DropZone from './DropZone.jsx';

const SETTING_LABELS = { code: 'Mã đề', title: 'Tên đề', durationMinutes: 'Thời gian (phút)', internalNote: 'Ghi chú nội bộ' };

// Tab "Import Excel": tải file -> xem trước + lỗi -> bấm "Áp dụng" mới ghi vào bản nháp.
export default function ImportTab({ examId, readOnly, content, settings, applyChange, setNotice, busy, setBusy, goToTab }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    setError('');
    setResult(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setError('Hãy chọn file Excel có đuôi .xlsx (theo file mẫu).');
      return;
    }
    setBusy(true);
    try {
      setResult(await apiUpload(`/admin/exams/${examId}/import/preview`, 'file', [file]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const existing = content.questions.length;
    const ok = window.confirm(
      (existing
        ? `Bản nháp đang có ${existing} câu. Áp dụng sẽ THAY TOÀN BỘ câu hỏi, nhóm câu và tên file audio bằng nội dung trong file.\n\n`
        : '') + `Áp dụng file "${result.fileName}" vào bản nháp?`
    );
    if (!ok) return;
    setBusy(true);
    const saved = await applyChange(
      { settings: { ...settings, ...result.settings }, content: { ...result.content, parts: content.parts } },
      { src: 'import', sourceName: result.fileName, immediate: true }
    );
    setBusy(false);
    if (saved) {
      setResult(null);
      setNotice({
        type: 'success',
        text: `Đã áp dụng file "${result.fileName}": ${result.content.questions.length} câu. Tiếp theo: tải ảnh / audio (nếu có) ở tab "Ảnh & audio", rồi kiểm tra và xuất bản.`,
      });
    }
  }

  const canApply = result && result.errors.length === 0 && !readOnly;

  return (
    <>
      <section className="admin-section">
        <div className="card">
          <h2 className="admin-section-title">Nhập đề từ file Excel</h2>
          <ol className="steps">
            <li>
              Tải file mẫu: <a href="/api/admin/excel-template" download>mau-de-toeic.xlsx</a>. Điền đề theo hướng dẫn trong trang
              «Hướng dẫn» của file (không đổi tên các trang và các cột).
            </li>
            <li>Kéo file đã điền vào ô bên dưới (hoặc bấm để chọn file).</li>
            <li>Xem lại bảng xem trước và danh sách lỗi. File không có lỗi thì bấm <strong>"Áp dụng vào bản nháp"</strong>.</li>
          </ol>
          {readOnly ? (
            <p className="muted">Bạn đang ở chế độ chỉ xem nên không import được.</p>
          ) : (
            <DropZone accept=".xlsx" multiple={false} disabled={busy} onFiles={handleFiles}>
              {busy ? 'Đang đọc file…' : 'Kéo thả file Excel (.xlsx) vào đây, hoặc bấm để chọn file'}
            </DropZone>
          )}
          {error && <p className="alert-error admin-message" role="alert">{error}</p>}
        </div>
      </section>

      {result && (
        <section className="admin-section">
          <h2 className="admin-section-title">Kết quả đọc file "{result.fileName}"</h2>

          {result.errors.length > 0 ? (
            <CheckResult
              result={{ errors: result.errors, warnings: result.warnings }}
              errorTitle={`File có ${result.errors.length} lỗi nên CHƯA áp dụng. Hãy sửa trong file Excel rồi tải lên lại:`}
            />
          ) : (
            <>
              <p className="alert-success admin-message">
                File đọc được: {result.content.questions.length} câu, {result.content.groups.length} nhóm câu. Chưa có gì
                được ghi — bấm "Áp dụng vào bản nháp" để lưu.
              </p>
              {result.publishIssues.length > 0 && (
                <CheckResult
                  result={{ errors: result.publishIssues, warnings: [] }}
                  errorTitle={`Còn ${result.publishIssues.length} chỗ cần bổ sung trước khi xuất bản (vẫn áp dụng và lưu nháp được):`}
                />
              )}
              {result.warnings.length > 0 && <CheckResult result={{ errors: [], warnings: result.warnings }} />}

              <div className="card import-summary">
                {Object.keys(result.settings).length > 0 && (
                  <div className="import-settings">
                    <strong>Thông tin đề trong file (sẽ thay thông tin hiện tại):</strong>
                    <ul>
                      {Object.entries(result.settings).map(([k, v]) => (
                        <li key={k}>
                          {SETTING_LABELS[k]}: <strong>{String(v)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="import-parts">
                  {STANDARD_PARTS.map((p) => {
                    const n = result.content.questions.filter((q) => q.part === p.part).length;
                    return (
                      <span key={p.part} className={`tag ${n === p.to - p.from + 1 ? 'tag-ok' : n ? 'tag-warn' : 'tag-info'}`}>
                        Part {p.part}: {n}/{p.to - p.from + 1}
                      </span>
                    );
                  })}
                </div>
                <PreviewTable content={result.content} />
              </div>

              <div className="admin-form-actions">
                <button type="button" className="btn btn-primary" onClick={apply} disabled={!canApply || busy}>
                  Áp dụng vào bản nháp
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>
                  Hủy
                </button>
                <button type="button" className="btn btn-link" onClick={() => goToTab('files')}>
                  Đến tab "Ảnh & audio"
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

// Bảng xem trước từng câu (rút gọn)
function PreviewTable({ content }) {
  const short = (s, n = 70) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
  return (
    <div className="table-wrap import-table">
      <table className="table">
        <thead>
          <tr>
            <th>Câu</th>
            <th>Part</th>
            <th>Nhóm</th>
            <th>Câu hỏi</th>
            <th>Đáp án</th>
            <th>Ảnh</th>
          </tr>
        </thead>
        <tbody>
          {content.questions.map((q) => (
            <tr key={q.no}>
              <td>{q.no}</td>
              <td>{q.part}</td>
              <td className="nowrap">{q.groupCode || ''}</td>
              <td>{short(q.question) || <span className="muted">{q.part <= 2 ? '(trong audio)' : q.part === 6 ? '(chỗ trống)' : '(trống)'}</span>}</td>
              <td>{q.answer || <span className="text-error">Thiếu</span>}</td>
              <td className="nowrap">{q.image || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
