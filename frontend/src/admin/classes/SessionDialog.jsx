import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  addMinutes,
  daysBetween,
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
const REPEAT_LENGTHS = [
  { days: 30, label: '1 tháng' },
  { days: 61, label: '2 tháng' },
  { days: 91, label: '3 tháng' },
  { days: 182, label: '6 tháng' },
];

/** Các ngày sẽ có buổi học khi "lặp lại hằng tuần" (để xem trước số buổi) */
function repeatDates(from, until, weekdays) {
  if (!from || !until || until < from || daysBetween(from, until) > 370) return [];
  const out = [];
  for (let d = from; d <= until; d = addDays(d, 1)) if (weekdays.includes(weekdayOf(d))) out.push(d);
  return out;
}

/**
 * Xếp lịch học (mode="create") hoặc sửa lịch một buổi (mode="edit") — chỉ admin chính.
 * Bắt buộc chọn giáo viên: một tài khoản admin, hoặc "Khác" rồi gõ tên.
 */
export default function SessionDialog({ mode, session, defaults = {}, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const startDate = isEdit ? session.date : defaults.date || vnToday();
  const [form, setForm] = useState(() => ({
    classId: String(isEdit ? session.classId : defaults.classId || ''),
    date: startDate,
    startTime: isEdit ? session.startTime : defaults.startTime || '18:00',
    endTime: isEdit ? session.endTime : addMinutes(defaults.startTime || '18:00', 90),
    teacher: isEdit ? (session.teacher.isOther ? 'other' : String(session.teacher.id)) : '',
    otherName: isEdit && session.teacher.isOther ? session.teacher.name : '',
    room: isEdit ? session.room : '',
    note: isEdit ? session.note : '',
    repeat: false,
    weekdays: [weekdayOf(startDate)],
    until: addDays(startDate, 91),
    scope: 'one',
  }));
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet('/admin/schedule/teachers').then((d) => setTeachers(d.teachers)).catch(() => {});
    if (!isEdit) apiGet('/admin/classes').then((d) => setClasses(d.classes)).catch(() => {});
  }, [isEdit]);

  const set = (name, value) => {
    setConflicts(null);
    setForm((f) => {
      const next = { ...f, [name]: value };
      // Đổi ngày bắt đầu: thứ lặp lại đi theo nếu đang chỉ chọn một thứ
      if (name === 'date' && value && f.weekdays.length === 1 && f.weekdays[0] === weekdayOf(f.date)) next.weekdays = [weekdayOf(value)];
      return next;
    });
  };
  const onInput = (name) => (e) => set(name, e.target.value);

  const toggleWeekday = (d) =>
    set('weekdays', form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort());

  const dates = form.repeat ? repeatDates(form.date, form.until, form.weekdays) : [form.date];
  const followingCount = isEdit ? session.followingCount || 1 : 1;
  const followingScope = isEdit && form.scope === 'following';

  async function submit(force = false) {
    setError('');
    if (!isEdit && !form.classId) return setError('Vui lòng chọn lớp học.');
    if (!form.date) return setError('Vui lòng chọn ngày học.');
    if (!form.startTime || !form.endTime) return setError('Vui lòng chọn giờ bắt đầu và giờ kết thúc.');
    if (form.endTime <= form.startTime) return setError('Giờ kết thúc phải sau giờ bắt đầu.');
    if (!form.teacher) return setError('Vui lòng chọn giáo viên dạy buổi học này.');
    if (form.teacher === 'other' && !form.otherName.trim()) return setError('Vui lòng gõ tên giáo viên.');
    if (form.repeat && form.weekdays.length === 0) return setError('Hãy chọn ít nhất một thứ trong tuần.');
    if (form.repeat && dates.length === 0) return setError('Không có ngày nào khớp. Kiểm tra lại "Lặp lại đến ngày".');

    const body = {
      startTime: form.startTime,
      endTime: form.endTime,
      teacherId: form.teacher === 'other' ? null : Number(form.teacher),
      teacherName: form.teacher === 'other' ? form.otherName : '',
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
      } else {
        result = await apiPost('/admin/schedule', {
          ...body,
          classId: Number(form.classId),
          date: form.date,
          repeat: form.repeat ? { weekdays: form.weekdays, until: form.until } : null,
        });
      }
      onSaved(result);
    } catch (err) {
      if (err.data?.reason === 'conflict') setConflicts(err.data);
      else setError(err.message);
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => submit(false)}>
        {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : dates.length > 1 ? `Xếp ${dates.length} buổi học` : 'Xếp buổi học'}
      </button>
    </>
  );

  return (
    <Modal title={isEdit ? 'Sửa lịch buổi học' : 'Xếp lịch học'} onClose={onClose} footer={footer} wide>
      <div className="cl-dialog">
        {isEdit ? (
          <p className="cl-dialog-class">Lớp <strong>{session.className}</strong></p>
        ) : (
          <div className="field">
            <label htmlFor="sd-class">Lớp học</label>
            <select id="sd-class" className="input" value={form.classId} onChange={onInput('classId')}>
              <option value="">— Chọn lớp —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {classes.length === 0 && <p className="field-hint">Chưa có lớp nào. Hãy tạo lớp ở mục "Lớp học" trước.</p>}
          </div>
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
                <strong>Buổi này và {followingCount - 1} buổi sau</strong>
                <span className="type-row-desc">các buổi tạo cùng lúc bằng "Lặp lại hằng tuần"</span>
              </span>
            </label>
          </fieldset>
        )}

        <div className="cl-dialog-row">
          <div className="field">
            <label htmlFor="sd-date">{form.repeat ? 'Bắt đầu từ ngày' : 'Ngày học'}</label>
            <input id="sd-date" className="input" type="date" value={form.date} onChange={onInput('date')} disabled={followingScope} />
            {followingScope ? (
              <p className="field-hint">Đổi ngày chỉ làm được khi sửa riêng một buổi.</p>
            ) : (
              form.date && <p className="field-hint">{WEEKDAY_LONG[weekdayOf(form.date)]}</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="sd-start">Giờ bắt đầu</label>
            <input id="sd-start" className="input" type="time" value={form.startTime} onChange={onInput('startTime')} />
          </div>
          <div className="field">
            <label htmlFor="sd-end">Giờ kết thúc</label>
            <input id="sd-end" className="input" type="time" value={form.endTime} onChange={onInput('endTime')} />
            <div className="cl-chips">
              {DURATIONS.map((d) => (
                <button key={d.minutes} type="button" className="cl-chip" onClick={() => set('endTime', addMinutes(form.startTime, d.minutes))}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cl-dialog-row">
          <div className="field">
            <label htmlFor="sd-teacher">Giáo viên dạy <span className="cl-required">(bắt buộc)</span></label>
            <select id="sd-teacher" className="input" value={form.teacher} onChange={onInput('teacher')}>
              <option value="">— Chọn giáo viên —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}{t.role === 'owner' ? ' (Admin chính)' : ''}</option>
              ))}
              {/* Giáo viên đã bị vô hiệu hóa vẫn hiện nếu đang dạy buổi này */}
              {isEdit && !session.teacher.isOther && !teachers.some((t) => t.id === session.teacher.id) && (
                <option value={session.teacher.id} disabled>{session.teacher.name} (đã vô hiệu hóa)</option>
              )}
              <option value="other">Khác (giáo viên không có tài khoản)…</option>
            </select>
          </div>
          {form.teacher === 'other' ? (
            <div className="field">
              <label htmlFor="sd-other">Tên giáo viên</label>
              <input id="sd-other" className="input" value={form.otherName} onChange={onInput('otherName')} placeholder="Ví dụ: Thầy Tom" maxLength={60} />
              <p className="field-hint">Buổi của giáo viên ngoài do admin chính điểm danh.</p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="sd-room">Phòng học (không bắt buộc)</label>
              <input id="sd-room" className="input" value={form.room} onChange={onInput('room')} placeholder="Ví dụ: P.2" maxLength={40} />
            </div>
          )}
        </div>
        {form.teacher === 'other' && (
          <div className="field">
            <label htmlFor="sd-room2">Phòng học (không bắt buộc)</label>
            <input id="sd-room2" className="input" value={form.room} onChange={onInput('room')} placeholder="Ví dụ: P.2" maxLength={40} />
          </div>
        )}

        {!isEdit && (
          <div className={`cl-repeat ${form.repeat ? 'is-on' : ''}`}>
            <label className="checkbox-label cl-repeat-toggle">
              <input type="checkbox" checked={form.repeat} onChange={(e) => set('repeat', e.target.checked)} />
              Lặp lại hằng tuần
            </label>
            {form.repeat && (
              <>
                <p className="cl-repeat-label">Học vào các thứ</p>
                <div className="cl-weekdays">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button key={d} type="button" className={`cl-weekday ${form.weekdays.includes(d) ? 'is-on' : ''}`} aria-pressed={form.weekdays.includes(d)} onClick={() => toggleWeekday(d)}>
                      {WEEKDAY_SHORT[d]}
                    </button>
                  ))}
                </div>
                <div className="cl-dialog-row">
                  <div className="field">
                    <label htmlFor="sd-until">Lặp lại đến ngày</label>
                    <input id="sd-until" className="input" type="date" value={form.until} min={form.date} onChange={onInput('until')} />
                  </div>
                  <div className="field">
                    <span className="cl-label-like">Hoặc chọn nhanh</span>
                    <div className="cl-chips">
                      {REPEAT_LENGTHS.map((r) => (
                        <button key={r.days} type="button" className="cl-chip" onClick={() => set('until', addDays(form.date, r.days))}>{r.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="cl-repeat-preview">
                  {dates.length > 0
                    ? <>Sẽ tạo <strong>{dates.length} buổi</strong>: {form.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')} · {form.startTime}–{form.endTime} · từ {formatDate(dates[0])} đến {formatDate(dates.at(-1))}</>
                    : 'Chưa có buổi nào khớp với các thứ và khoảng ngày đã chọn.'}
                </p>
              </>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="sd-note">Ghi chú cho buổi học (không bắt buộc)</label>
          <input id="sd-note" className="input" value={form.note} onChange={onInput('note')} placeholder="Ví dụ: Kiểm tra giữa kỳ" maxLength={200} />
        </div>

        {conflicts && (
          <div className="cl-conflict" role="alert">
            <p><strong>Lịch bị trùng giờ:</strong></p>
            <ul>
              {conflicts.conflicts.map((c, i) => <li key={i}>{c}</li>)}
              {conflicts.more > 0 && <li>… và {conflicts.more} buổi khác</li>}
            </ul>
            <p>Hãy đổi giờ / giáo viên, hoặc bấm "Vẫn xếp lịch" nếu bạn chắc chắn.</p>
            <button type="button" className="btn btn-danger btn-small" disabled={saving} onClick={() => submit(true)}>Vẫn xếp lịch</button>
          </div>
        )}
        {error && <p className="alert-error admin-message" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
