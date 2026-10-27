// Cảnh báo học phí cho trang chính + file Excel cảnh báo.
// Lọc theo vai trò NGAY Ở SERVER (đã chốt): giáo viên (admin) chỉ thấy lớp mình phụ trách, KHÔNG có số tiền,
// không có nhắc xếp lịch / cài học phí (việc của owner).
const { loadStudents } = require('./students');
const { classTuition } = require('./tuitionData');
const { scheduleGap } = require('../utils/tuition');

const LEVEL_RANK = { red: 0, orange: 1, yellow: 2 };
const LEVEL_LABELS = { red: 'Đỏ', orange: 'Cam', yellow: 'Vàng' };

/** "Còn 3 buổi đến hạn đóng" / "Hôm nay là hạn đóng" / "Đã tới hạn, chưa đóng" — luôn có chữ đi kèm màu */
function alertText(a) {
  if (a.kind === 'due_today') return 'Hôm nay là hạn đóng';
  if (a.kind === 'overdue') return 'Đã tới hạn, chưa đóng';
  return `Còn ${a.remaining} buổi đến hạn đóng`;
}

/**
 * Mọi cảnh báo học phí đang bật trong các lớp người này được xem.
 * Trả { items: [{ classId, className, classColor, studentId, fullName, level, kind, remaining, cycleNo, dueDate, text, amount? }],
 *       gaps?: [{ classId, className, cycleNo, scheduled, needed }], unconfigured?: [{ classId, className, students }] }
 */
function collectAlerts(db, access, now = Date.now()) {
  const classes = db
    .prepare('SELECT * FROM classes WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE')
    .all()
    .filter((c) => access.canSeeClass(c.id));
  const items = [];
  const gaps = [];
  const unconfigured = [];
  for (const cls of classes) {
    const students = loadStudents(db, cls).filter((s) => s.isActive);
    if (students.length === 0) continue;
    const { tl, map } = classTuition(db, cls, students, now);
    if (!tl.configured) {
      unconfigured.push({ classId: cls.id, className: cls.name, students: students.length });
      continue;
    }
    const gap = scheduleGap(tl);
    // Lớp đã khóa (kết thúc) thì không nhắc xếp lịch nữa
    if (gap && !cls.closed_at) gaps.push({ classId: cls.id, className: cls.name, ...gap });
    for (const s of students) {
      const t = map.get(s.id);
      if (!t.alert) continue;
      const cycle = t.cycles.find((cy) => cy.cycleNo === t.alert.cycleNo);
      const item = {
        classId: cls.id,
        className: cls.name,
        classColor: cls.color,
        studentId: s.id,
        fullName: s.fullName,
        level: t.alert.level,
        kind: t.alert.kind,
        remaining: t.alert.remaining,
        cycleNo: t.alert.cycleNo,
        dueDate: cycle?.dueDate ?? null,
        text: alertText(t.alert),
      };
      if (access.isOwner) item.amount = t.alertAmount;
      items.push(item);
    }
  }
  items.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.remaining - b.remaining ||
      a.className.localeCompare(b.className, 'vi') ||
      a.fullName.localeCompare(b.fullName, 'vi')
  );
  return access.isOwner ? { items, gaps, unconfigured } : { items };
}

module.exports = { collectAlerts, alertText, LEVEL_LABELS, LEVEL_RANK };
