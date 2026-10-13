// Các phần giao diện học phí dùng chung: nhãn cảnh báo, nhãn Đã thu / Chưa đóng, hộp thu tiền,
// hộp bỏ "Đã thu" (nhập lại mật khẩu), bảng các kì học phí + lịch sử thu của một học sinh.
// Số tiền chỉ admin chính thấy — server đã lọc, giáo viên không nhận được số tiền nào.
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import {
  ALERT_LEVELS,
  FEE_STATUS_LABELS,
  METHOD_LABELS,
  alertText,
  formatDate,
  formatMoney,
  vnToday,
} from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import Modal from './Modal.jsx';

/** Nút tải Excel (đường dẫn API trả file) */
export function ExcelLink({ href, children = 'Tải Excel', small = false }) {
  return (
    <a className={`btn btn-secondary cl-btn-icon ${small ? 'btn-small' : ''}`} href={`/api${href}`} download>
      <LineIcon name="download" size={small ? 16 : 20} /> {children}
    </a>
  );
}

/** Nhãn cảnh báo học phí: chấm màu + chữ ("Đỏ · Đã tới hạn, chưa đóng kì 2") */
export function AlertBadge({ alert, withAmount = false, short = false }) {
  if (!alert) return null;
  const level = ALERT_LEVELS[alert.level];
  return (
    <span className={`tu-alert is-${alert.level}`} title={`Cảnh báo ${level.label.toLowerCase()}: ${alertText(alert)} kì ${alert.cycleNo}`}>
      <span className="tu-dot" aria-hidden="true" />
      {short ? alertText(alert) : `${level.label} · ${alertText(alert)} kì ${alert.cycleNo}`}
      {withAmount && alert.amount != null && <strong> · {formatMoney(alert.amount)}</strong>}
    </span>
  );
}

/** Nhãn "Kì 2: Đã thu" / "Kì 2: Chưa đóng" của kì hiện tại (+ kì sau nếu đã đóng trước) */
export function FeeStatus({ labels }) {
  if (!labels || !labels.current) return <span className="muted small-text">—</span>;
  return (
    <span className="tu-status-wrap">
      <span className={`tu-status is-${labels.current}`}>Kì {labels.currentCycle}: {FEE_STATUS_LABELS[labels.current]}</span>
      {labels.next === 'paid' && <span className="tu-status is-paid">Kì {labels.currentCycle + 1}: Đã thu</span>}
    </span>
  );
}

/** "Buổi 3–10 (8 buổi)" */
export const cycleRange = (cy) => {
  const first = cy.sessions?.[0]?.no ?? cy.firstNo;
  const last = cy.sessions?.at(-1)?.no ?? cy.lastNo;
  return `buổi ${first}–${last} (${cy.sessionCount} buổi)`;
};

/**
 * Chưa đóng -> Đã thu: xác nhận số tiền (mặc định = số phải thu), ngày thu, tiền mặt / chuyển khoản, ghi chú.
 */
