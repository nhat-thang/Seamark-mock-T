import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { ATTENDANCE_LABELS, WEEKDAY_SHORT, formatDate, formatDay, weekdayOf } from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import ImportStudentsDialog from './ImportStudentsDialog.jsx';
import { AlertBadge, ExcelLink, FeeStatus } from './TuitionBits.jsx';

/** "Buổi 5 · T3 14/10/2026 18:00" */
const sessionLabel = (s) => `Buổi ${s.no} · ${WEEKDAY_SHORT[weekdayOf(s.date)]} ${formatDate(s.date)} ${s.startTime}`;

/** Các buổi của lớp (để chọn buổi bắt đầu học). Chỉ admin chính dùng. */
function useClassSessions(classId, enabled) {
  const [sessions, setSessions] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    apiGet(`/admin/classes/${classId}/sessions`)
      .then((d) => setSessions(d.sessions))
      .catch(() => setSessions([]));
  }, [classId, enabled]);
  return sessions;
}

/** Ô chọn buổi bắt đầu học. value = id buổi ('' = để web tự chọn buổi sắp tới gần nhất) */
function StartSessionSelect({ id, sessions, value, onChange, emptyLabel }) {
  if (!sessions) return <select id={id} className="input" disabled><option>Đang tải…</option></select>;
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
    </select>
  );
}

/**
 * Danh sách học sinh của lớp.
 * - Admin chính: thêm (bắt buộc đủ tên học sinh, tên / SĐT / CCCD phụ huynh), nhập Excel, sửa, cho nghỉ, đủ thông tin.
 * - Giáo viên: chỉ xem họ tên, số buổi đã học, điểm danh, nhãn học phí (server đã lọc bỏ thông tin riêng).
 * compact: bản gọn trong trang buổi học (chỉ admin chính mở).
 */
