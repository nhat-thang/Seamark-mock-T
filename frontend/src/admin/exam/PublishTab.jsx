import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { formatDateTime } from '../../utils/format.js';
import { STANDARD_PARTS } from '../../utils/examStructure.js';

// Tab "Kiểm tra & xuất bản": tóm tắt nội dung, danh sách lỗi, xuất bản / ngừng mở đề, lịch sử xuất bản.
export default function PublishTab({ examId, readOnly, content, meta, save, refresh, setNotice, busy, setBusy, version, handleConflict }) {
  const [check, setCheck] = useState(null);
  const navigate = useNavigate();

  // Kiểm tra ngay khi mở tab (sau khi lưu thay đổi đang chờ)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await save();
      try {
        const r = await apiGet(`/admin/exams/${examId}/check`);
        if (!cancelled) setCheck(r);
      } catch {
        // bỏ qua, người dùng bấm "Kiểm tra lại"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, save]);

  async function recheck() {
    await save();
    setCheck(await apiGet(`/admin/exams/${examId}/check`));
  }

  async function publish() {
    setNotice({ type: '', text: '' });
    setBusy(true);
    try {
      if (!(await save())) {
        setNotice({ type: 'error', text: 'Chưa lưu được thay đổi nên chưa xuất bản. Hãy xem thông báo phía trên.' });
        return;
      }
      const c = await apiGet(`/admin/exams/${examId}/check`);
      setCheck(c);
      if (c.errors.length) return;
      const isRepublish = !!meta.published;
      const msg =
        (c.warnings.length ? `Lưu ý:\n- ${c.warnings.join('\n- ')}\n\n` : '') +
        (isRepublish
          ? 'Xuất bản lại: học viên sẽ thấy bản mới ngay. Ai đang làm dở vẫn làm tiếp trên bản cũ.\n\nTiếp tục?'
          : 'Xuất bản: học viên sẽ thấy đề này trong danh sách ngay.\n\nTiếp tục?');
      if (!window.confirm(msg)) return;
      const r = await apiPost(`/admin/exams/${examId}/publish`, { version: version.current });
      await refresh({ resetDraft: false });
      setNotice({ type: 'success', text: `Đã xuất bản (lần ${r.versionNo}). Học viên đã thấy bản này.` });
    } catch (err) {
      if (err.status === 422) setCheck(await apiGet(`/admin/exams/${examId}/check`));
      else if (!(err.status === 409 && handleConflict(err))) setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    const ok = window.confirm(
      'Ngừng mở đề: học viên sẽ không thấy đề này trong danh sách nữa.\n' +
        'Ai đang làm dở vẫn làm tiếp và được chấm điểm bình thường.\n\nTiếp tục?'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await save();
      await apiPost(`/admin/exams/${examId}/unpublish`, { version: version.current });
      await refresh({ resetDraft: false });
      setNotice({ type: 'success', text: 'Đã ngừng mở đề. Bấm "Xuất bản" để mở lại.' });
    } catch (err) {
      if (!(err.status === 409 && handleConflict(err))) setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const isPublished = meta.exam.status === 'published';

  // Xóa hẳn đề — chỉ admin chính (server cũng kiểm tra quyền)
  async function removeExam() {
    const code = meta.exam.code;
    const attempts = meta.attemptCount ?? 0;
    const ok = window.confirm(
      `Bạn có chắc chắn muốn XÓA HẲN đề "${meta.exam.title}" (${code})?

` +
        `Sẽ xóa luôn ${attempts} lượt làm bài của học viên và các file ảnh / audio của đề.
` +
        'Không khôi phục được.'
    );
    if (!ok) return;
    const typed = window.prompt(`Để xác nhận, hãy gõ lại mã đề: ${code}`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== code) {
      setNotice({ type: 'error', text: 'Mã đề gõ lại không khớp nên chưa xóa.' });
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost(`/admin/exams/${examId}/delete`, { confirmCode: typed });
      navigate('/admin/de-thi', {
        replace: true,
        state: { message: `Đã xóa đề "${meta.exam.title}" (${code}) cùng ${r.attempts} lượt làm bài.` },
      });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-section">
        <h2 className="admin-section-title">Nội dung bản nháp</h2>
        <ContentSummary content={content} />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">Kiểm tra trước khi xuất bản</h2>
        {!check && <p className="muted">Đang kiểm tra…</p>}
        {check && check.errors.length === 0 && check.warnings.length === 0 && (
          <p className="alert-success">Đề đã đủ điều kiện xuất bản.</p>
        )}
        {check && check.errors.length === 0 && check.warnings.length > 0 && (
          <p className="alert-success">Đề đủ điều kiện xuất bản (có vài lưu ý bên dưới).</p>
        )}
        {check && <CheckResult result={check} />}
        <button type="button" className="btn btn-secondary btn-small" onClick={recheck} disabled={busy}>
          Kiểm tra lại
        </button>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">Xuất bản</h2>
        <div className="card">
          {meta.published ? (
            <p>
              {isPublished ? 'Học viên đang làm ' : 'Bản xuất bản gần nhất: '}
              <strong>lần {meta.published.versionNo}</strong>, lúc {formatDateTime(meta.published.publishedAt)}
              {meta.published.publishedBy && <> bởi {meta.published.publishedBy}</>}.
              {meta.hasUnpublishedChanges && (
                <>
                  <br />
                  <span className="text-warn">Bản nháp có thay đổi chưa xuất bản.</span>
                </>
              )}
            </p>
          ) : (
            <p>Đề chưa xuất bản lần nào. Học viên chưa thấy đề này.</p>
          )}

          {!readOnly && (
            <div className="admin-form-actions">
              <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
                {meta.published ? 'Xuất bản lại' : 'Xuất bản'}
              </button>
              {isPublished && (
                <button type="button" className="btn btn-danger" onClick={unpublish} disabled={busy}>
                  Ngừng mở đề
                </button>
              )}
            </div>
          )}

          {meta.versions.length > 0 && (
            <div className="table-wrap versions-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lần</th>
                    <th>Thời gian</th>
                    <th>Người xuất bản</th>
                    <th>Số câu</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.versions.map((v) => (
                    <tr key={v.versionNo}>
                      <td>{v.versionNo}</td>
                      <td>{formatDateTime(v.publishedAt)}</td>
                      <td>{v.publishedBy || '—'}</td>
                      <td>{v.questionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {content.examType === 'CUSTOM' && (
        <TemplateCard examId={examId} meta={meta} content={content} save={save} refresh={refresh} />
      )}

      {!readOnly && (
        <section className="admin-section">
          <h2 className="admin-section-title">Xóa đề</h2>
          <div className="card danger-zone">
            <p>
              Xóa hẳn đề này, gồm mọi bản xuất bản, <strong>{meta.attemptCount ?? 0} lượt làm bài</strong> của học viên và các file
              ảnh / audio của đề. <strong>Không khôi phục được.</strong>
            </p>
            <p className="field-hint">Chỉ muốn học viên không thấy đề nữa thì dùng "Ngừng mở đề" ở trên (giữ lại kết quả).</p>
            <button type="button" className="btn btn-danger" onClick={removeExam} disabled={busy}>
              Xóa đề này
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Lưu đề tự thiết kế thành khung mẫu (không bắt buộc; mở lại đề lúc nào cũng lưu / cập nhật / bỏ được).
 * Khung chỉ giữ cấu trúc: các part, số question, số lựa chọn, nhóm đọc hiểu, thời gian, xáo trộn.
 */
function TemplateCard({ examId, meta, content, save, refresh }) {
  const current = meta.template;
  const [name, setName] = useState(current?.name || meta.exam.title || '');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function saveTemplate() {
    setMsg({ type: '', text: '' });
    if (!name.trim()) return setMsg({ type: 'error', text: 'Vui lòng đặt tên khung mẫu.' });
    setBusy(true);
    try {
      await save(); // lưu thay đổi đang chờ trước, để khung lấy đúng cấu trúc mới nhất
      const r = await apiPost(`/admin/exams/${examId}/template`, { name });
      await refresh({ resetDraft: false });
      setMsg({
        type: 'success',
        text: `${current ? 'Đã cập nhật' : 'Đã lưu'} khung mẫu "${r.template.name}". Khung hiện trong mục "Tạo đề mới" ở danh sách đề.`,
      });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate() {
    if (!window.confirm(`Bỏ khung mẫu "${current.name}"?\n\nCác đề đã tạo từ khung này không bị ảnh hưởng.`)) return;
    setBusy(true);
    try {
      await apiPost(`/admin/exams/${examId}/template/remove`);
      await refresh({ resetDraft: false });
      setMsg({ type: 'success', text: 'Đã bỏ khung mẫu.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Khung mẫu (không bắt buộc)</h2>
      <div className="card">
        {current ? (
          <p>
            Đề này đang được dùng làm khung mẫu <strong>"{current.name}"</strong> (cập nhật lúc {formatDateTime(current.updatedAt)}).
            Sửa cấu trúc đề xong, bấm "Cập nhật khung mẫu" để khung lấy cấu trúc mới.
          </p>
        ) : (
          <p>
            Lưu cấu trúc đề này (các part, số question, số lựa chọn, nhóm đọc hiểu, thời gian) thành <strong>khung mẫu</strong> để lần
            sau tạo đề mới cùng khung nhanh hơn — giống khung đề TOEIC. Khung không chép nội dung câu hỏi, đáp án hay file.
          </p>
        )}
        <div className="template-row">
          <div className="field">
            <label htmlFor="tpl-name">Tên khung mẫu</label>
            <input
              id="tpl-name"
              className="input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Kiểm tra 15 phút – 20 question"
            />
          </div>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-primary" onClick={saveTemplate} disabled={busy || content.questions.length === 0}>
              {current ? 'Cập nhật khung mẫu' : 'Lưu thành khung mẫu'}
            </button>
            {current && (
              <button type="button" className="btn btn-secondary" onClick={removeTemplate} disabled={busy}>
                Bỏ khung mẫu
              </button>
            )}
          </div>
        </div>
        {content.questions.length === 0 && <p className="field-hint">Thêm ít nhất một question rồi mới lưu được khung mẫu.</p>}
        {msg.text && <p className={`admin-message ${msg.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{msg.text}</p>}
      </div>
    </section>
  );
}

export function CheckResult({ result, errorTitle }) {
  if (!result.errors.length && !result.warnings.length) return null;
  return (
    <div className={`check-result ${result.errors.length ? 'has-errors' : ''}`} role="alert">
      {result.errors.length > 0 && (
        <>
          <p>
            <strong>{errorTitle || `Chưa xuất bản được. Cần sửa ${result.errors.length} lỗi:`}</strong>
          </p>
          <ul>
            {result.errors.slice(0, 60).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {result.errors.length > 60 && <p>… và {result.errors.length - 60} lỗi khác.</p>}
        </>
      )}
      {result.warnings.length > 0 && (
        <>
          <p><strong>Lưu ý (không chặn):</strong></p>
          <ul>
            {result.warnings.slice(0, 60).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

/** Tóm tắt đề tự thiết kế: số câu từng phần */
function CustomSummary({ content }) {
  const qs = content.questions;
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Số question</th>
              <th>Chưa có đáp án</th>
            </tr>
          </thead>
          <tbody>
            {content.parts.map((p, i) => {
              const mine = qs.filter((q) => q.part === i + 1);
              const noAnswer = mine.filter((q) => !q.answer).length;
              return (
                <tr key={i}>
                  <td>{p.name || `Part ${i + 1}`}</td>
                  <td>{mine.length}</td>
                  <td>{noAnswer > 0 ? <span className="text-error">{noAnswer}</span> : <span className="muted">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint content-hint">
        Tổng: {qs.length} question, {content.groups.length} nhóm đọc hiểu.{content.shuffleQuestions ? ' Đang bật xáo trộn question.' : ''}
      </p>
    </div>
  );
}

// Bảng tóm tắt nội dung theo từng Part
export function ContentSummary({ content }) {
  const questions = content?.questions || [];
  if (content?.examType === 'CUSTOM') return <CustomSummary content={content} />;
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Câu (chuẩn)</th>
              <th>Đã có</th>
              <th>Chưa có đáp án</th>
            </tr>
          </thead>
          <tbody>
            {STANDARD_PARTS.map((p) => {
              const qs = questions.filter((q) => q.part === p.part);
              const need = p.to - p.from + 1;
              const noAnswer = qs.filter((q) => !q.answer).length;
              return (
                <tr key={p.part}>
                  <td className="nowrap">Part {p.part} – {p.name}</td>
                  <td className="nowrap">{p.from}–{p.to}</td>
                  <td>
                    <span className={qs.length === need ? 'text-ok' : qs.length === 0 ? 'muted' : 'text-warn'}>
                      {qs.length} / {need}
                    </span>
                  </td>
                  <td>{noAnswer > 0 ? <span className="text-error">{noAnswer}</span> : <span className="muted">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint content-hint">
        Tổng: {questions.length} câu, {(content?.groups || []).length} nhóm câu / đoạn văn.
      </p>
    </div>
  );
}
