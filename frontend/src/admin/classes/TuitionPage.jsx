import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../../utils/api.js';
import { FEE_STATUS_LABELS, METHOD_LABELS, classStyle, formatDate, formatDay, formatMoney, vnToday } from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { AlertBadge, ExcelLink, PayDialog, StudentTuition } from './TuitionBits.jsx';
import './classes.css';

const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
/** "2026-10" + n tháng */
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthLabel = (month) => `tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;

/**
 * Quản lý học phí (chỉ admin chính): chọn tháng, mỗi lớp một khối thu gọn (giáo viên, số buổi đã học,
 * cần thu / đã thu / còn thiếu), mở ra là bảng từng học sinh. Tải Excel cả tháng.
 */
export default function TuitionPage() {
  const [params, setParams] = useSearchParams();
  const month = isMonth(params.get('thang')) ? params.get('thang') : vnToday().slice(0, 7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({}); // id lớp -> đang mở

  const load = useCallback(() => {
    apiGet(`/admin/tuition?month=${month}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [month]);
  useEffect(load, [load]);

  const go = (m) => setParams({ thang: m }, { replace: true });
  const shown = data && data.month === month ? data : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="admin-title">Quản lý học phí</h1>
          <p className="admin-intro">Tình hình thu học phí từng lớp theo tháng. Bấm vào một lớp để xem từng học sinh, thu tiền, xem lịch sử thu.</p>
        </div>
        <div className="page-head-actions">
          <ExcelLink href={`/admin/tuition/export?month=${month}`}>Tải Excel {monthLabel(month)}</ExcelLink>
        </div>
      </div>

      <div className="tu-month">
        <button type="button" className="btn btn-secondary cl-btn-icon" onClick={() => go(shiftMonth(month, -1))}>
          <LineIcon name="left" size={18} /> Tháng trước
        </button>
        <label className="tu-month-pick">
          <span className="cl-sr">Chọn tháng</span>
          <input type="month" className="input" value={month} onChange={(e) => isMonth(e.target.value) && go(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary cl-btn-icon" onClick={() => go(shiftMonth(month, 1))}>
          Tháng sau <LineIcon name="right" size={18} />
        </button>
        {month !== vnToday().slice(0, 7) && (
          <button type="button" className="btn btn-link" onClick={() => go(vnToday().slice(0, 7))}>Về tháng này</button>
        )}
      </div>

      <p className="tu-defs">
        <strong>Cách tính:</strong> buổi học đếm theo thời khóa biểu (vắng vẫn tính); "đã học" = buổi đã qua giờ kết thúc, tính từ buổi bắt đầu học.
        Mỗi lớp chia thành các kì (ví dụ 8 buổi / kì), học sinh <strong>đóng trước</strong> mỗi kì. Hạn đóng kì sau = ngày buổi cuối của kì trước;
        kì đầu của học sinh = ngày buổi bắt đầu học. <strong>Cần thu trong tháng</strong> = tiền các kì có hạn đóng rơi vào tháng này;{' '}
        <strong>Đã thu</strong> = phần đã thu của chính các kì đó; <strong>Còn thiếu</strong> = cần thu − đã thu. Số tiền = số buổi × học phí/buổi × (100 − giảm giá)%.
      </p>

      {error && <p className="alert-error admin-message">{error}</p>}
      {!shown && !error && <p className="muted">Đang tải…</p>}

      {shown && (
        <>
          <div className="tu-totals">
            <div><span>Cần thu {monthLabel(month)}</span><strong>{formatMoney(shown.totals.due)}</strong></div>
            <div className="is-paid"><span>Đã thu</span><strong>{formatMoney(shown.totals.paid)}</strong></div>
            <div className={shown.totals.missing > 0 ? 'is-unpaid' : ''}><span>Còn thiếu</span><strong>{formatMoney(shown.totals.missing)}</strong></div>
          </div>

          {shown.classes.length === 0 && <p className="muted">Chưa có lớp nào.</p>}
          <div className="tu-blocks">
            {shown.classes.map((c) => (
              <ClassBlock key={c.id} c={c} month={month} open={Boolean(open[c.id])} onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} onChanged={load} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ClassBlock({ c, month, open, onToggle, onChanged }) {
  return (
    <section className={`tu-block ${open ? 'is-open' : ''}`} style={classStyle(c.color)}>
      <button type="button" className="tu-block-head" aria-expanded={open} onClick={onToggle}>
        <span className="tu-block-name">
          <strong>{c.name}</strong>
          <span className="muted small-text">{c.teachers.length ? c.teachers.join(', ') : 'Chưa có giáo viên phụ trách'}</span>
        </span>
        <span className="tu-block-stat">
          <span className="muted small-text">Đã học</span>
          <strong>{c.sessionsDone} buổi</strong>
          <span className="muted small-text">{monthLabel(month)}: {c.sessionsDoneInMonth}</span>
        </span>
        {!c.configured ? (
          <span className="tu-block-money"><span className="cl-pill">Chưa cài học phí</span></span>
        ) : c.status === 'not_due' ? (
          <span className="tu-block-money"><span className="tu-status is-not_due">Chưa đến hạn</span></span>
        ) : (
          <span className="tu-block-money">
            <span><span className="muted small-text">Cần thu</span> <strong>{formatMoney(c.due)}</strong></span>
            <span><span className="muted small-text">Đã thu</span> <strong className="text-success">{formatMoney(c.paid)}</strong></span>
            <span>
              <span className="muted small-text">Còn thiếu</span>{' '}
              <strong className={c.missing > 0 ? 'text-error' : ''}>{formatMoney(c.missing)}</strong>
            </span>
          </span>
        )}
        <LineIcon name={open ? 'up' : 'down'} size={20} />
      </button>
      {c.gap && (
        <p className="tu-gap">
          <LineIcon name="alert" size={16} /> Lớp {c.name} mới xếp {c.gap.scheduled}/{c.gap.needed} buổi của kì {c.gap.cycleNo} —{' '}
          <Link to={`/admin/lop-hoc/${c.id}?tab=lich-hoc`}>xếp tiếp lịch</Link> thì mới thu được kì đó.
        </p>
      )}
      {open && <ClassStudents c={c} onChanged={onChanged} />}
    </section>
  );
}

const STATUS_TONE = { paid: 'paid', unpaid: 'unpaid', not_due: 'not_due' };

function ClassStudents({ c, onChanged }) {
  const [panel, setPanel] = useState(null); // { id, type: 'absent' | 'history' }
  const [pay, setPay] = useState(null); // { student, cycle }
  const [message, setMessage] = useState('');
  const togglePanel = (id, type) => setPanel((p) => (p && p.id === id && p.type === type ? null : { id, type }));

  if (!c.configured) {
    return (
      <div className="tu-block-body">
        <p className="muted">
          Lớp chưa cài học phí. <Link to={`/admin/lop-hoc/${c.id}?tab=hoc-phi`}>Mở lớp để cài</Link> (số buổi mỗi kì, học phí mỗi buổi).
        </p>
      </div>
    );
  }

  return (
    <div className="tu-block-body">
      {message && <p className="alert-success admin-message" role="status">{message}</p>}
      <div className="table-wrap">
        <table className="table tu-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Buổi bắt đầu</th>
              <th>Đã học<br /><span className="muted small-text">tháng / tổng</span></th>
              <th>Nghỉ trong tháng</th>
              <th>Học phí / buổi</th>
              <th>Cần thu</th>
              <th>Đã thu</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {c.students.map((s) => {
              const unpaid = s.dueCycles.filter((cy) => !cy.payment);
              const pays = s.dueCycles.filter((cy) => cy.payment);
              const price = c.pricePerSession;
              return (
                <Fragment key={s.id}>
                  <tr className={s.isActive ? '' : 'is-off'}>
                    <td className="cl-col-name">
                      <strong>{s.fullName}</strong>
                      {!s.isActive && <span className="cl-pill">Đã nghỉ</span>}
                      {s.missingInfo && <span className="cl-pill is-soon">Thiếu thông tin</span>}
                    </td>
                    <td className="nowrap">{s.startNo ? <>Buổi {s.startNo}<div className="muted small-text">{formatDate(s.startDate)}</div></> : '—'}</td>
                    <td className="nowrap"><strong>{s.sessionsDoneInMonth}</strong> / {s.sessionsDone}</td>
                    <td>
                      {s.absences.length ? (
                        <button type="button" className="cl-absent-btn" onClick={() => togglePanel(s.id, 'absent')}>{s.absences.length} buổi</button>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td className="nowrap">
                      {formatMoney(price)}
                      {s.discountPercent > 0 && <div className="muted small-text">giảm {s.discountPercent}%</div>}
                    </td>
                    <td className="nowrap">
                      {s.dueCycles.length ? (
                        <>
                          <strong>{formatMoney(s.due)}</strong>
                          <div className="muted small-text">{s.dueCycles.map((cy) => `kì ${cy.cycleNo} (hạn ${formatDay(cy.dueDate)})`).join(', ')}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {pays.length ? (
                        pays.map((cy) => (
                          <div key={cy.cycleNo} className="nowrap">
                            <strong>{formatMoney(cy.payment.amount)}</strong>
                            <div className="muted small-text">{formatDate(cy.payment.paidOn)} · {METHOD_LABELS[cy.payment.method]}</div>
                          </div>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tu-status is-${STATUS_TONE[s.status]}`}>{FEE_STATUS_LABELS[s.status]}</span>
                      {s.alert && <div className="tu-status-alert"><AlertBadge alert={s.alert} short /></div>}
                      {s.missing > 0 && s.status === 'paid' && <div className="text-error small-text">Thiếu {formatMoney(s.missing)}</div>}
                      {s.dueCycles.filter((cy) => cy.snoozed).map((cy) => (
                        <div key={cy.cycleNo} className="muted small-text">Đã tắt cảnh báo kì {cy.cycleNo}</div>
                      ))}
                      {s.dueCycles.filter((cy) => cy.mismatch).map((cy) => (
                        <div key={cy.cycleNo} className="text-warn small-text">Kì {cy.cycleNo}: lịch đã đổi sau khi thu</div>
                      ))}
                      {s.olderUnpaid.map((cy) => (
                        <div key={cy.cycleNo} className="text-error small-text">Còn nợ kì {cy.cycleNo}: {formatMoney(cy.amount)} (hạn {formatDate(cy.dueDate)})</div>
                      ))}
                    </td>
                    <td>
                      <div className="table-actions">
                        {unpaid.map((cy) => (
                          <button key={cy.cycleNo} type="button" className="btn btn-primary btn-small" onClick={() => setPay({ student: s, cycle: cy })}>
                            Thu kì {cy.cycleNo}
                          </button>
                        ))}
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => togglePanel(s.id, 'history')}>
                          {panel?.id === s.id && panel.type === 'history' ? 'Đóng' : 'Lịch sử thu'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {panel?.id === s.id && (
                    <tr className="row-panel">
                      <td colSpan={9}>
                        {panel.type === 'absent' ? (
                          <ul className="cl-absence-list">
                            {s.absences.map((a) => (
                              <li key={a.sessionId} className={`is-${a.status}`}>
                                {a.no ? `Buổi ${a.no} · ` : ''}{formatDate(a.date)} {a.startTime} · {a.status === 'excused' ? 'Vắng có phép' : 'Vắng không phép'}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <StudentTuition studentId={s.id} onChanged={onChanged} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="tu-total-row">
              <td colSpan={5}><strong>Tổng lớp {c.name}</strong> ({c.students.length} học sinh)</td>
              <td className="nowrap"><strong>{formatMoney(c.due)}</strong></td>
              <td className="nowrap"><strong>{formatMoney(c.paid)}</strong></td>
              <td colSpan={2}>{c.missing > 0 ? <strong className="text-error">Còn thiếu {formatMoney(c.missing)}</strong> : c.due > 0 ? <span className="tu-status is-paid">Đã thu đủ</span> : ''}</td>
            </tr>
          </tfoot>
        </table>
        {c.students.length === 0 && <p className="table-empty">Lớp chưa có học sinh.</p>}
      </div>
      {pay && (
        <PayDialog
          student={{ id: pay.student.id, fullName: pay.student.fullName, discountPercent: pay.student.discountPercent }}
          cycle={pay.cycle}
          onClose={() => setPay(null)}
          onDone={(_, text) => {
            setPay(null);
            setMessage(text);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
