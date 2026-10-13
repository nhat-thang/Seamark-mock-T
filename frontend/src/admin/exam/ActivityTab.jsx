import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../utils/api.js';
import { formatDateTime } from '../../utils/format.js';
import { classStyle } from '../../utils/schedule.js';

/** Điểm của một lượt làm: đề tự thiết kế "8/10 câu · 8 điểm", đề TOEIC "32/40 câu · 650" */
function scoreText(a, examType) {
  if (a.status !== 'submitted') return 'Đang làm';
  const parts = [];
  if (a.correct !== null && a.total) parts.push(`${a.correct}/${a.total} câu`);
  if (examType === 'CUSTOM' && a.score10 !== null) parts.push(`${String(a.score10).replace('.', ',')} điểm`);
  if (examType !== 'CUSTOM' && a.totalScore !== null) parts.push(`${a.totalScore} điểm TOEIC`);
  return parts.join(' · ') || 'Đã nộp';
}

/** Các lần làm bài: mỗi lần một nút nhỏ (giờ + điểm), bấm để xem bài làm chi tiết */
function AttemptChips({ attempts, examType }) {
  return (
    <div className="act-chips">
      {attempts.map((a, i) => (
        <Link key={a.id} to={`/admin/ket-qua/${a.id}`} className={`act-chip ${a.status === 'submitted' ? '' : 'is-live'}`} title="Xem bài làm chi tiết">
          <strong>Lần {i + 1}</strong> {formatDateTime(a.submittedAt || a.startedAt)} · {scoreText(a, examType)}
        </Link>
      ))}
    </div>
  );
}

/**
 * Tab "Hoạt động" của đề: ai đã làm, lúc nào, làm mấy lần.
 * Class Assignment: theo từng lớp được giao, đủ học sinh (ai chưa làm hiện "Chưa làm").
 * Người làm khác (Training Test...): theo từng người.
 */
export default function ActivityTab({ examId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = useCallback(() => {
    apiGet(`/admin/exams/${examId}/activity`).then(setData).catch((err) => setError(err.message));
  }, [examId]);
  useEffect(load, [load]);

  if (error) return <p className="alert-error admin-message">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const isAssignment = data.category === 'homework';
  const allStudents = data.classes.flatMap((c) => c.students.filter((s) => s.isActive));
  const doneStudents = allStudents.filter((s) => s.attempts.some((a) => a.status === 'submitted'));
  const totalAttempts = data.classes.reduce((n, c) => n + c.students.reduce((m, s) => m + s.attempts.length, 0), 0)
    + data.others.reduce((n, o) => n + o.attempts.length, 0);

  return (
    <section className="admin-section act">
      <div className="act-head">
        <div className="act-stats">
          {isAssignment && (
            <span className="act-stat">
              <strong>{doneStudents.length}/{allStudents.length}</strong> học sinh đã làm
            </span>
          )}
          <span className="act-stat"><strong>{totalAttempts}</strong> lượt làm bài</span>
        </div>
        <div className="act-actions">
          {isAssignment && (
            <label className="checkbox-label">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Chỉ hiện học sinh chưa làm
            </label>
          )}
          <button type="button" className="btn btn-secondary btn-small" onClick={load}>Tải lại</button>
          <Link to={`/admin/ket-qua?examId=${examId}`} className="btn btn-secondary btn-small">Xem ở trang Kết quả</Link>
          <a className="btn btn-secondary btn-small" href={`/api/admin/exams/${examId}/activity/export`} download>Tải Excel</a>
        </div>
      </div>
      {data.hiddenClasses > 0 && (
        <p className="muted small-text">Đề còn được giao cho {data.hiddenClasses} lớp khác bạn không phụ trách (không hiện ở đây).</p>
      )}

      {isAssignment && data.classes.length === 0 && !data.hiddenClasses && (
        <p className="alert-error admin-message">Đề chưa giao cho lớp nào. Chọn lớp ở tab "Thông tin đề" → mục "Giao cho lớp".</p>
      )}

      {data.classes.map((c) => {
        const rows = c.students.filter((s) => !onlyMissing || (s.isActive && !s.attempts.some((a) => a.status === 'submitted')));
        const done = c.students.filter((s) => s.isActive && s.attempts.some((a) => a.status === 'submitted')).length;
        const active = c.students.filter((s) => s.isActive).length;
        return (
          <div key={c.id} className="act-class" style={classStyle(c.color)}>
            <h3 className="act-class-title">
              Lớp {c.name} <span className="muted small-text">· {done}/{active} học sinh đã làm</span>
            </h3>
            <div className="table-wrap">
              <table className="table act-table">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Trạng thái</th>
                    <th>Số lần</th>
                    <th>Các lần làm (bấm để xem bài)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const submitted = s.attempts.filter((a) => a.status === 'submitted').length;
                    const live = s.attempts.some((a) => a.status !== 'submitted');
                    return (
                      <tr key={s.classStudentId} className={s.attempts.length ? '' : 'is-missing'}>
                        <td>
                          <strong>{s.fullName}</strong>
                          {!s.isActive && <div className="muted small-text">Đã nghỉ học</div>}
                        </td>
                        <td className="nowrap">
                          {live ? <span className="tag tag-warn">Đang làm</span>
                            : submitted ? <span className="tag tag-ok">Đã làm</span>
                            : <span className="tag tag-off">Chưa làm</span>}
                        </td>
                        <td>{s.attempts.length || '—'}</td>
                        <td>{s.attempts.length ? <AttemptChips attempts={s.attempts} examType={data.examType} /> : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <p className="table-empty">{onlyMissing ? 'Cả lớp đã làm bài.' : 'Lớp chưa có học sinh.'}</p>}
            </div>
          </div>
        );
      })}

      {(data.others.length > 0 || !isAssignment) && (
        <div className="act-class">
          <h3 className="act-class-title">{isAssignment ? 'Người làm khác' : 'Người đã làm'}</h3>
          <div className="table-wrap">
            <table className="table act-table">
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Số lần</th>
                  <th>Các lần làm (bấm để xem bài)</th>
                </tr>
              </thead>
              <tbody>
                {data.others.map((o) => (
                  <Fragment key={o.studentId}>
                    <tr>
                      <td>
                        <strong>{o.name}</strong>
                        {o.phone && <div className="muted small-text">{o.phone}</div>}
                      </td>
                      <td>{o.attempts.length}</td>
                      <td><AttemptChips attempts={o.attempts} examType={data.examType} /></td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            {data.others.length === 0 && <p className="table-empty">Chưa có ai làm đề này.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
