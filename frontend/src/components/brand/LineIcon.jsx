// Biểu tượng nét đơn giản (24×24), màu theo màu chữ. Dùng: <LineIcon name="home" />
const ICONS = {
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5zm16 0h-3v6h2a1 1 0 0 0 1-1v-5z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14.5a7 7 0 0 1 4 6.5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  key: 'M14.5 9.5a4.5 4.5 0 1 0-4.2 4.5L12 15.7V18h2.3v2.3H17V23h4v-4l-6.6-6.6a4.5 4.5 0 0 0 .1-2.9zM8.5 9h.01',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  call: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  home: 'M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5',
  exam: 'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm8 0v4h4M9 12h6M9 16h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3.5 2',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  arrow: 'M5 12h13M13 6l6 6-6 6',
  // Lớp học, thời khóa biểu, điểm danh
  calendar: 'M4 6h16v15H4zM4 10.5h16M8.5 3v5M15.5 3v5M8 14.5h3M8 17.5h6',
  board: 'M3 4h18v12H3zM12 16v5M8 21h8M7 8h10M7 12h6',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4',
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3.5 2',
  money: 'M3 6.5h18v11H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 10v4M17.5 10v4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  play: 'M7 4.5l12.5 7.5L7 19.5z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  up: 'M5 15l7-7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3.5l9.5 17h-19zM12 10v4.5M12 17.5h.01',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  // Chăm sóc khách hàng (bảng tính CSKH)
  chat: 'M4 4.5h16v11.5H10l-6 4.5V4.5zM8 9h8M8 12.5h5',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16',
  copy: 'M9 9h11v11H9zM15 9V4H4v11h5',
  paste: 'M9 3.5h6V7H9zM15 5h4v16H5V5h4M8.5 12h7M8.5 16h5',
  cap: 'M2 9.5 12 4.5l10 5-10 5zM6 11.5v4.5c0 1.6 2.7 3.5 6 3.5s6-1.9 6-3.5v-4.5M22 9.5v5.5',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
  tag: 'M3 12.5V3.5h9l9 9-9 9zM7.5 8h.01',
};

export default function LineIcon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
