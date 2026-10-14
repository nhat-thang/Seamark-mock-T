// Các hộp thoại của trang Chăm sóc khách hàng: quản lý trạng thái, thêm khách hàng vào lớp, lịch sử một khách hàng,
// dán cả bảng từ Excel (ghép cột), hỏi trước khi dán đè, khách hàng đã xóa.
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import { formatDateTime } from '../../utils/format.js';
import { WEEKDAY_SHORT, formatDate, weekdayOf } from '../../utils/schedule.js';
import {
  COLUMNS,
  COLUMN_LABELS,
  FIXED_STATUSES,
  STATUS_COLORS,
  formatDateCell,
  formatMoneyCell,
  phoneParts,
  rowToContact,
} from '../../utils/crm.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import Modal from '../classes/Modal.jsx';

const COLOR_NAMES = { blue: 'Xanh dương', purple: 'Tím', teal: 'Xanh ngọc', pink: 'Hồng', orange: 'Cam', sky: 'Xanh trời', gray: 'Xám' };

function ColorPicker({ value, onChange, disabled }) {
  return (
    <span className="crm-colors" role="radiogroup" aria-label="Màu nhãn">
      {STATUS_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAMES[c]}
          title={COLOR_NAMES[c]}
          className={`crm-swatch is-${c}${value === c ? ' is-on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(c)}
        />
      ))}
    </span>
  );
}

/** Quản lý trạng thái: 3 trạng thái cố định + trạng thái tự thêm (đổi tên, đổi màu, xóa khi không còn ai dùng) */
export function StatusManager({ custom, counts, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(STATUS_COLORS[custom.length % STATUS_COLORS.length]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      onChanged(await fn());
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run(() => apiPost('/admin/crm/statuses', { name, color }))) {
      setName('');
      setColor(STATUS_COLORS[(custom.length + 1) % STATUS_COLORS.length]);
    }
  }

  return (
    <Modal className="crm-modal" title="Trạng thái khách hàng" onClose={onClose} wide footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>}>
      <p className="muted crm-dialog-intro">
        3 trạng thái <strong>cố định</strong> luôn có. Thêm trạng thái riêng của trung tâm (ví dụ "Đã cọc", "Hẹn test đầu vào") ở dưới —
        hoặc gõ thẳng tên mới vào ô <strong>Trạng thái</strong> trên bảng.
      </p>
      {error && <p className="alert-error admin-message">{error}</p>}
      <ul className="crm-status-list">
        {FIXED_STATUSES.map((s) => (
          <li key={s.name}>
            <span className={`crm-chip is-${s.color}`}><i aria-hidden="true" />{s.name}</span>
            <span className="crm-status-fixed"><LineIcon name="lock" size={14} /> Cố định</span>
            <span className="crm-status-count">{counts.get(s.name) || 0} khách</span>
          </li>
        ))}
        {custom.map((s) => <CustomStatusRow key={s.id} s={s} count={counts.get(s.name) || 0} busy={busy} run={run} />)}
      </ul>
      <form className="crm-status-add" onSubmit={add}>
        <label className="cl-sr" htmlFor="crm-new-status">Tên trạng thái mới</label>
        <input id="crm-new-status" className="input" placeholder="Trạng thái mới, ví dụ: Đã cọc" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          <LineIcon name="plus" size={18} /> Thêm
        </button>
      </form>
    </Modal>
  );
}

function CustomStatusRow({ s, count, busy, run }) {
  const [name, setName] = useState(s.name);
  useEffect(() => setName(s.name), [s.name]);
  function save() {
    const v = name.trim();
    if (v && v !== s.name) run(() => apiPost(`/admin/crm/statuses/${s.id}/update`, { name: v })).then((ok) => !ok && setName(s.name));
    else setName(s.name);
  }
  function remove() {
    if (window.confirm(`Xóa trạng thái "${s.name}" khỏi danh sách?`)) run(() => apiPost(`/admin/crm/statuses/${s.id}/delete`));
  }
  return (
    <li>
      <span className={`crm-chip is-${s.color} is-dot`}><i aria-hidden="true" /></span>
      <input
        className="input crm-status-name"
        value={name}
        maxLength={30}
        aria-label="Tên trạng thái (sửa rồi bấm ra ngoài để lưu)"
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <ColorPicker value={s.color} disabled={busy} onChange={(c) => c !== s.color && run(() => apiPost(`/admin/crm/statuses/${s.id}/update`, { color: c }))} />
      <span className="crm-status-count">{count} khách</span>
      <button
        type="button"
        className="cl-icon-btn"
        disabled={busy || count > 0}
        onClick={remove}
        title={count > 0 ? 'Đang có khách hàng ở trạng thái này. Đổi trạng thái của họ trước rồi mới xóa được.' : 'Xóa trạng thái'}
        aria-label={`Xóa trạng thái ${s.name}`}
      >
        <LineIcon name="trash" size={18} />
      </button>
    </li>
  );
}

/** "Buổi 5 · T3 14/10/2026 18:00" */
const sessionLabel = (s) => `Buổi ${s.no} · ${WEEKDAY_SHORT[weekdayOf(s.date)]} ${formatDate(s.date)} ${s.startTime}`;

/**
 * Thêm khách hàng đã chốt vào một lớp: điền sẵn tên học sinh, phụ huynh, SĐT, CCCD từ bảng CSKH.
 * Thêm học sinh qua API của lớp (cùng quy tắc với tab Học sinh: bắt buộc đủ thông tin phụ huynh),
 * rồi ghi lại vào CSKH (khách hàng chuyển "Đã chốt", hiện tên lớp).
 */
export function EnrollDialog({ contact, onClose, onDone }) {
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [sessions, setSessions] = useState(null);
  const [form, setForm] = useState(() => ({
    fullName: contact.studentName || '',
    parentName: contact.parentName || '',
    parentPhone: phoneParts(contact.phone)[0] || '',
    parentIdNumber: contact.idNumber || '',
    startSessionId: '',
    discountPercent: '',
  }));
  const [addedId, setAddedId] = useState(null); // đã thêm vào lớp nhưng chưa ghi lại vào CSKH (bấm lại chỉ ghi lại)
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    apiGet('/admin/classes')
      .then((d) => setClasses(d.classes))
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    if (!classId) return undefined;
    let alive = true;
    setSessions(null);
    apiGet(`/admin/classes/${classId}/sessions`)
      .then((d) => alive && setSessions(d.sessions.filter((s) => Date.parse(s.endsAt) > Date.now())))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [classId]);

  async function submit(e) {
    e.preventDefault();
    if (!classId) return setError('Vui lòng chọn lớp.');
    setBusy(true);
    setError('');
    try {
      let sid = addedId;
      if (!sid) {
        const add = await apiPost(`/admin/classes/${classId}/students`, {
          students: [{ ...form, startSessionId: form.startSessionId || undefined, discountPercent: form.discountPercent || 0 }],
        });
        sid = add.ids[0];
        setAddedId(sid);
      }
      const r = await apiPost(`/admin/crm/${contact.serverId}/enroll`, { classStudentId: sid });
      onDone(r, classes.find((c) => String(c.id) === classId)?.name || '');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      className="crm-modal"
      title="Thêm khách hàng vào lớp"
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" form="crm-enroll" className="btn btn-primary" disabled={busy || !classes}>
            <LineIcon name="cap" size={18} /> {busy ? 'Đang thêm…' : 'Thêm vào lớp'}
          </button>
        </>
      )}
    >
      <form id="crm-enroll" onSubmit={submit} className="crm-enroll">
        <p className="muted crm-dialog-intro">
          Thông tin lấy sẵn từ bảng CSKH, sửa lại nếu cần. Thêm vào lớp cần đủ <strong>tên học sinh, tên / SĐT / CCCD phụ huynh</strong>.
          Xong thì khách hàng tự chuyển sang <strong>Đã chốt</strong>.
        </p>
        {error && <p className="alert-error admin-message">{error}</p>}
        {addedId && <p className="alert-success admin-message">Đã thêm học sinh vào lớp. Bấm "Thêm vào lớp" lần nữa để ghi lại vào bảng CSKH.</p>}
        <div className="crm-enroll-grid">
          <div className="field">
            <label htmlFor="crm-class">Lớp</label>
            <select id="crm-class" className="input" value={classId} disabled={!classes || Boolean(addedId)} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{classes ? '— Chọn lớp —' : 'Đang tải…'}</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.studentCount} học sinh)</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="crm-start">Buổi bắt đầu học</label>
            <select id="crm-start" className="input" value={form.startSessionId} onChange={set('startSessionId')} disabled={!classId || !sessions || Boolean(addedId)}>
              <option value="">{classId && !sessions ? 'Đang tải…' : 'Buổi sắp tới gần nhất (tự chọn)'}</option>
              {(sessions || []).map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
            </select>
            <p className="field-hint">Học phí tính từ buổi này.</p>
          </div>
          <div className="field">
            <label htmlFor="crm-e-name">Họ tên học sinh</label>
            <input id="crm-e-name" className="input" value={form.fullName} onChange={set('fullName')} maxLength={80} disabled={Boolean(addedId)} />
          </div>
          <div className="field">
            <label htmlFor="crm-e-parent">Tên phụ huynh</label>
            <input id="crm-e-parent" className="input" value={form.parentName} onChange={set('parentName')} maxLength={80} disabled={Boolean(addedId)} />
          </div>
          <div className="field">
            <label htmlFor="crm-e-phone">SĐT phụ huynh</label>
            <input id="crm-e-phone" className="input" value={form.parentPhone} onChange={set('parentPhone')} inputMode="tel" placeholder="10 số" disabled={Boolean(addedId)} />
          </div>
          <div className="field">
            <label htmlFor="crm-e-id">CCCD phụ huynh</label>
            <input id="crm-e-id" className="input" value={form.parentIdNumber} onChange={set('parentIdNumber')} inputMode="numeric" placeholder="12 số" disabled={Boolean(addedId)} />
          </div>
          <div className="field">
            <label htmlFor="crm-e-discount">Giảm giá (%)</label>
            <input id="crm-e-discount" className="input" type="number" min="0" max="100" value={form.discountPercent} onChange={set('discountPercent')} placeholder="0" disabled={Boolean(addedId)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Giá trị cũ / mới trong lịch sử, hiện theo loại cột */
function showValue(field, v) {
  if (v === null || v === undefined || v === '') return <span className="muted">(trống)</span>;
  const col = COLUMNS.find((c) => c.key === field);
  if (col?.type === 'date') return formatDateCell(v);
  if (col?.type === 'money') return `${formatMoneyCell(Number(v))}đ`;
  return v;
}

const ROW_EVENTS = { create: 'Thêm vào bảng CSKH', delete: 'Xóa khỏi bảng', restore: 'Khôi phục vào bảng' };

/** Lịch sử thay đổi của một khách hàng: ai đổi ô nào, lúc nào, cũ -> mới */
export function HistoryDialog({ contact, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiGet(`/admin/crm/${contact.serverId}/history`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [contact.serverId]);
  const name = contact.studentName || contact.parentName || 'khách hàng';
  return (
    <Modal className="crm-modal" title={`Lịch sử: ${name}`} onClose={onClose} wide footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>}>
      {error && <p className="alert-error">{error}</p>}
      {!data && !error && <p className="muted">Đang tải…</p>}
      {data && (
        <>
          <p className="muted crm-dialog-intro">
            Thêm lúc {formatDateTime(data.contact.createdAt)}{data.contact.createdBy ? ` bởi ${data.contact.createdBy}` : ''}.
          </p>
          <ol className="crm-timeline">
            {data.changes.map((h) => (
              <li key={h.id} className={h.field === 'status' ? 'is-status' : ''}>
                <span className="crm-timeline-at">{formatDateTime(h.at)}<br /><span className="muted small-text">{h.by || '—'}</span></span>
                <span className="crm-timeline-what">
                  {ROW_EVENTS[h.field] || (h.field === 'enroll' ? (
                    <><LineIcon name="cap" size={15} /> Vào lớp <strong>{h.newValue}</strong></>
                  ) : (
                    <>
                      <strong>{COLUMN_LABELS[h.field] || h.field}:</strong> {showValue(h.field, h.oldValue)} <span aria-hidden="true">→</span>{' '}
                      <strong>{showValue(h.field, h.newValue)}</strong>
                    </>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}

/**
 * Dán cả bảng từ Excel (có dòng tên cột): web đã đoán mỗi cột là gì, người dùng sửa lại nếu sai rồi thêm thành khách hàng mới.
 * grid: các dòng đã dán (dòng 0 = tên cột), mapping: cột của bảng cho từng cột dán vào (null = bỏ qua)
 */
export function PasteDialog({ grid, mapping: guessed, today, onClose, onConfirm }) {
  const [mapping, setMapping] = useState(guessed);
  const [fillToday, setFillToday] = useState(true);
  const header = grid[0];
  const data = useMemo(() => grid.slice(1).filter((row) => row.some((c) => String(c).trim())), [grid]);
  const prepared = useMemo(() => data.map((cells) => rowToContact(cells, mapping, today)), [data, mapping, today]);
  const warnings = prepared.flatMap((p, i) => p.warnings.map((w) => `Dòng ${i + 1}: ${w}`));
  const usable = prepared.filter((p) => Object.keys(p.contact).length > 0);
  // Mỗi cột của bảng chỉ nhận một cột dán vào
  const setCol = (i, key) => setMapping((m) => m.map((k, j) => (j === i ? key || null : key && k === key ? null : k)));

  function confirm() {
    onConfirm(usable.map((p) => ({ ...(fillToday && !p.contact.contactDate ? { contactDate: today } : {}), ...p.contact })));
  }

  return (
    <Modal
      className="crm-modal"
      title={`Dán ${data.length} dòng từ Excel`}
      onClose={onClose}
      xl
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-primary" disabled={!usable.length} onClick={confirm}>
            <LineIcon name="plus" size={18} /> Thêm {usable.length} khách hàng
          </button>
        </>
      )}
    >
      <p className="muted crm-dialog-intro">
        Web nhận ra dòng đầu là <strong>tên cột</strong> và đã đoán mỗi cột là gì. Kiểm tra ô chọn bên phải, sửa lại nếu đoán sai.
        Cột chọn "Bỏ qua" sẽ không lấy.
      </p>
      <div className="table-wrap">
        <table className="table crm-map-table">
          <thead>
            <tr><th>Cột trong Excel</th><th>Ví dụ</th><th>Là cột nào trên bảng CSKH</th></tr>
          </thead>
          <tbody>
            {header.map((h, i) => (
              <tr key={i}>
                <td><strong>{h || <span className="muted">(không tên)</span>}</strong></td>
                <td className="muted small-text">{data.slice(0, 2).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</td>
                <td>
                  <select className="input" value={mapping[i] || ''} onChange={(e) => setCol(i, e.target.value)} aria-label={`Cột "${h}" là`}>
                    <option value="">— Bỏ qua cột này —</option>
                    {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mapping.includes('contactDate') || prepared.some((p) => !p.contact.contactDate) ? (
        <label className="checkbox-label crm-fill-today">
          <input type="checkbox" checked={fillToday} onChange={(e) => setFillToday(e.target.checked)} />
          Dòng chưa có Ngày CSKH: ghi ngày hôm nay ({formatDateCell(today)})
        </label>
      ) : null}
      {warnings.length > 0 && (
        <details className="crm-warn-list">
          <summary>{warnings.length} ô ngày / học phí không đọc được — đã ghi vào Ghi chú để không mất</summary>
          <ul>{warnings.slice(0, 50).map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
    </Modal>
  );
}

/** Dán nhiều dòng đè lên các ô đang có chữ: hỏi trước (ghi đè, hoặc thêm thành khách hàng mới) */
export function OverwriteDialog({ info, onClose, onOverwrite, onAppend }) {
  return (
    <Modal
      className="crm-modal"
      title="Dán đè lên dữ liệu đang có?"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-danger" onClick={onOverwrite}>Ghi đè</button>
          <button type="button" className="btn btn-primary" onClick={onAppend}>
            <LineIcon name="plus" size={18} /> Thêm thành {info.rows} khách hàng mới
          </button>
        </>
      )}
    >
      <p>
        Bạn đang dán <strong>{info.rows} dòng × {info.cols} cột</strong> vào dòng {info.from}–{info.to}.
        Việc này sẽ <strong>ghi đè {info.overwrites} ô đang có chữ</strong>.
      </p>
      <p className="muted">Muốn đưa danh sách này vào thành khách hàng mới thì chọn "Thêm thành khách hàng mới". Lỡ tay vẫn bấm "Hoàn tác" được.</p>
    </Modal>
  );
}

/** Khách hàng đã xóa: chọn để khôi phục */
export function DeletedDialog({ statusColorOf, onClose, onRestored }) {
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiGet('/admin/crm/deleted')
      .then((d) => setList(d.contacts))
      .catch((err) => setError(err.message));
  }, []);
  const toggle = (id) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function restore(ids) {
    setBusy(true);
    setError('');
    try {
      const r = await apiPost('/admin/crm/restore', { ids });
      onRestored(r);
      setList((l) => l.filter((c) => !ids.includes(c.id)));
      setPicked(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      className="crm-modal"
      title="Khách hàng đã xóa"
      onClose={onClose}
      xl
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-primary" disabled={busy || !picked.size} onClick={() => restore([...picked])}>
            <LineIcon name="undo" size={18} /> Khôi phục {picked.size || ''} khách hàng
          </button>
        </>
      )}
    >
      <p className="muted crm-dialog-intro">Khách hàng bị xóa vẫn được giữ lại ở đây (500 người xóa gần nhất). Chọn rồi bấm "Khôi phục" để đưa về bảng.</p>
      {error && <p className="alert-error admin-message">{error}</p>}
      {!list && !error && <p className="muted">Đang tải…</p>}
      {list && list.length === 0 && <p className="table-empty">Chưa xóa khách hàng nào.</p>}
      {list && list.length > 0 && (
        <div className="table-wrap crm-deleted-wrap">
          <table className="table">
            <thead>
              <tr><th aria-label="Chọn" /><th>Học sinh</th><th>Phụ huynh</th><th>SĐT</th><th>Trạng thái</th><th>Xóa lúc</th><th /></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Chọn ${c.studentName || c.parentName}`} /></td>
                  <td>{c.studentName || <span className="muted">—</span>}</td>
                  <td>{c.parentName || <span className="muted">—</span>}</td>
                  <td className="nowrap">{c.phone || <span className="muted">—</span>}</td>
                  <td>{c.status ? <span className={`crm-chip is-${statusColorOf(c.status)}`}><i aria-hidden="true" />{c.status}</span> : <span className="muted">—</span>}</td>
                  <td className="nowrap small-text">{formatDateTime(c.deletedAt)}</td>
                  <td><button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => restore([c.id])}>Khôi phục</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
