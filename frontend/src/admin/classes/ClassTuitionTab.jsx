import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ALERT_LEVELS, formatDate, formatMoney } from '../../utils/schedule.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { AlertBadge, FeeStatus, StudentTuition } from './TuitionBits.jsx';

const rankOf = (s) => (s.tuition?.alert ? ALERT_LEVELS[s.tuition.alert.level].rank : 9);

/**
 * Tab "Học phí" của một lớp (chỉ admin chính): mỗi học sinh một dòng (kì hiện tại đã thu chưa, cảnh báo),
 * bấm "Thu / xem" để mở các kì học phí của học sinh đó.
 */
export default function ClassTuitionTab({ cls, students, onChanged, onEditClass }) {
  const [open, setOpen] = useState(null);
  const active = students.filter((s) => s.isActive).sort((a, b) => rankOf(a) - rankOf(b));

  if (!cls.tuitionConfigured) {
    return (
      <div className="cl-empty">
        <LineIcon name="money" size={40} />
        <p>Lớp này chưa cài học phí (số buổi mỗi kì, học phí mỗi buổi).</p>
        <button type="button" className="btn btn-primary" onClick={onEditClass}>Cài học phí cho lớp</button>
      </div>
    );
  }

  return (
    <div className="tu-class">
      <div className="tu-class-head">
        <p>
          <strong>{formatMoney(cls.pricePerSession)}/buổi</strong>, mỗi kì <strong>{cls.cycleSessions} buổi</strong> ={' '}
          {formatMoney(cls.pricePerSession * cls.cycleSessions)}. Học sinh đóng trước mỗi kì.
        </p>
        <Link to="/admin/hoc-phi" className="btn btn-secondary cl-btn-icon">
          <LineIcon name="money" size={20} /> Quản lý học phí (theo tháng)
        </Link>
      </div>
      <p className="tu-defs">
        Buổi học đếm theo thời khóa biểu (vắng vẫn tính). Kì 1 = buổi 1–{cls.cycleSessions}, kì 2 = buổi {cls.cycleSessions + 1}–{cls.cycleSessions * 2}…
        Hạn đóng kì sau = ngày buổi cuối của kì trước; kì đầu của học sinh = ngày buổi bắt đầu học.
      </p>

      <div className="table-wrap">
        <table className="table cl-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Bắt đầu học</th>
              <th>Đã học</th>
              <th>Học phí</th>
              <th>Cảnh báo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td className="cl-col-name">
                    <strong>{s.fullName}</strong>
                    {s.discountPercent > 0 && <div className="muted small-text">Giảm {s.discountPercent}%{s.discountNote && ` · ${s.discountNote}`}</div>}
                  </td>
                  <td className="nowrap">{s.tuition?.startNo ? `Buổi ${s.tuition.startNo} (${formatDate(s.tuition.startDate)})` : <span className="muted">—</span>}</td>
                  <td className="nowrap">{s.tuition?.sessionsDone ?? 0} buổi</td>
                  <td><FeeStatus labels={s.tuition?.labels} /></td>
                  <td>
                    {s.tuition?.alert ? <AlertBadge alert={s.tuition.alert} withAmount /> : <span className="muted small-text">—</span>}
                    {s.tuition?.snoozedCycles?.length > 0 && (
                      <div className="muted small-text">Đã tắt cảnh báo kì {s.tuition.snoozedCycles.join(', ')}</div>
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? 'Đóng' : 'Thu / xem'}
                    </button>
                  </td>
                </tr>
                {open === s.id && (
                  <tr className="row-panel">
                    <td colSpan={6}>
                      <StudentTuition studentId={s.id} onChanged={onChanged} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {active.length === 0 && <p className="table-empty">Lớp chưa có học sinh.</p>}
      </div>
    </div>
  );
}
