import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { ATTENDANCE_LABELS, feeBadge, formatDate, formatDay, vnToday } from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import ImportStudentsDialog from './ImportStudentsDialog.jsx';

/**
 * Tách danh sách học sinh dán vào (mỗi dòng một bạn), ví dụ copy từ Excel / Zalo:
 *   "1. Nguyễn Văn An 0901 234 567"  -> { fullName: 'Nguyễn Văn An', phone: '0901234567' }
 *   "Trần Bình<Tab>0912345678"       -> { fullName: 'Trần Bình', phone: '0912345678' }
 */
export function parseStudentLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Bỏ số thứ tự đầu dòng: "1." "2)" "3 -" "4<Tab>"
      let s = line.replace(/^\d{1,3}(\s*[.)\-–:]|\t)\s*/, '');
      let phone = '';
      const m = s.match(/\+?\d[\d .-]{7,}\d/);
      if (m) {
        phone = m[0].replace(/[\s.-]/g, '');
        s = s.replace(m[0], ' ');
      }
      const fullName = s.replace(/[\t,;|]+/g, ' ').replace(/\s[-–]\s*$/, '').replace(/\s+/g, ' ').trim();
      return { fullName, phone };
    })
    .filter((s) => s.fullName);
}

/**
 * Danh sách học sinh của lớp: thêm (một bạn hoặc dán nhiều bạn), sửa, cho nghỉ / học lại, xem lịch sử.
 * compact: bản gọn trong trang buổi học (không có cột thống kê).
 * defaultJoinedOn: ngày vào học điền sẵn (trang buổi học: ngày của buổi đó, để bạn mới có tên ngay trong điểm danh).
 */
