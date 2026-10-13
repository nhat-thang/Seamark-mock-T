// Hàm dùng chung cho lớp học, thời khóa biểu, điểm danh.
// Ngày dạng "YYYY-MM-DD", giờ "HH:MM", luôn theo giờ Việt Nam (UTC+7) dù máy tính đặt múi giờ nào.
import { useEffect, useState } from 'react';

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** Ngày hôm nay (giờ Việt Nam) */
export const vnToday = (ms = Date.now()) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Giờ:phút (giờ Việt Nam) của một thời điểm ISO */
export const vnTimeOf = (iso) => new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(11, 16);

export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** 1 = Thứ 2 … 7 = Chủ nhật */
export function weekdayOf(date) {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Thứ 2 của tuần chứa ngày `date` */
export const mondayOf = (date) => addDays(date, 1 - weekdayOf(date));

export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export const WEEKDAY_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const WEEKDAY_LONG = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/** "2026-10-13" -> "13/10" */
export const formatDay = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
/** "2026-10-13" -> "13/10/2026" */
export const formatDate = (date) => `${formatDay(date)}/${date.slice(0, 4)}`;
/** "Thứ 2, 13/10/2026" */
export const describeDate = (date) => `${WEEKDAY_LONG[weekdayOf(date)]}, ${formatDate(date)}`;

/** "Hôm nay" / "Ngày mai" / "Hôm qua" / "Thứ 4, 15/10" */
export function relativeDay(date, today = vnToday()) {
  const d = daysBetween(today, date);
  if (d === 0) return 'Hôm nay';
  if (d === 1) return 'Ngày mai';
  if (d === -1) return 'Hôm qua';
  return `${WEEKDAY_LONG[weekdayOf(date)]}, ${formatDay(date)}`;
}

/** Khoảng thời gian dễ đọc: "2 giờ 5 phút", "15 phút", "3 ngày" */
export function durationText(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} giờ ${minutes % 60} phút` : `${hours} giờ`;
  return hours % 24 && hours < 72 ? `${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `${Math.round(hours / 24)} ngày`;
}

/** Cộng phút vào giờ "HH:MM" (không quá 23:59) */
export function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Thời điểm hiện tại, tự cập nhật mỗi `intervalMs` (để đếm ngược, đổi trạng thái buổi học) */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Trạng thái buổi học tại thời điểm `now`:
 * upcoming (chưa tới giờ) | ready (bấm Bắt đầu được, trước giờ học ≤ 30 phút) | live (đang trong giờ học)
 * | missed (đã hết giờ mà chưa điểm danh) | done (đã điểm danh)
 */
export function sessionState(s, now = Date.now()) {
  if (s.attendanceAt) return 'done';
  if (now < Date.parse(s.startFrom)) return 'upcoming';
  if (now < Date.parse(s.startsAt)) return 'ready';
  if (now < Date.parse(s.endsAt)) return 'live';
  return 'missed';
}

export const STATE_LABELS = {
  upcoming: 'Sắp tới',
  ready: 'Bắt đầu được',
  live: 'Đang học',
  missed: 'Chưa điểm danh',
  done: 'Đã điểm danh',
};

// Màu của lớp trên thời khóa biểu (khóa lưu trong database -> màu hiển thị)
export const CLASS_COLORS = {
  blue: { main: '#2f6fe0', soft: '#e6efff', label: 'Xanh dương' },
  sky: { main: '#1f9bd4', soft: '#e2f4fc', label: 'Xanh trời' },
  teal: { main: '#12998f', soft: '#dff5f2', label: 'Xanh ngọc' },
  green: { main: '#3a9d4f', soft: '#e5f5e8', label: 'Xanh lá' },
  yellow: { main: '#d69a00', soft: '#fff5d6', label: 'Vàng' },
  orange: { main: '#ec6a35', soft: '#ffece3', label: 'Cam' },
  pink: { main: '#d94585', soft: '#fde8f1', label: 'Hồng' },
  purple: { main: '#8358e8', soft: '#efe9ff', label: 'Tím' },
};
export const colorOf = (key) => CLASS_COLORS[key] || CLASS_COLORS.blue;

/** Biến CSS màu lớp, gắn vào style của một khối: style={classStyle('teal')} */
export const classStyle = (key) => ({ '--cls': colorOf(key).main, '--cls-soft': colorOf(key).soft });

// Trạng thái điểm danh (thứ tự hiện trên nút)
export const ATTENDANCE = [
  { key: 'present', label: 'Có mặt' },
  { key: 'late', label: 'Đi muộn' },
  { key: 'excused', label: 'Vắng có phép' },
  { key: 'absent', label: 'Vắng không phép' },
];
export const ATTENDANCE_LABELS = Object.fromEntries(ATTENDANCE.map((a) => [a.key, a.label]));

/** Nhãn học phí ngắn gọn cho một học sinh: { tone: 'due' | 'soon' | 'ok', text } hoặc null */
export function feeBadge(fee) {
  if (!fee || fee.state === 'off') return null;
  if (fee.state === 'due') {
    return { tone: 'due', text: fee.owed > 1 ? `Đến hạn học phí (${fee.owed} đợt)` : 'Đến hạn học phí' };
  }
  if (fee.state === 'soon') return { tone: 'soon', text: 'Còn 1 buổi tới hạn' };
  return { tone: 'ok', text: `Còn ${fee.remaining} buổi tới hạn` };
}