export default function StudentsTab({ cls, students, onChanged, isOwner, compact = false, startSessionId = '' }) {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editing, setEditing] = useState(null); // id học sinh đang sửa
  const [detail, setDetail] = useState(null); // { id, focus: 'absent' | 'all' }
  const [showRemoved, setShowRemoved] = useState(false);
  const [importing, setImporting] = useState(false);
  const sessions = useClassSessions(cls.id, isOwner);

  const active = students.filter((s) => s.isActive);
  const removed = students.filter((s) => !s.isActive);
  const say = (type, text) => setMessage({ type, text });
  const missing = active.filter((s) => s.missingInfo).length;
  const toggleDetail = (id, focus) => setDetail((d) => (d && d.id === id && d.focus === focus ? null : { id, focus }));

  async function removeStudent(s) {
    const ok = window.confirm(
      `Cho "${s.fullName}" nghỉ học lớp này?\n\n` +
        'Bạn này sẽ không còn trong danh sách điểm danh các buổi sau. Lịch sử điểm danh, học phí vẫn được giữ.\n' +
        '(Nếu bạn này chưa có lịch sử nào, ví dụ thêm nhầm, thì sẽ bị xóa hẳn.)'
    );
    if (!ok) return;
    try {
      const r = await apiPost(`/admin/classes/${cls.id}/students/${s.id}/remove`);
      say('success', r.deleted ? `Đã xóa "${s.fullName}" khỏi lớp.` : `"${s.fullName}" đã nghỉ học. Xem lại ở mục "Học sinh đã nghỉ".`);
      onChanged();
    } catch (err) {
      say('error', err.message);
    }
  }

  async function restoreStudent(s) {
    try {
      await apiPost(`/admin/classes/${cls.id}/students/${s.id}/restore`);
      say('success', `"${s.fullName}" đã quay lại học.`);
      onChanged();
    } catch (err) {
      say('error', err.message);
    }
  }

  const cols = compact ? 3 : isOwner ? 7 : 5;

  return (
    <div className="cl-students">
      <div className="cl-students-tools">
        {isOwner && (
          <button type="button" className="btn btn-secondary cl-btn-icon" onClick={() => setImporting(true)}>
            <LineIcon name="upload" size={20} /> Nhập từ Excel
          </button>
        )}
        {!compact && (
          <ExcelLink href={`/admin/classes/${cls.id}/export`}>{isOwner ? 'Tải danh sách lớp (Excel)' : 'Tải danh sách + điểm danh (Excel)'}</ExcelLink>
        )}
      </div>
      {importing && (
        <ImportStudentsDialog
          cls={cls}
          existing={active}
          onClose={() => setImporting(false)}
          onDone={(n, fileName) => {
            setImporting(false);
            say('success', `Đã nhập ${n} học sinh từ file "${fileName}".${' '}Học sinh còn thiếu thông tin phụ huynh có nhãn "Thiếu thông tin" — bấm "Sửa" để bổ sung.`);
            onChanged();
          }}
        />
      )}

      {isOwner && (
        <AddStudent
          cls={cls}
          existing={active}
          sessions={sessions}
          defaultStart={startSessionId}
          onAdded={(name) => {
            say('success', `Đã thêm "${name}" vào lớp.`);
            onChanged();
          }}
        />
      )}

      {message.text && (
        <p className={`admin-message ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{message.text}</p>
      )}

      <h3 className="cl-subtitle">
        Đang học ({active.length})
        {isOwner && missing > 0 && <span className="cl-pill is-soon cl-subtitle-pill">{missing} học sinh thiếu thông tin</span>}
      </h3>
      <div className="table-wrap">
        <table className="table cl-table">
          <thead>
            <tr>
              <th>Họ và tên</th>
              {isOwner && <th>Phụ huynh</th>}
              {!compact && (
                <>
                  {isOwner && <th>Bắt đầu học</th>}
                  <th title="Buổi trên thời khóa biểu đã qua, tính từ buổi bắt đầu học (vắng vẫn tính)">Đã học</th>
                  <th>Điểm cộng</th>
                  <th>Học phí</th>
                </>
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((s) => {
              const t = s.tuition || {};
              const absent = s.stats.absent + s.stats.excused;
              return (
                <Fragment key={s.id}>
                  <tr>
                    <td className="cl-col-name">
                      {compact ? (
                        <strong>{s.fullName}</strong>
                      ) : (
                        // Bấm tên: xem lịch sử đi học + bài đã làm
                        <button type="button" className="cl-name-btn" onClick={() => toggleDetail(s.id, 'all')} title="Xem lịch sử đi học">
                          {s.fullName}
                        </button>
                      )}
                      {isOwner && s.missingInfo && <span className="cl-pill is-soon cl-missing">Thiếu thông tin</span>}
                      {isOwner && s.discountPercent > 0 && <span className="cl-pill">Giảm {s.discountPercent}%</span>}
                      {isOwner && s.note && <div className="muted small-text cl-note" title={s.note}>{s.note}</div>}
                    </td>
                    {isOwner && (
                      <td className="cl-parent">
                        {s.parentName || <span className="muted">—</span>}
                        <div className="muted small-text nowrap">{s.parentPhone ? `SĐT ${s.parentPhone}` : 'chưa có SĐT'}</div>
                        <div className="muted small-text nowrap">{s.parentIdNumber ? `CCCD ${s.parentIdNumber}` : 'chưa có CCCD'}</div>
                      </td>
                    )}
                    {!compact && (
                      <>
                        {isOwner && (
                          <td className="nowrap">{t.startNo ? <>Buổi {t.startNo}<div className="muted small-text">{formatDate(t.startDate)}</div></> : <span className="muted">—</span>}</td>
                        )}
                        <td className="nowrap">
                          <strong>{t.sessionsDone ?? 0} buổi</strong>
                          <div className="small-text">
                            {absent > 0 ? (
                              <button type="button" className="cl-absent-btn" onClick={() => toggleDetail(s.id, 'absent')} title="Xem vắng những buổi nào">
                                vắng {absent}
                              </button>
                            ) : (
                              <span className="muted">không vắng</span>
                            )}
                          </div>
                        </td>
                        <td><span className="cl-bonus-total"><LineIcon name="star" size={16} /> {s.stats.bonus}</span></td>
                        <td>
                          <FeeStatus labels={t.labels} />
                          {t.alert && <div><AlertBadge alert={t.alert} short /></div>}
                        </td>
                      </>
                    )}
                    <td>
                      <div className="table-actions cl-row-actions">
                        {!compact && (
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleDetail(s.id, 'all')}>
                            {detail?.id === s.id ? 'Đóng' : 'Chi tiết'}
                          </button>
                        )}
                        {isOwner && (
                          <>
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                              Sửa
                            </button>
                            <button type="button" className="btn btn-danger btn-small" onClick={() => removeStudent(s)}>
                              Cho nghỉ
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editing === s.id && (
                    <tr className="row-panel">
                      <td colSpan={cols}>
                        <EditStudent
                          cls={cls}
                          student={s}
                          sessions={sessions}
                          onCancel={() => setEditing(null)}
                          onSaved={() => {
                            setEditing(null);
                            say('success', `Đã lưu thông tin của "${s.fullName}".`);
                            onChanged();
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  {detail?.id === s.id && (
                    <tr className="row-panel">
                      <td colSpan={cols}>
                        <StudentHistory cls={cls} studentId={s.id} absentOnly={detail.focus === 'absent'} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {active.length === 0 && (
          <p className="table-empty">{isOwner ? 'Lớp chưa có học sinh. Thêm học sinh ở ô phía trên.' : 'Lớp chưa có học sinh.'}</p>
        )}
      </div>

      {removed.length > 0 && (
        <div className="cl-removed">
          <button type="button" className="btn btn-link" onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? 'Ẩn' : 'Xem'} học sinh đã nghỉ ({removed.length})
          </button>
          {showRemoved && (
            <ul className="cl-removed-list">
              {removed.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.fullName}</strong>{' '}
                    <span className="muted small-text">
                      đã học {s.tuition?.sessionsDone ?? 0} buổi{isOwner && s.removedAt && ` · nghỉ từ ${formatDateTime(s.removedAt)}`}
                    </span>
                  </span>
                  {isOwner && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => restoreStudent(s)}>
                      Cho học lại
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const PHONE_RE = /^0\d{9}$/;
const ID_RE = /^(\d{9}|\d{12})$/;
const digits = (v) => String(v || '').replace(/[\s.-]/g, '');

/** Lỗi của ô CCCD ('' = hợp lệ hoặc đang trống). Dữ liệu cũ có thể còn chữ / dấu nên vẫn kiểm tra ký tự. */
function idNumberProblem(v) {
  const d = digits(v);
  if (!d) return '';
  if (!/^\d+$/.test(d)) return 'Số CCCD chỉ gồm chữ số (0–9).';
  if (!ID_RE.test(d)) return `Số CCCD gồm 12 số (CMND cũ 9 số) — đang có ${d.length} số.`;
  return '';
}

/** Kiểm tra trước ở trình duyệt (server kiểm tra lại). requireAll: thêm tay thì bắt buộc đủ 4 trường. */
function checkStudent(f, requireAll) {
  if (!f.fullName.trim()) return 'Vui lòng nhập họ tên học sinh.';
  if (requireAll) {
    const miss = [!f.parentName.trim() && 'tên phụ huynh', !f.parentPhone.trim() && 'SĐT phụ huynh', !f.parentIdNumber.trim() && 'CCCD phụ huynh'].filter(Boolean);
    if (miss.length) return `Vui lòng nhập ${miss.join(', ')}.`;
  }
  if (f.parentPhone.trim() && !PHONE_RE.test(digits(f.parentPhone)) && !/^02\d{9}$/.test(digits(f.parentPhone))) {
    return 'SĐT phụ huynh gồm 10 số, ví dụ 0901234567.';
  }
  const idProblem = idNumberProblem(f.parentIdNumber);
  if (idProblem) return idProblem;
  const d = f.discountPercent === '' ? 0 : Number(f.discountPercent);
  if (!Number.isInteger(d) || d < 0 || d > 100) return 'Giảm giá phải từ 0 đến 100 (%).';
  return '';
}

/** Các ô nhập thông tin học sinh (dùng chung cho thêm và sửa) */
function StudentFields({ prefix, form, set, sessions, required, startLabel }) {
  const req = required ? <span className="cl-required"> (bắt buộc)</span> : null;
  // Báo lỗi CCCD khi rời ô (đang gõ dở thì chưa báo, tránh đỏ liên tục)
  const [idTouched, setIdTouched] = useState(false);
  const idError = idTouched ? idNumberProblem(form.parentIdNumber) : '';
  return (
    <>
      <div className="cl-add-row cl-add-grid">
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Họ tên học sinh<span className="cl-required"> (bắt buộc)</span></label>
          <input id={`${prefix}-name`} className="input" value={form.fullName} onChange={set('fullName')} placeholder="Ví dụ: Nguyễn Văn An" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-parent`}>Tên phụ huynh{req}</label>
          <input id={`${prefix}-parent`} className="input" value={form.parentName} onChange={set('parentName')} placeholder="Ví dụ: Nguyễn Thị Mai" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-phone`}>SĐT phụ huynh{req}</label>
          <input id={`${prefix}-phone`} className="input" value={form.parentPhone} onChange={set('parentPhone')} placeholder="10 số, ví dụ 0901234567" inputMode="tel" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-id`}>CCCD phụ huynh{req}</label>
          {/* Chỉ nhận chữ số, tối đa 12: gõ / dán chữ, dấu cách, dấu chấm thì tự bỏ */}
          <input
            id={`${prefix}-id`}
            className="input"
            value={form.parentIdNumber}
            onChange={(e) => set('parentIdNumber')({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 12) } })}
            placeholder="12 số"
            inputMode="numeric"
            maxLength={12}
            onBlur={() => setIdTouched(true)}
            aria-required={required}
            aria-invalid={Boolean(idError)}
            aria-describedby={idError ? `${prefix}-id-error` : undefined}
          />
          {idError && <p id={`${prefix}-id-error`} className="field-error">{idError}</p>}
        </div>
      </div>
      <div className="cl-add-row cl-add-grid">
        <div className="field">
          <label htmlFor={`${prefix}-start`}>Buổi bắt đầu học</label>
          <StartSessionSelect id={`${prefix}-start`} sessions={sessions} value={form.startSessionId} onChange={(v) => set('startSessionId')({ target: { value: v } })} emptyLabel={startLabel} />
          <p className="field-hint">Học phí tính từ buổi này. Vào giữa kì thì kì đầu chỉ tính từ buổi bắt đầu.</p>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-discount`}>Giảm giá (%)</label>
          <input id={`${prefix}-discount`} className="input" type="number" min="0" max="100" inputMode="numeric" value={form.discountPercent} onChange={set('discountPercent')} placeholder="0" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-dnote`}>Lý do giảm giá</label>
          <input id={`${prefix}-dnote`} className="input" value={form.discountNote} onChange={set('discountNote')} placeholder="Ví dụ: Anh em học cùng" maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-note`}>Ghi chú</label>
          <input id={`${prefix}-note`} className="input" value={form.note} onChange={set('note')} placeholder="Ví dụ: mẹ đón lúc 19h" maxLength={500} />
        </div>
      </div>
    </>
  );
}

/** Thêm một học sinh bằng tay (admin chính) — bắt buộc đủ thông tin phụ huynh. Nhiều bạn thì dùng "Nhập từ Excel". */
function AddStudent({ cls, existing, sessions, defaultStart, onAdded }) {
  const empty = { fullName: '', parentName: '', parentPhone: '', parentIdNumber: '', startSessionId: defaultStart ? String(defaultStart) : '', discountPercent: '', discountNote: '', note: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  // Mặc định: buổi sắp tới gần nhất (giáo viên đổi được)
  const nextId = sessions?.find((s) => Date.parse(s.endsAt) > Date.now())?.id;
  const startLabel = nextId ? 'Buổi sắp tới gần nhất (mặc định)' : 'Từ bây giờ (lớp chưa có buổi sắp tới)';

  async function submit(e) {
    e.preventDefault();
    const problem = checkStudent(form, true);
    if (problem) return setError(problem);
    if (existing.some((s) => s.fullName.trim().toLowerCase() === form.fullName.trim().toLowerCase())
      && !window.confirm(`Lớp đã có học sinh tên "${form.fullName.trim()}".\n\nVẫn thêm (ví dụ hai bạn trùng tên)?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiPost(`/admin/classes/${cls.id}/students`, {
        students: [{ ...form, startSessionId: form.startSessionId || undefined, discountPercent: form.discountPercent || 0 }],
      });
      onAdded(form.fullName.trim());
      setForm(empty);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card cl-add" onSubmit={submit} noValidate>
      <div className="cl-add-head">
        <h3><LineIcon name="plus" size={20} /> Thêm học sinh</h3>
        <span className="muted small-text">Nhiều bạn cùng lúc: bấm "Nhập từ Excel".</span>
      </div>
      <StudentFields prefix="st" form={form} set={set} sessions={sessions} required startLabel={startLabel} />
      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang thêm…' : 'Thêm học sinh'}</button>
    </form>
  );
}

