import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../utils/api.js';
import { classStyle, durationText, relativeDay, sessionState, useNow } from '../../utils/schedule.js';
import { formatDateTime } from '../../utils/format.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import './classes.css';

const supportsNotification = typeof window !== 'undefined' && 'Notification' in window;

/**
 * Hiện thông báo của trình duyệt (góc màn hình) một lần cho mỗi mốc.
 * Ghi nhớ đã báo trên máy này để không báo lặp lại khi tải lại trang.
 */
function notifyOnce(key, title, body, onClick) {
  try {
    const store = `tb-${key}`;
    if (localStorage.getItem(store)) return;
    localStorage.setItem(store, '1');
    const n = new Notification(title, { body, tag: key, icon: '/images/logo-seamark.png' });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    // Một số trình duyệt (điện thoại) không cho tạo thông báo kiểu này: bỏ qua, vẫn còn chuông trên web
  }
}

/**
 * Chuông thông báo: buổi dạy trong 24 giờ tới, buổi chưa điểm danh, thông báo xếp / đổi lịch.
 * Hỏi máy chủ mỗi phút. Nếu giáo viên bật "thông báo trên máy này" thì nhắc 60 phút trước giờ dạy
 * và lúc bấm "Bắt đầu" được (30 phút trước) — chỉ khi trang web đang mở.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 80, right: 16 });
  const [permission, setPermission] = useState(supportsNotification ? Notification.permission : 'unsupported');
  const ref = useRef(null);
  const now = useNow(30000);

  const load = useCallback(() => {
    apiGet('/admin/notifications').then(setData).catch(() => {});
  }, []);

  // Tải lại mỗi phút, khi quay lại tab, và khi chuyển trang (ví dụ vừa lưu điểm danh xong)
  useEffect(() => {
    const t = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', load);
    };
  }, [load]);
  useEffect(load, [pathname, load]);

  // Đóng khi bấm ra ngoài / phím Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Thông báo trình duyệt trước giờ dạy
  useEffect(() => {
    if (!data || permission !== 'granted') return;
    for (const s of data.upcoming) {
      const startsAt = Date.parse(s.startsAt);
      const startFrom = Date.parse(s.startFrom);
      const go = () => navigate(`/admin/buoi-hoc/${s.id}`);
      if (now >= startsAt - 60 * 60000 && now < startFrom) {
        notifyOnce(`truoc-${s.id}`, 'Sắp tới giờ dạy', `${s.className} lúc ${s.startTime} (còn ${durationText(startsAt - now)})`, go);
      } else if (now >= startFrom && now < Date.parse(s.endsAt)) {
        notifyOnce(`bat-dau-${s.id}`, 'Đã có thể bắt đầu buổi học', `${s.className} ${s.startTime}–${s.endTime}. Bấm để mở điểm danh.`, go);
      }
    }
  }, [data, now, permission, navigate]);

  async function toggle() {
    const next = !open;
    // Bảng thông báo đặt cố định trên màn hình, ngay dưới nút chuông
    // (thanh trên cùng cắt mọi thứ tràn ra ngoài nó nên không đặt bên trong được)
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.bottom + 10, right: Math.max(16, window.innerWidth - r.right), maxHeight: `calc(100vh - ${Math.round(r.bottom) + 26}px)` });
    setOpen(next);
    if (next && data?.unread) {
      try {
        await apiPost('/admin/notifications/read');
        setData((d) => ({ ...d, unread: 0 }));
      } catch {
        // Lần sau mở lại sẽ đánh dấu
      }
    }
  }

  async function askPermission() {
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission('denied');
    }
  }

  function go(link) {
    setOpen(false);
    if (link) navigate(link);
  }

  const upcoming = data?.upcoming ?? [];
  const pending = data?.pending ?? [];
  const items = data?.items ?? [];
  const count = upcoming.length + pending.length + (data?.unread ?? 0);
  const urgent = upcoming.some((s) => ['ready', 'live'].includes(sessionState(s, now))) || pending.length > 0;

  return (
    <div className="nb-wrap" ref={ref}>
      <button
        type="button"
        className={`nb-btn ${urgent ? 'is-urgent' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={count ? `Thông báo (${count} mục mới)` : 'Thông báo'}
      >
        <LineIcon name="bell" size={22} />
        {count > 0 && <span className="nb-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Thông báo" style={pos}>
          <section>
            <h3>Buổi dạy trong 24 giờ tới</h3>
            {upcoming.length === 0 && <p className="nb-empty">Không có buổi dạy nào.</p>}
            {upcoming.map((s) => {
              const state = sessionState(s, now);
              const can = state === 'ready' || state === 'live';
              return (
                <button key={s.id} type="button" className={`nb-item nb-session ${can ? 'is-ready' : ''}`} style={classStyle(s.classColor)} onClick={() => go(`/admin/buoi-hoc/${s.id}`)}>
                  <span className="nb-dot" aria-hidden="true" />
                  <span className="nb-text">
                    <strong>{s.className}</strong>
                    <span>{relativeDay(s.date)} · {s.startTime}–{s.endTime}{s.room && ` · ${s.room}`}</span>
                  </span>
                  <span className="nb-when">{can ? 'Bắt đầu được' : `còn ${durationText(Date.parse(s.startsAt) - now)}`}</span>
                </button>
              );
            })}
          </section>

          {pending.length > 0 && (
            <section className="is-warn">
              <h3>Chưa điểm danh</h3>
              {pending.map((s) => (
                <button key={s.id} type="button" className="nb-item nb-session" style={classStyle(s.classColor)} onClick={() => go(`/admin/buoi-hoc/${s.id}`)}>
                  <span className="nb-dot" aria-hidden="true" />
                  <span className="nb-text">
                    <strong>{s.className}</strong>
                    <span>{relativeDay(s.date)} · {s.startTime}–{s.endTime}{s.teacher.isOther && ` · ${s.teacher.name}`}</span>
                  </span>
                  <span className="nb-when is-warn">Điểm danh</span>
                </button>
              ))}
            </section>
          )}

          <section>
            <h3>Thông báo</h3>
            {items.length === 0 && <p className="nb-empty">Chưa có thông báo nào.</p>}
            {items.map((n) => (
              <button key={n.id} type="button" className={`nb-item nb-note ${n.read ? '' : 'is-unread'}`} onClick={() => go(n.link)} disabled={!n.link}>
                <span className="nb-text">
                  <span>{n.text}</span>
                  <span className="nb-time">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </section>

          {permission === 'default' && (
            <div className="nb-foot">
              <button type="button" className="btn btn-primary btn-small" onClick={askPermission}>
                <LineIcon name="bell" size={18} /> Bật thông báo trên máy này
              </button>
              <p>Máy tính / điện thoại sẽ báo trước giờ dạy 1 tiếng và lúc bấm "Bắt đầu" được (khi trang web đang mở).</p>
            </div>
          )}
          {permission === 'denied' && (
            <div className="nb-foot">
              <p>Trình duyệt đang chặn thông báo của web này. Bạn vẫn xem được nhắc nhở ở chuông này.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