export default function StudentsTab({ cls, students, onChanged, compact = false, defaultJoinedOn }) {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editing, setEditing] = useState(null); // id học sinh đang sửa
  const [detail, setDetail] = useState(null); // id học sinh đang xem lịch sử
  const [showRemoved, setShowRemoved] = useState(false);
  const [importing, setImporting] = useState(false);

  const active = students.filter((s) => s.isActive);
  const removed = students.filter((s) => !s.isActive);
  const say = (type, text) => setMessage({ type, text });

  async function removeStudent(s) {
    const ok = window.confirm(
      `Cho "${s.fullName}" nghỉ học lớp này?\n\n` +
        'Bạn này sẽ không còn trong danh sách điểm danh các buổi sau. Lịch sử điểm danh cũ vẫn được giữ.\n' +
        '(Nếu bạn này chưa học buổi nào, ví dụ thêm nhầm, thì sẽ bị xóa hẳn.)'
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

  const cols = compact ? 4 : 7;

  return (
    <div className="cl-students">
      <div className="cl-students-tools">
        <button type="button" className="btn btn-secondary cl-btn-icon" onClick={() => setImporting(true)}>
          <LineIcon name="upload" size={20} /> Nhập từ Excel
        </button>
        {!compact && (
          <a className="btn btn-secondary cl-btn-icon" href={`/api/admin/classes/${cls.id}/export`} download>
            <LineIcon name="download" size={20} /> Tải danh sách lớp (Excel)
          </a>
        )}
      </div>
      {importing && (
        <ImportStudentsDialog
          cls={cls}
          existing={active}
          defaultJoinedOn={defaultJoinedOn}
          onClose={() => setImporting(false)}
          onDone={(n, fileName) => {
            setImporting(false);
            say('success', `Đã nhập ${n} học sinh từ file "${fileName}".`);
            onChanged();
          }}
        />
      )}

      <AddStudents
        cls={cls}
        existing={active}
        defaultJoinedOn={defaultJoinedOn || vnToday()}
        onAdded={(n) => {
          say('success', `Đã thêm ${n} học sinh vào lớp.`);
          onChanged();
        }}
      />

      {message.text && (
        <p className={`admin-message ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{message.text}</p>
      )}

      <h3 className="cl-subtitle">Đang học ({active.length})</h3>
      <div className="table-wrap">
        <table className="table cl-table">
          <thead>
            <tr>
              <th>Họ và tên</th>
              <th>SĐT</th>
              <th>Vào học</th>
              {!compact && (
                <>
                  <th title="Tính cả buổi vắng, dùng để nhắc học phí">Đã học</th>
                  <th>Điểm cộng</th>
                  <th>Học phí</th>
                </>
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((s) => {
              const fee = feeBadge(s.fee);
              return (
                <Fragment key={s.id}>
                  <tr>
                    <td className="cl-col-name">
                      {compact ? (
                        <strong>{s.fullName}</strong>
                      ) : (
                        // Bấm tên: xem lịch sử hoạt động (đi học, bài đã làm, học phí)
                        <button type="button" className="cl-name-btn" onClick={() => setDetail(detail === s.id ? null : s.id)} title="Xem lịch sử hoạt động">
                          {s.fullName}
                        </button>
                      )}
                      {s.note && <div className="muted small-text cl-note" title={s.note}>{s.note}</div>}
                    </td>
                    <td className="nowrap">{s.phone || <span className="muted">—</span>}</td>
                    <td className="nowrap">{formatDate(s.joinedOn)}</td>
                    {!compact && (
                      <>
                        <td className="nowrap">
                          <strong>{s.stats.sessions} buổi</strong>
                          <div className="muted small-text">
                            vắng {s.stats.absent + s.stats.excused}
                            {s.priorSessions > 0 && ` · ${s.priorSessions} buổi trước khi lên web`}
                          </div>
                        </td>
                        <td><span className="cl-bonus-total"><LineIcon name="star" size={16} /> {s.stats.bonus}</span></td>
                        <td>{fee ? <span className={`cl-pill is-${fee.tone}`}>{fee.text}</span> : <span className="muted">—</span>}</td>
                      </>
                    )}
                    <td>
                      <div className="table-actions cl-row-actions">
                        {!compact && (
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setDetail(detail === s.id ? null : s.id)}>
                            {detail === s.id ? 'Đóng' : 'Chi tiết'}
                          </button>
                        )}
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                          Sửa
                        </button>
                        <button type="button" className="btn btn-danger btn-small" onClick={() => removeStudent(s)}>
                          Cho nghỉ
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === s.id && (
                    <tr className="row-panel">
                      <td colSpan={cols}>
                        <EditStudent
                          cls={cls}
                          student={s}
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
                  {detail === s.id && (
                    <tr className="row-panel">
                      <td colSpan={cols}>
                        <StudentHistory cls={cls} studentId={s.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {active.length === 0 && <p className="table-empty">Lớp chưa có học sinh. Thêm học sinh ở ô phía trên.</p>}
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
                    <span className="muted small-text">đã học {s.stats.sessions} buổi · nghỉ từ {formatDateTime(s.removedAt)}</span>
                  </span>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => restoreStudent(s)}>
                    Cho học lại
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Thêm học sinh: một bạn (có thêm tùy chọn) hoặc dán cả danh sách */
function AddStudents({ cls, existing, onAdded, defaultJoinedOn }) {
  const empty = { fullName: '', phone: '', joinedOn: defaultJoinedOn, priorSessions: '', note: '' };
  const [mode, setMode] = useState('one');
  const [one, setOne] = useState(empty);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [joinedOn, setJoinedOn] = useState(defaultJoinedOn);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = mode === 'many' ? parseStudentLines(text) : [];

  async function send(list) {
    // Trùng tên với bạn đang học: hỏi lại (có thể là 2 bạn trùng tên thật)
    const names = new Set(existing.map((s) => s.fullName.toLowerCase()));
    const dup = list.filter((s) => names.has(s.fullName.trim().toLowerCase())).map((s) => s.fullName);
    if (dup.length && !window.confirm(`Lớp đã có học sinh tên: ${dup.join(', ')}.\n\nVẫn thêm (ví dụ hai bạn trùng tên)?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiPost(`/admin/classes/${cls.id}/students`, { students: list });
      onAdded(list.length);
      setOne(empty);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (mode === 'one') {
      if (!one.fullName.trim()) return setError('Vui lòng nhập họ tên học sinh.');
      send([one]);
    } else {
      if (parsed.length === 0) return setError('Hãy dán danh sách học sinh, mỗi dòng một bạn.');
      if (parsed.length > 100) return setError('Mỗi lần thêm tối đa 100 học sinh.');
      send(parsed.map((s) => ({ ...s, joinedOn })));
    }
  }

  const setField = (name) => (e) => setOne((f) => ({ ...f, [name]: e.target.value }));

  return (
    <form className="card cl-add" onSubmit={submit} noValidate>
      <div className="cl-add-head">
        <h3><LineIcon name="plus" size={20} /> Thêm học sinh</h3>
        <div className="cl-seg" role="tablist" aria-label="Cách thêm">
          <button type="button" role="tab" aria-selected={mode === 'one'} className={mode === 'one' ? 'is-on' : ''} onClick={() => { setMode('one'); setError(''); }}>
            Từng bạn
          </button>
          <button type="button" role="tab" aria-selected={mode === 'many'} className={mode === 'many' ? 'is-on' : ''} onClick={() => { setMode('many'); setError(''); }}>
            Dán cả danh sách
          </button>
        </div>
      </div>

      {mode === 'one' ? (
        <>
          <div className="cl-add-row">
            <div className="field">
              <label htmlFor="st-name">Họ và tên</label>
              <input id="st-name" className="input" value={one.fullName} onChange={setField('fullName')} placeholder="Ví dụ: Nguyễn Văn An" maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="st-phone">SĐT phụ huynh / học sinh</label>
              <input id="st-phone" className="input" value={one.phone} onChange={setField('phone')} placeholder="Không bắt buộc" inputMode="tel" />
            </div>
            <div className="field">
              <label htmlFor="st-joined">Ngày vào học</label>
              <input id="st-joined" className="input" type="date" value={one.joinedOn} onChange={setField('joinedOn')} />
            </div>
          </div>
          {more ? (
            <div className="cl-add-row">
              <div className="field">
                <label htmlFor="st-prior">Số buổi đã học trước đó</label>
                <input id="st-prior" className="input" type="number" min="0" inputMode="numeric" value={one.priorSessions} onChange={setField('priorSessions')} placeholder="0" />
                <p className="field-hint">Chỉ dùng khi đưa lớp đang học dở lên web: số buổi bạn này đã học từ lần đóng học phí gần nhất.</p>
              </div>
              <div className="field cl-span-2">
                <label htmlFor="st-note">Ghi chú</label>
                <input id="st-note" className="input" value={one.note} onChange={setField('note')} placeholder="Ví dụ: Học bù, mẹ đón lúc 19h" maxLength={500} />
              </div>
            </div>
          ) : (
            <p className="cl-add-more">
              <button type="button" className="btn btn-link small-text" onClick={() => setMore(true)}>+ Thêm ghi chú / số buổi đã học trước đó</button>
            </p>
          )}
        </>
      ) : (
        <div className="cl-add-many">
          <div className="field">
            <label htmlFor="st-list">Dán danh sách (mỗi dòng một học sinh, có thể kèm SĐT)</label>
            <textarea
              id="st-list"
              className="input textarea"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Nguyễn Văn An 0901234567\nTrần Thị Bình\nLê Minh Châu 0912 345 678'}
            />
            <p className="field-hint">Copy từ Excel, Word hay tin nhắn Zalo đều được. Số thứ tự đầu dòng sẽ tự bỏ.</p>
          </div>
          <div className="cl-add-preview">
            <div className="field">
              <label htmlFor="st-joined-many">Ngày vào học (cả danh sách)</label>
              <input id="st-joined-many" className="input" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
            </div>
            <p className="cl-add-count">Sẽ thêm <strong>{parsed.length}</strong> học sinh</p>
            {parsed.length > 0 && (
              <ol className="cl-preview-list">
                {parsed.slice(0, 50).map((s, i) => (
                  <li key={i}>
                    {s.fullName} {s.phone && <span className="muted">· {s.phone}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Đang thêm…' : mode === 'one' ? 'Thêm học sinh' : `Thêm ${parsed.length || ''} học sinh`}
      </button>
    </form>
  );
}

function EditStudent({ cls, student, onCancel, onSaved }) {
  const [form, setForm] = useState({
    fullName: student.fullName,
    phone: student.phone,
    joinedOn: student.joinedOn,
    priorSessions: String(student.priorSessions),
    note: student.note,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPost(`/admin/classes/${cls.id}/students/${student.id}/update`, form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="cl-edit-student" onSubmit={submit} noValidate>
      <div className="cl-add-row">
        <div className="field">
          <label htmlFor={`es-name-${student.id}`}>Họ và tên</label>
          <input id={`es-name-${student.id}`} className="input" value={form.fullName} onChange={set('fullName')} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`es-phone-${student.id}`}>SĐT</label>
          <input id={`es-phone-${student.id}`} className="input" value={form.phone} onChange={set('phone')} inputMode="tel" />
        </div>
        <div className="field">
          <label htmlFor={`es-joined-${student.id}`}>Ngày vào học</label>
          <input id={`es-joined-${student.id}`} className="input" type="date" value={form.joinedOn} onChange={set('joinedOn')} />
        </div>
      </div>
      <div className="cl-add-row">
        <div className="field">
          <label htmlFor={`es-prior-${student.id}`}>Số buổi đã học trước khi lên web</label>
          <input id={`es-prior-${student.id}`} className="input" type="number" min="0" value={form.priorSessions} onChange={set('priorSessions')} />
        </div>
        <div className="field cl-span-2">
          <label htmlFor={`es-note-${student.id}`}>Ghi chú</label>
          <input id={`es-note-${student.id}`} className="input" value={form.note} onChange={set('note')} maxLength={500} />
        </div>
      </div>
      {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}

/** Lịch sử đi học (từng buổi) + các lần thu học phí của một học sinh */
export function StudentHistory({ cls, studentId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/admin/classes/${cls.id}/students/${studentId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [cls.id, studentId]);

  if (error) return <p className="alert-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const { student: s, history, payments, attempts = [] } = data;

  return (
    <div className="cl-history">
      <p className="cl-history-sum">
        Đã học <strong>{s.stats.sessions}</strong> buổi
        {s.priorSessions > 0 && ` (gồm ${s.priorSessions} buổi trước khi lên web)`}: có mặt {s.stats.present}, đi muộn {s.stats.late},
        vắng có phép {s.stats.excused}, vắng không phép {s.stats.absent}. Tổng điểm cộng: <strong>{s.stats.bonus}</strong>.
      </p>
      {history.length === 0 ? (
        <p className="muted">Chưa có buổi học nào được điểm danh.</p>
      ) : (
        <ul className="cl-history-list">
          {history.map((h) => (
            <li key={h.sessionId} className={`is-${h.status}`} title={`${formatDate(h.date)} ${h.startTime}–${h.endTime}`}>
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
      {payments.length > 0 && (
        <>
          <p className="cl-history-sum"><strong>Các lần thu học phí</strong></p>
          <ul className="cl-pay-list">
            {payments.map((p) => (
              <li key={p.cycleNo}>
                Đợt {p.cycleNo}: lúc đã học {p.sessionsAt} buổi · {p.by || 'không rõ'} · {formatDateTime(p.createdAt)}
                {p.note && <span className="muted"> — {p.note}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
