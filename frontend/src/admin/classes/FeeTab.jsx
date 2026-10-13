import { useState } from 'react';
import { apiPost } from '../../utils/api.js';
import { feeBadge } from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';

const RANK = { due: 0, soon: 1, ok: 2, off: 3 };

/**
 * Nhắc học phí của lớp: mỗi học sinh một thanh tiến độ "đã học x / N buổi của đợt này".
 * Tới hạn thì bấm "Đã thu học phí" để bắt đầu đợt mới; bấm nhầm thì "Hoàn tác".
 */
export default function FeeTab({ cls, students, onChanged, onEditClass }) {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(null);
  const active = students.filter((s) => s.isActive).sort((a, b) => RANK[a.fee.state] - RANK[b.fee.state] || a.fee.remaining - b.fee.remaining);

  if (!cls.feeEvery) {
    return (
      <div className="cl-empty">
        <LineIcon name="money" size={40} />
        <p>Lớp này chưa bật nhắc học phí.</p>
        <button type="button" className="btn btn-primary" onClick={onEditClass}>Bật nhắc học phí</button>
      </div>
    );
  }

  async function act(s, action) {
    let body = {};
    if (action === 'fee-paid') {
      const note = window.prompt(`Đánh dấu đã thu học phí của "${s.fullName}".\n\nGhi chú (không bắt buộc, ví dụ: "chuyển khoản 1.500.000đ"):`, '');
      if (note === null) return;
      body = { note };
    } else if (!window.confirm(`Hoàn tác lần "Đã thu học phí" gần nhất của "${s.fullName}"?`)) {
      return;
    }
    setBusy(s.id);
    try {
      await apiPost(`/admin/classes/${cls.id}/students/${s.id}/${action}`, body);
      setMessage({ type: 'success', text: action === 'fee-paid' ? `Đã ghi nhận "${s.fullName}" đóng học phí. Đợt mới bắt đầu tính.` : `Đã hoàn tác cho "${s.fullName}".` });
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cl-fee">
      <p className="cl-info">
        <LineIcon name="money" size={20} />
        <span>
          Nhắc sau mỗi <strong>{cls.feeEvery} buổi học</strong> của từng học sinh — tính cả buổi vắng, học sinh vào muộn
          thì tính từ buổi vào học. Thu xong bấm <strong>"Đã thu học phí"</strong> để bắt đầu đợt mới.
        </span>
      </p>
      {message.text && (
        <p className={`admin-message ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{message.text}</p>
      )}

      <div className="cl-fee-list">
        {active.map((s) => {
          const badge = feeBadge(s.fee);
          const shown = Math.min(s.fee.progress, s.fee.every);
          return (
            <div key={s.id} className={`cl-fee-row is-${s.fee.state}`}>
              <div className="cl-fee-name">
                <strong>{s.fullName}</strong>
                <span className="muted small-text">
                  Đã học tổng {s.stats.sessions} buổi
                  {s.fee.lastPaidAt && ` · thu gần nhất ${formatDateTime(s.fee.lastPaidAt)}`}
                </span>
              </div>
              <div className="cl-fee-progress" aria-label={`Đợt này đã học ${shown} trên ${s.fee.every} buổi`}>
                <div className="cl-fee-bar">
                  <span style={{ width: `${(shown / s.fee.every) * 100}%` }} />
                </div>
                <span className="cl-fee-num">{shown}/{s.fee.every} buổi</span>
              </div>
              <span className={`cl-pill is-${badge.tone}`}>{badge.text}</span>
              <div className="cl-fee-actions">
                {s.fee.state === 'due' && (
                  <button type="button" className="btn btn-primary btn-small" disabled={busy === s.id} onClick={() => act(s, 'fee-paid')}>
                    <LineIcon name="check" size={18} /> Đã thu học phí
                  </button>
                )}
                {/* Còn 1 buổi: phụ huynh đóng sớm thì bấm được, nhưng để nút nhạt cho khỏi bấm nhầm */}
                {s.fee.state === 'soon' && (
                  <button type="button" className="btn btn-secondary btn-small" disabled={busy === s.id} onClick={() => act(s, 'fee-paid')}>
                    Thu sớm
                  </button>
                )}
                {s.fee.paidCycles > 0 && (
                  <button type="button" className="btn btn-link small-text" disabled={busy === s.id} onClick={() => act(s, 'fee-undo')}>
                    Hoàn tác lần thu gần nhất
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {active.length === 0 && <p className="muted">Lớp chưa có học sinh.</p>}
      </div>
    </div>
  );
}
