import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  addMinutes,
  formatDate,
  vnToday,
  weekdayOf,
} from '../../utils/schedule.js';
import Modal from './Modal.jsx';

const DURATIONS = [
  { minutes: 60, label: '1 giờ' },
  { minutes: 90, label: '1 giờ 30' },
  { minutes: 120, label: '2 giờ' },
];

/** Buổi đầu tiên của lịch hằng tuần: buổi sắp tới gần nhất (từ bây giờ) */
function firstDate(days) {
  const today = vnToday();
  const nowTime = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 16);
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    const day = days.find((x) => x.weekday === weekdayOf(d) && (i > 0 || x.startTime > nowTime));
    if (day) return { date: d, ...day };
  }
  return null;
}

/**
 * Xếp lịch học (mode="create") hoặc sửa lịch một buổi (mode="edit") — chỉ admin chính.
 * Xếp lịch có 2 cách:
 *   - "Lịch hằng tuần" (mặc định): chọn các thứ, mỗi thứ một giờ học riêng. Không có ngày bắt đầu / kết thúc:
 *     bắt đầu từ buổi sắp tới gần nhất, lặp lại mãi cho tới khi admin chính khóa lớp.
 *   - "Một buổi": học bù / học thêm vào một ngày cụ thể.
 * Bắt buộc có giáo viên: một hoặc nhiều tài khoản, và / hoặc giáo viên ngoài (gõ tên).
 * Buổi đã điểm danh: không đổi được ngày giờ (chỉ giáo viên, phòng, ghi chú).
 * Server hỏi lại (reason 'confirm') khi trùng giờ, buổi đã qua (sẽ được tính tiền), kì học phí đã thu bị lệch.
 */