export function PayDialog({ student, cycle, onClose, onDone }) {
  const [form, setForm] = useState({ amount: String(cycle.amount), paidOn: vnToday(), method: '', note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const amount = Number(String(form.amount).replace(/[.,\s]/g, ''));

  async function submit(e) {
    e.preventDefault();
    if (!form.method) return setError('Vui lòng chọn hình thức thu: tiền mặt hay chuyển khoản.');
    if (!Number.isInteger(amount) || amount < 0) return setError('Số tiền không hợp lệ.');
    setSaving(true);
    setError('');
    try {
      const r = await apiPost(`/admin/tuition/students/${student.id}/pay`, { cycleNo: cycle.cycleNo, ...form, amount });
      onDone(r, `Đã ghi thu kì ${cycle.cycleNo} của ${student.fullName}: ${formatMoney(amount)}.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Thu học phí kì ${cycle.cycleNo}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" form="tu-pay-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Xác nhận đã thu'}
          </button>
        </>
      }
    >
      <form id="tu-pay-form" className="tu-form" onSubmit={submit} noValidate>
        <p className="tu-form-who">
          <strong>{student.fullName}</strong> · {cycleRange(cycle)} · hạn đóng {formatDate(cycle.dueDate)}
        </p>
        <p className="muted small-text">
          Số phải thu: <strong>{formatMoney(cycle.amount)}</strong>
          {student.discountPercent > 0 && ` (đã giảm ${student.discountPercent}%)`}. Số tiền được chốt lúc bấm xác nhận — sau này đổi giá
          hay đổi lịch cũng không làm thay đổi.
        </p>
        <div className="cl-add-row">
          <div className="field">
            <label htmlFor="tu-amount">Số tiền đã thu (đồng)</label>
            <input id="tu-amount" className="input" inputMode="numeric" value={form.amount} onChange={set('amount')} />
            {Number.isInteger(amount) && amount !== cycle.amount && (
              <p className="field-hint text-warn">Khác số phải thu {formatMoney(cycle.amount)} — trang Quản lý học phí sẽ hiện phần còn thiếu.</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="tu-date">Ngày thu</label>
            <input id="tu-date" className="input" type="date" max={vnToday()} value={form.paidOn} onChange={set('paidOn')} />
          </div>
        </div>
        <fieldset className="tu-methods">
          <legend>Hình thức</legend>
          {Object.entries(METHOD_LABELS).map(([k, label]) => (
            <label key={k} className={`tu-method ${form.method === k ? 'is-on' : ''}`}>
              <input type="radio" name="tu-method" value={k} checked={form.method === k} onChange={set('method')} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="tu-note">Ghi chú (không bắt buộc)</label>
          <input id="tu-note" className="input" value={form.note} onChange={set('note')} maxLength={300} placeholder="Ví dụ: Mẹ An chuyển khoản qua Vietcombank" />
        </div>
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/** Đã thu -> Chưa đóng: phải nhập lại mật khẩu của mình (đã chốt) */
export function UnpayDialog({ student, cycle, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) return setError('Vui lòng nhập mật khẩu của bạn.');
    setSaving(true);
    setError('');
    try {
      const r = await apiPost(`/admin/tuition/students/${student.id}/unpay`, { cycleNo: cycle.cycleNo, password, note });
      onDone(r, `Đã chuyển kì ${cycle.cycleNo} của ${student.fullName} về "Chưa đóng".`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Bỏ "Đã thu" kì ${cycle.cycleNo}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" form="tu-unpay-form" className="btn btn-danger" disabled={saving}>
            {saving ? 'Đang kiểm tra…' : 'Chuyển về "Chưa đóng"'}
          </button>
        </>
      }
    >
      <form id="tu-unpay-form" className="tu-form" onSubmit={submit} noValidate>
        <p className="tu-form-who">
          <strong>{student.fullName}</strong> · kì {cycle.cycleNo}: đã thu {formatMoney(cycle.payment.amount)} ngày {formatDate(cycle.payment.paidOn)}
        </p>
        <p className="muted small-text">Việc này được ghi vào lịch sử. Để chắc chắn là bạn, hãy nhập lại mật khẩu đăng nhập.</p>
        <div className="field">
          <label htmlFor="tu-pw">Mật khẩu của bạn</label>
          <input id="tu-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tu-why">Lý do (không bắt buộc)</label>
          <input id="tu-why" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ví dụ: Ghi nhầm học sinh" />
        </div>
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/** Tắt / bật lại cảnh báo một kì (có hỏi lại). Trả kết quả mới của học sinh. */
export async function toggleSnooze(student, cycleNo, snoozed) {
  const msg = snoozed
    ? `Bật lại cảnh báo học phí kì ${cycleNo} của ${student.fullName}?`
    : `Tắt cảnh báo học phí kì ${cycleNo} của ${student.fullName}?\n\nCảnh báo của kì này sẽ ẩn hẳn (trang chủ, điểm danh). Kì sau vẫn cảnh báo bình thường. Bật lại được bất cứ lúc nào.`;
  if (!window.confirm(msg)) return null;
  return apiPost(`/admin/tuition/students/${student.id}/${snoozed ? 'unsnooze' : 'snooze'}`, { cycleNo });
}

const EVENT_LABELS = { pay: 'Thu học phí', unpay: 'Bỏ "Đã thu"', snooze: 'Tắt cảnh báo', unsnooze: 'Bật lại cảnh báo' };

/**
 * Học phí của một học sinh (admin chính): mọi kì đã xếp đủ lịch, thu / bỏ thu / tắt cảnh báo, lịch sử thu.
 * onChanged: gọi sau mỗi thay đổi (để trang cha tải lại số liệu).
 */
export function StudentTuition({ studentId, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null); // { type: 'pay' | 'unpay', cycle }
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    apiGet(`/admin/tuition/students/${studentId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [studentId]);

  if (error && !data) return <p className="alert-error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const { student, class: cls, cycles, events, legacy } = data;
  const updated = (r, text) => {
    setData(r);
    setDialog(null);
    setMessage(text);
    setError('');
    onChanged?.();
  };

  async function snooze(cy) {
    try {
      const r = await toggleSnooze(student, cy.cycleNo, cy.snoozed);
      if (r) updated(r, cy.snoozed ? `Đã bật lại cảnh báo kì ${cy.cycleNo}.` : `Đã tắt cảnh báo kì ${cy.cycleNo}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tu-student">
      <div className="tu-student-head">
        <p>
          {cls.configured
            ? <>Học phí lớp: <strong>{formatMoney(cls.pricePerSession)}/buổi</strong>, mỗi kì {cls.cycleSessions} buổi</>
            : <strong className="text-warn">Lớp chưa cài học phí (số buổi mỗi kì, học phí mỗi buổi).</strong>}
          {student.discountPercent > 0 && <> · Giảm giá <strong>{student.discountPercent}%</strong>{student.discountNote && ` (${student.discountNote})`}</>}
          {student.tuition?.startNo && <> · Bắt đầu học từ buổi {student.tuition.startNo} ({formatDate(student.tuition.startDate)})</>}
        </p>
        <ExcelLink small href={`/admin/tuition/students/${student.id}/export`}>Tải lịch sử thu (Excel)</ExcelLink>
      </div>
      {cls.gap && (
        <p className="tu-gap"><LineIcon name="alert" size={16} /> Lớp mới xếp {cls.gap.scheduled}/{cls.gap.needed} buổi của kì {cls.gap.cycleNo} — xếp đủ lịch thì mới thu được kì đó.</p>
      )}
      {message && <p className="alert-success admin-message" role="status">{message}</p>}
      {error && <p className="alert-error admin-message">{error}</p>}

      {cycles.length === 0 ? (
        <p className="muted">Chưa có kì học phí nào (lớp chưa xếp đủ lịch của kì đầu tiên, hoặc chưa cài học phí).</p>
      ) : (
        <div className="table-wrap">
          <table className="table tu-cycles">
            <thead>
              <tr>
                <th>Kì</th>
                <th>Các buổi</th>
                <th>Hạn đóng</th>
                <th>Cần thu</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cy) => (
                <tr key={cy.cycleNo}>
                  <td><strong>{cy.cycleNo}</strong></td>
                  <td className="nowrap">{cycleRange(cy)}</td>
                  <td className="nowrap">{formatDate(cy.dueDate)}</td>
                  <td className="nowrap">{formatMoney(cy.amount)}</td>
                  <td>
                    {cy.payment ? (
                      <>
                        <span className="tu-status is-paid">Đã thu {formatMoney(cy.payment.amount)}</span>
                        <div className="muted small-text">
                          {formatDate(cy.payment.paidOn)} · {METHOD_LABELS[cy.payment.method]}{cy.payment.by && ` · ${cy.payment.by}`}
                          {cy.payment.note && ` — ${cy.payment.note}`}
                        </div>
                      </>
                    ) : (
                      <span className="tu-status is-unpaid">Chưa đóng</span>
                    )}
                    {cy.mismatch && <div className="text-warn small-text">Lịch đã đổi sau khi thu (thêm / xóa buổi) — số tiền đã thu giữ nguyên.</div>}
                    {cy.snoozed && <div className="muted small-text">Đã tắt cảnh báo kì này</div>}
                  </td>
                  <td>
                    <div className="table-actions">
                      {cy.payment ? (
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setDialog({ type: 'unpay', cycle: cy })}>Bỏ "Đã thu"</button>
                      ) : (
                        <>
                          <button type="button" className="btn btn-primary btn-small" onClick={() => setDialog({ type: 'pay', cycle: cy })}>Thu tiền</button>
                          <button type="button" className="btn btn-link btn-small" onClick={() => snooze(cy)}>
                            {cy.snoozed ? 'Bật lại cảnh báo' : 'Tắt cảnh báo'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(events.length > 0 || legacy.length > 0) && (
        <button type="button" className="btn btn-link small-text" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Ẩn' : 'Xem'} lịch sử thu ({events.length + legacy.length})
        </button>
      )}
      {showLog && (
        <ul className="tu-log">
          {events.map((e) => (
            <li key={e.id}>
              <span className="muted">{formatDateTime(e.createdAt)}</span> · <strong>{EVENT_LABELS[e.action]}</strong> kì {e.cycleNo}
              {e.amount != null && ` · ${formatMoney(e.amount)}`}
              {e.action === 'pay' && e.method && ` · ${METHOD_LABELS[e.method]}, ngày ${formatDate(e.paidOn)}`}
              {e.by && ` · ${e.by}`}
              {e.note && <span className="muted"> — {e.note}</span>}
            </li>
          ))}
          {legacy.map((f) => (
            <li key={`old-${f.cycleNo}`} className="muted">
              {formatDateTime(f.createdAt)} · Đã đóng đợt {f.cycleNo} (cách tính cũ, lúc đã học {f.sessionsAt} buổi){f.by && ` · ${f.by}`}
              {f.note && ` — ${f.note}`}
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === 'pay' && <PayDialog student={student} cycle={dialog.cycle} onClose={() => setDialog(null)} onDone={updated} />}
      {dialog?.type === 'unpay' && <UnpayDialog student={student} cycle={dialog.cycle} onClose={() => setDialog(null)} onDone={updated} />}
    </div>
  );
}