/** Sửa học sinh (admin chính) — không bắt buộc đủ thông tin (đã chốt) */
function EditStudent({ cls, student, sessions, onCancel, onSaved }) {
  const [form, setForm] = useState({
    fullName: student.fullName,
    parentName: student.parentName || '',
    parentPhone: student.parentPhone || '',
    parentIdNumber: student.parentIdNumber || '',
    startSessionId: '',
    discountPercent: String(student.discountPercent || ''),
    discountNote: student.discountNote || '',
    note: student.note || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const startNo = student.tuition?.startNo;

  async function submit(e) {
    e.preventDefault();
    const problem = checkStudent(form, false);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await apiPost(`/admin/classes/${cls.id}/students/${student.id}/update`, {
        ...form,
        startSessionId: form.startSessionId || undefined, // để trống = giữ buổi bắt đầu cũ
        discountPercent: form.discountPercent || 0,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="cl-edit-student" onSubmit={submit} noValidate>
      <StudentFields
        prefix={`es-${student.id}`}
        form={form}
        set={set}
        sessions={sessions}
        startLabel={startNo ? `Giữ nguyên (buổi ${startNo}, ${formatDate(student.tuition.startDate)})` : 'Giữ nguyên'}
      />
      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}

/**
 * Lịch sử đi học (từng buổi) + bài đã làm của một học sinh.
 * absentOnly: chỉ hiện các buổi vắng (bấm "vắng N" trong danh sách).
 */
export function StudentHistory({ cls, studentId, absentOnly = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/admin/classes/${cls.id}/students/${studentId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [cls.id, studentId]);

  if (error) return <p className="alert-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const { student: s, history, attempts = [] } = data;
  const absences = history.filter((h) => h.status === 'absent' || h.status === 'excused');

  if (absentOnly) {
    return (
      <div className="cl-history">
        <p className="cl-history-sum"><strong>{s.fullName}</strong> vắng {absences.length} buổi:</p>
        <ul className="cl-absence-list">
          {absences.map((h) => (
            <li key={h.sessionId} className={`is-${h.status}`}>
              {h.no ? `Buổi ${h.no} · ` : ''}{WEEKDAY_SHORT[weekdayOf(h.date)]} {formatDate(h.date)} {h.startTime}–{h.endTime} · <strong>{ATTENDANCE_LABELS[h.status]}</strong>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="cl-history">
      <p className="cl-history-sum">
        Đã học <strong>{s.tuition?.sessionsDone ?? 0}</strong> buổi (tính theo thời khóa biểu từ buổi bắt đầu học). Điểm danh: có mặt {s.stats.present}, đi muộn{' '}
        {s.stats.late}, vắng có phép {s.stats.excused}, vắng không phép {s.stats.absent}. Tổng điểm cộng: <strong>{s.stats.bonus}</strong>.
      </p>
      {history.length === 0 ? (
        <p className="muted">Chưa có buổi học nào được điểm danh.</p>
      ) : (
        <ul className="cl-history-list">
          {history.map((h) => (
            <li key={h.sessionId} className={`is-${h.status}`} title={`${h.no ? `Buổi ${h.no} · ` : ''}${formatDate(h.date)} ${h.startTime}–${h.endTime}`}>
              <span className="cl-history-day">{formatDay(h.date)}</span>
              <span>{ATTENDANCE_LABELS[h.status]}</span>
              {h.bonus > 0 && <span className="cl-history-bonus">+{h.bonus}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="cl-history-sum"><strong>Bài đã làm (Class Assignment)</strong> — {attempts.length} lượt</p>
      {attempts.length === 0 ? (
        <p className="muted">Chưa làm bài nào.</p>
      ) : (
        <ul className="cl-attempt-list">
          {attempts.map((a) => (
            <li key={a.id}>
              <Link to={`/admin/ket-qua/${a.id}`} className="cl-attempt">
                <span className="cl-attempt-title">{a.examTitle}</span>
                <span className="muted small-text">
                  {formatDateTime(a.submittedAt || a.startedAt)}
                  {a.status === 'submitted' ? '' : ' · đang làm'}
                </span>
                {a.status === 'submitted' && a.correct !== null && (
                  <span className="cl-pill is-ok">
                    {a.correct}/{a.total} câu{a.score10 !== null ? ` · ${String(a.score10).replace('.', ',')} điểm` : ''}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