export default function SessionDialog({ mode, session, defaults = {}, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const startDate = isEdit ? session.date : defaults.date || vnToday();
  const defaultStart = isEdit ? session.startTime : defaults.startTime || '18:00';
  const [form, setForm] = useState(() => ({
    kind: 'weekly', // 'weekly' = lịch hằng tuần, 'one' = một buổi
    classId: String(isEdit ? session.classId : defaults.classId || ''),
    date: startDate,
    startTime: defaultStart,
    endTime: isEdit ? session.endTime : addMinutes(defaultStart, 90),
    // Lịch hằng tuần: mỗi thứ một khung giờ
    days: [{ weekday: weekdayOf(startDate), startTime: defaultStart, endTime: addMinutes(defaultStart, 90) }],
    teacherIds: isEdit ? session.teacher.ids.map(String) : [],
    otherName: isEdit ? session.teacher.otherName || '' : '',
    room: isEdit ? session.room : '',
    note: isEdit ? session.note : '',
    scope: 'one',
  }));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // điều server hỏi lại trước khi lưu
  const locked = isEdit && Boolean(session.attendanceAt);
  const [saving, setSaving] = useState(false);
  const weekly = !isEdit && form.kind === 'weekly';

  useEffect(() => {
    apiGet('/admin/schedule/teachers').then((d) => setTeachers(d.teachers)).catch(() => {});
    // Lớp đã khóa (đã kết thúc) thì không xếp lịch được nữa
    if (!isEdit) apiGet('/admin/classes').then((d) => setClasses(d.classes.filter((c) => !c.closedAt))).catch(() => {});
  }, [isEdit]);

  const set = (name, value) => {
    setConfirm(null);
    setForm((f) => ({ ...f, [name]: value }));
  };
  const onInput = (name) => (e) => set(name, e.target.value);

  // Bấm một thứ: bật thì thêm dòng giờ học (lấy giờ của dòng cuối cho đỡ phải gõ lại), tắt thì bỏ dòng đó
  function toggleWeekday(d) {
    const on = form.days.some((x) => x.weekday === d);
    const last = form.days.at(-1) || { startTime: '18:00', endTime: '19:30' };
    const days = on
      ? form.days.filter((x) => x.weekday !== d)
      : [...form.days, { weekday: d, startTime: last.startTime, endTime: last.endTime }].sort((a, b) => a.weekday - b.weekday);
    set('days', days);
  }
  const setDay = (weekday, name, value) => set('days', form.days.map((x) => (x.weekday === weekday ? { ...x, [name]: value } : x)));

  const followingCount = isEdit ? session.followingCount || 1 : 1;
  const followingScope = isEdit && form.scope === 'following';
  const first = weekly ? firstDate(form.days) : null;

  async function submit(force = false) {
    setError('');
    if (!isEdit && !form.classId) return setError('Vui lòng chọn lớp học.');
    if (weekly) {
      if (form.days.length === 0) return setError('Hãy chọn ít nhất một thứ trong tuần.');
      const bad = form.days.find((x) => !x.startTime || !x.endTime || x.endTime <= x.startTime);
      if (bad) return setError(`${WEEKDAY_LONG[bad.weekday]}: giờ kết thúc phải sau giờ bắt đầu.`);
    } else {
      if (!form.date) return setError('Vui lòng chọn ngày học.');
      if (!form.startTime || !form.endTime) return setError('Vui lòng chọn giờ bắt đầu và giờ kết thúc.');
      if (form.endTime <= form.startTime) return setError('Giờ kết thúc phải sau giờ bắt đầu.');
    }
    if (form.teacherIds.length === 0 && !form.otherName.trim()) {
      return setError('Vui lòng chọn giáo viên dạy buổi học này (hoặc gõ tên giáo viên ngoài).');
    }
    const moved = isEdit && (form.date !== session.date || form.startTime !== session.startTime || form.endTime !== session.endTime);
    const when = `${WEEKDAY_LONG[weekdayOf(form.date)]}, ${formatDate(form.date)} ${form.startTime}–${form.endTime}`;
    if (!force && moved && !window.confirm(`Đổi buổi học sang ${when}?\n\nGiáo viên sẽ nhận được thông báo.`)) return;

    const body = {
      startTime: form.startTime,
      endTime: form.endTime,
      teacherIds: form.teacherIds.map(Number),
      teacherName: form.otherName.trim(),
      room: form.room,
      note: form.note,
      force,
    };
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        result = await apiPost(`/admin/schedule/${session.id}/update`, {
          ...body,
          scope: form.scope,
          ...(followingScope ? {} : { date: form.date }),
        });
      } else if (weekly) {
        result = await apiPost('/admin/schedule', { ...body, classId: Number(form.classId), weekly: { slots: form.days } });
      } else {
        result = await apiPost('/admin/schedule', { ...body, classId: Number(form.classId), date: form.date });
      }
      onSaved(result);
    } catch (err) {
      if (err.data?.reason === 'confirm') setConfirm(err.data);
      else setError(err.message);
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => submit(false)}>
        {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : weekly ? 'Xếp lịch hằng tuần' : 'Xếp buổi học'}
      </button>
    </>
  );

  /** Ô giờ bắt đầu → giờ kết thúc + nút chọn nhanh thời lượng */
  const timeFields = (start, end, onChange, idPrefix, disabled = false) => (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-start`}>Giờ bắt đầu</label>
        <input id={`${idPrefix}-start`} className="input" type="time" value={start} onChange={(e) => onChange('startTime', e.target.value)} disabled={disabled} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-end`}>Giờ kết thúc</label>
        <input id={`${idPrefix}-end`} className="input" type="time" value={end} onChange={(e) => onChange('endTime', e.target.value)} disabled={disabled} />
        {!disabled && (
          <div className="cl-chips">
            {DURATIONS.map((d) => (
              <button key={d.minutes} type="button" className="cl-chip" onClick={() => onChange('endTime', addMinutes(start, d.minutes))}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <Modal title={isEdit ? 'Sửa lịch buổi học' : 'Xếp lịch học'} onClose={onClose} footer={footer} wide>
      <div className="cl-dialog">
        {isEdit ? (
          <p className="cl-dialog-class">Lớp <strong>{session.className}</strong></p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="sd-class">Lớp học</label>
              <select id="sd-class" className="input" value={form.classId} onChange={onInput('classId')}>
                <option value="">— Chọn lớp —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {classes.length === 0 && <p className="field-hint">Chưa có lớp nào. Hãy tạo lớp ở mục "Lớp học" trước.</p>}
            </div>
            <fieldset className="cl-radio-group">
              <legend>Xếp lịch kiểu nào?</legend>
              <label className={`type-row ${form.kind === 'weekly' ? 'is-on' : ''}`}>
                <input type="radio" name="sd-kind" checked={form.kind === 'weekly'} onChange={() => set('kind', 'weekly')} />
                <span className="type-row-text">
                  <strong>Lịch học hằng tuần</strong>
                  <span className="type-row-desc">học đều các thứ trong tuần, tự lặp lại cho tới khi khóa lớp</span>
                </span>
              </label>
              <label className={`type-row ${form.kind === 'one' ? 'is-on' : ''}`}>
                <input type="radio" name="sd-kind" checked={form.kind === 'one'} onChange={() => set('kind', 'one')} />
                <span className="type-row-text">
                  <strong>Một buổi</strong>
                  <span className="type-row-desc">học bù, học thêm vào một ngày</span>
                </span>
              </label>
            </fieldset>
          </>
        )}

        {isEdit && followingCount > 1 && (
          <fieldset className="cl-radio-group">
            <legend>Áp dụng cho</legend>
            <label className={`type-row ${form.scope === 'one' ? 'is-on' : ''}`}>
              <input type="radio" name="sd-scope" checked={form.scope === 'one'} onChange={() => set('scope', 'one')} />
              <span className="type-row-text"><strong>Chỉ buổi này</strong></span>
            </label>
            <label className={`type-row ${form.scope === 'following' ? 'is-on' : ''}`}>
              <input type="radio" name="sd-scope" checked={form.scope === 'following'} onChange={() => set('scope', 'following')} />
              <span className="type-row-text">
                <strong>{session.weekly ? 'Buổi này và các buổi sau' : `Buổi này và ${followingCount - 1} buổi sau`}</strong>
                <span className="type-row-desc">
                  Đổi giờ thì chỉ đổi các buổi {WEEKDAY_LONG[weekdayOf(session.date)]}; giáo viên, phòng học đổi cho mọi buổi sau
                </span>
              </span>
            </label>
          </fieldset>
        )}

        {locked && (
          <p className="cl-alert-warn">
            Buổi này đã điểm danh nên không đổi được ngày giờ (giữ đúng số buổi đã học và học phí). Bạn vẫn đổi được giáo viên, phòng học, ghi chú.
          </p>
        )}

        {weekly ? (
          <div className="cl-repeat is-on">
            <p className="cl-repeat-label">Học vào các thứ (bấm để chọn)</p>
            <div className="cl-weekdays">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = form.days.some((x) => x.weekday === d);
                return (
                  <button key={d} type="button" className={`cl-weekday ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleWeekday(d)}>
                    {WEEKDAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
            {form.days.map((x) => (
              <div key={x.weekday} className="cl-weekly-day">
                <span className="cl-weekly-name">{WEEKDAY_LONG[x.weekday]}</span>
                <div className="cl-dialog-row">{timeFields(x.startTime, x.endTime, (name, value) => setDay(x.weekday, name, value), `sd-w${x.weekday}`)}</div>
              </div>
            ))}
            <p className="cl-repeat-preview">
              {first ? (
                <>
                  Bắt đầu từ buổi <strong>{WEEKDAY_LONG[weekdayOf(first.date)]}, {formatDate(first.date)}</strong> ({first.startTime}–{first.endTime}),
                  tự lặp lại mỗi tuần. Lớp kết thúc thì bấm <strong>Khóa lớp</strong> để dừng lịch.
                </>
              ) : (
                'Chọn ít nhất một thứ trong tuần.'
              )}
            </p>
          </div>
        ) : (
          <div className="cl-dialog-row">
            <div className="field">
              <label htmlFor="sd-date">Ngày học</label>
              <input id="sd-date" className="input" type="date" value={form.date} onChange={onInput('date')} disabled={followingScope || locked} />
              {followingScope ? (
                <p className="field-hint">Đổi ngày chỉ làm được khi sửa riêng một buổi.</p>
              ) : (
                form.date && <p className="field-hint">{WEEKDAY_LONG[weekdayOf(form.date)]}</p>
              )}
            </div>
            {timeFields(form.startTime, form.endTime, set, 'sd', locked)}
          </div>
        )}

        <fieldset className="cl-teacher-pick">
          <legend>Giáo viên dạy <span className="cl-required">(bắt buộc, chọn được nhiều)</span></legend>
          <div className="cl-chip-list">
            {teachers.map((t) => {
              const on = form.teacherIds.includes(String(t.id));
              return (
                <label key={t.id} className={`cl-chip ${on ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set('teacherIds', on ? form.teacherIds.filter((x) => x !== String(t.id)) : [...form.teacherIds, String(t.id)])}
                  />
                  {t.displayName}{t.role === 'owner' ? ' (Admin chính)' : ''}
                </label>
              );
            })}
            {/* Giáo viên đã bị vô hiệu hóa vẫn hiện nếu đang dạy buổi này */}
            {isEdit && session.teacher.list.filter((t) => !teachers.some((x) => x.id === t.id)).map((t) => (
              <span key={t.id} className="cl-chip is-on is-disabled">{t.name} (đã vô hiệu hóa)</span>
            ))}
          </div>
          <div className="field cl-other-teacher">
            <label htmlFor="sd-other">Giáo viên ngoài (không có tài khoản)</label>
            <input id="sd-other" className="input" value={form.otherName} onChange={onInput('otherName')} placeholder="Để trống nếu không có. Ví dụ: Thầy Tom" maxLength={60} />
            <p className="field-hint">
              Giáo viên được chọn tự thành giáo viên phụ trách lớp. Buổi chỉ có giáo viên ngoài thì admin chính hoặc giáo viên phụ trách lớp điểm danh.
            </p>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="sd-room">Phòng học (không bắt buộc)</label>
          <input id="sd-room" className="input" value={form.room} onChange={onInput('room')} placeholder="Ví dụ: P.2" maxLength={40} />
        </div>

        {!weekly && (
          <div className="field">
            <label htmlFor="sd-note">Ghi chú cho buổi học (không bắt buộc)</label>
            <input id="sd-note" className="input" value={form.note} onChange={onInput('note')} placeholder="Ví dụ: Kiểm tra giữa kỳ" maxLength={200} />
          </div>
        )}

        {confirm && <ConfirmBox data={confirm} saving={saving} onConfirm={() => submit(true)} label={isEdit ? 'Vẫn lưu thay đổi' : 'Vẫn xếp lịch'} />}
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * Hộp hỏi lại trước khi lưu thay đổi lịch (server báo trước — reason 'confirm'):
 * trùng giờ, buổi đã qua giờ học (sẽ được tính tiền), kì học phí đã thu bị lệch do đánh số lại các buổi.
 */
export function ConfirmBox({ data, saving, onConfirm, label }) {
  return (
    <div className="cl-conflict" role="alert">
      {data.conflicts?.length > 0 && (
        <>
          <p><strong>Lịch bị trùng giờ:</strong></p>
          <ul>
            {data.conflicts.map((c, i) => <li key={i}>{c}</li>)}
            {data.more > 0 && <li>… và {data.more} buổi khác</li>}
          </ul>
        </>
      )}
      {data.past > 0 && (
        <p>
          <strong>{data.past === 1 ? 'Buổi này' : `${data.past} buổi`} đã qua giờ học.</strong> Buổi đã qua được tính là đã học —{' '}
          <strong>buổi này sẽ được tính tiền</strong> (kể cả học sinh vắng). Giáo viên điểm danh bổ sung được tới hết ngày mai.
        </p>
      )}
      {data.cycles?.length > 0 && (
        <>
          <p><strong>Các buổi sẽ được đánh số lại, làm lệch {data.cycles.length + (data.moreCycles || 0)} kì học phí đã thu:</strong></p>
          <ul>
            {data.cycles.map((c, i) => <li key={i}>{c.fullName} — kì {c.cycleNo}</li>)}
            {data.moreCycles > 0 && <li>… và {data.moreCycles} kì khác</li>}
          </ul>
          <p className="small-text">Số tiền đã thu giữ nguyên; trang học phí đánh dấu các kì này là "lịch đã đổi sau khi thu" để bạn kiểm tra.</p>
        </>
      )}
      <button type="button" className="btn btn-danger btn-small" disabled={saving} onClick={onConfirm}>{label}</button>
    </div>
  );
}
