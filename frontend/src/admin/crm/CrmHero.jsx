// Khối đầu trang CSKH: biển xanh, đàn cá heo bơi tung tăng (một con thỉnh thoảng nhảy lên khỏi sóng),
// các con số chính và thanh tỉ lệ trạng thái. Bấm vào ô số để lọc nhanh bảng bên dưới.
import { memo, useEffect, useRef, useState } from 'react';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { Bubbles, Dolphin, Sparkle, Waves } from '../../components/brand/SeaArt.jsx';
import { formatMoney } from '../../utils/schedule.js';
import { NO_STATUS, PENDING, WON } from '../../utils/crm.js';

/** Số tiền gọn cho ô số: 1.500.000 -> "1,5 triệu" (số đầy đủ hiện khi đưa chuột vào) */
function shortMoney(n) {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return formatMoney(n);
}

function Stat({ label, value, sub, tone = '', active = false, onClick, title }) {
  const body = (
    <>
      <span className="crm-stat-label">{label}</span>
      <strong className="crm-stat-value">{value}</strong>
      {sub && <span className="crm-stat-sub">{sub}</span>}
    </>
  );
  if (!onClick) return <div className={`crm-stat is-${tone}`} title={title}>{body}</div>;
  return (
    <button type="button" className={`crm-stat is-${tone}${active ? ' is-on' : ''}`} onClick={onClick} aria-pressed={active}>
      {body}
    </button>
  );
}

function CrmHero({ stats, statuses, filter, onStatus, onFollow }) {
  // Cuộn xuống làm việc với bảng (khối này khuất khỏi màn hình): dừng hết hiệu ứng cho máy nhẹ
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  // Thanh tỉ lệ: mỗi trạng thái một đoạn, dài theo số khách
  const parts = [
    ...statuses.map((s) => ({ key: s.name, label: s.name, color: s.color, n: stats.counts.get(s.name) || 0 })),
    { key: NO_STATUS, label: 'Chưa có trạng thái', color: 'none', n: stats.noStatus },
  ].filter((p) => p.n > 0);

  return (
    <section className={`crm-hero${visible ? '' : ' is-paused'}`} ref={ref}>
      <div className="crm-hero-rays" aria-hidden="true" />
      <Bubbles className="crm-hero-bubbles" />
      <div className="crm-swim crm-swim-1" aria-hidden="true"><Dolphin /></div>
      <div className="crm-swim crm-swim-2" aria-hidden="true"><Dolphin /></div>
      <div className="crm-swim crm-swim-3" aria-hidden="true"><Dolphin /></div>
      <div className="crm-leap" aria-hidden="true">
        <Dolphin />
        <span className="crm-leap-splash" />
      </div>
      <Sparkle className="crm-hero-spark crm-hero-spark-1" size={20} />
      <Sparkle className="crm-hero-spark crm-hero-spark-2" size={12} filled />

      <div className="crm-hero-top">
        <div className="crm-hero-text">
          <p className="crm-hero-badge"><LineIcon name="chat" size={16} /> Chăm sóc khách hàng</p>
          <h1>Bảng CSKH</h1>
          <p className="crm-hero-intro">
            Ghi từng khách hàng như trong Excel: bấm vào ô rồi gõ, web tự lưu. Đổi trạng thái sang <b>Đã chốt</b> là có cá heo nhảy lên ăn mừng!
          </p>
        </div>
        <div className="crm-stats">
          <Stat label="Khách hàng" value={stats.total} sub={`+${stats.thisMonth} trong tháng này`} />
          <Stat
            label="Đã chốt"
            value={stats.won}
            sub={`Tỉ lệ chốt ${stats.rate}%`}
            tone="won"
            active={filter.status === WON}
            onClick={() => onStatus(WON)}
          />
          <Stat label="Đang chờ chốt" value={stats.pending} sub="Bấm để lọc" tone="pending" active={filter.status === PENDING} onClick={() => onStatus(PENDING)} />
          <Stat
            label="Cần gọi lại"
            value={stats.due}
            sub={stats.late ? `${stats.late} khách đã quá hẹn` : 'Hẹn hôm nay'}
            tone="call"
            active={filter.followUp}
            onClick={onFollow}
          />
          <Stat label="Học phí đã chốt" value={shortMoney(stats.wonTuition)} sub="Của khách đã chốt" tone="money" title={formatMoney(stats.wonTuition)} />
        </div>
      </div>

      {parts.length > 0 && (
        <div className="crm-pipe" aria-label="Tỉ lệ khách hàng theo trạng thái">
          <div className="crm-pipe-bar">
            {parts.map((p) => (
              <span key={p.key} className={`crm-pipe-seg is-${p.color}`} style={{ flexGrow: p.n }} title={`${p.label}: ${p.n} khách (${Math.round((p.n / stats.total) * 100)}%)`} />
            ))}
          </div>
          <ul className="crm-pipe-legend">
            {parts.map((p) => (
              <li key={p.key}>
                <span className={`crm-pipe-dot is-${p.color}`} aria-hidden="true" />
                {p.label} <strong>{Math.round((p.n / stats.total) * 100)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Waves className="crm-hero-waves" colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.22)', 'rgba(243,248,254,0.95)']} />
    </section>
  );
}

export default memo(CrmHero);
