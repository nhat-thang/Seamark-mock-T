// Học sinh của lớp: đọc kèm thống kê điểm danh, và lọc thông tin theo vai trò.
// Học phí (chu kỳ, cảnh báo, số tiền) tính ở utils/tuition.js, ghép dữ liệu ở classes/tuitionData.js.

const STUDENT_SELECT = `
  SELECT st.*,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id) AS attended,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'present') AS n_present,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'late') AS n_late,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'excused') AS n_excused,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'absent') AS n_absent,
         (SELECT COALESCE(SUM(a.bonus), 0) FROM attendance a WHERE a.student_id = st.id) AS bonus_total
    FROM class_students st`;

/** Một dòng database -> học sinh (ĐỦ thông tin; gửi cho trình duyệt phải qua studentView) */
function toStudent(row) {
  return {
    id: row.id,
    classId: row.class_id,
    fullName: row.full_name,
    parentName: row.parent_name,
    parentPhone: row.phone, // cột phone cũ = SĐT phụ huynh
    parentIdNumber: row.parent_id_number,
    note: row.note,
    startAt: row.start_at,
    joinedOn: row.joined_on,
    discountPercent: row.discount_percent,
    discountNote: row.discount_note,
    isActive: !row.removed_at,
    removedAt: row.removed_at,
    stats: {
      attended: row.attended,
      present: row.n_present,
      late: row.n_late,
      excused: row.n_excused,
      absent: row.n_absent,
      bonus: row.bonus_total,
    },
  };
}

// Xếp theo TÊN như sổ điểm danh ở Việt Nam: "Nguyễn Văn An" xếp theo "An", trùng tên thì theo họ tên đầy đủ
const givenName = (s) => s.fullName.trim().split(/\s+/).at(-1);
const viCompare = (a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' });
const byGivenName = (a, b) => viCompare(givenName(a), givenName(b)) || viCompare(a.fullName, b.fullName) || a.id - b.id;

/** Mọi học sinh của một lớp (đang học trước, theo tên) */
function loadStudents(db, cls) {
  return db
    .prepare(`${STUDENT_SELECT} WHERE st.class_id = ?`)
    .all(cls.id)
    .map(toStudent)
    .sort((a, b) => Number(!a.isActive) - Number(!b.isActive) || byGivenName(a, b));
}

function loadStudent(db, cls, studentId) {
  const row = db.prepare(`${STUDENT_SELECT} WHERE st.class_id = ? AND st.id = ?`).get(cls.id, studentId);
  return row ? toStudent(row) : null;
}

/**
 * Danh sách học sinh của MỘT BUỔI HỌC (để điểm danh):
 * - học sinh đã có tên trong điểm danh buổi này (kể cả đã nghỉ học sau đó), và
 * - học sinh có buổi bắt đầu học từ buổi này trở về trước, chưa nghỉ trước giờ học.
 */
function loadRoster(db, cls, session) {
  return db
    .prepare(
      `${STUDENT_SELECT}
        WHERE st.class_id = ?
          AND (st.id IN (SELECT student_id FROM attendance WHERE session_id = ?)
               OR ((st.start_at IS NULL OR st.start_at <= ?) AND (st.removed_at IS NULL OR st.removed_at > ?)))`
    )
    .all(cls.id, session.id, session.starts_at, session.starts_at)
    .map(toStudent)
    .sort(byGivenName);
}

/** Owner: học sinh còn thiếu thông tin bắt buộc (nhập từ Excel thiếu cột...) */
const missingInfo = (s) => !s.parentName || !s.parentPhone || !s.parentIdNumber;

/**
 * Dữ liệu học sinh gửi cho trình duyệt THEO VAI TRÒ — lọc ngay ở server (đã chốt):
 * admin (giáo viên) chỉ nhận họ tên, thống kê điểm danh, số buổi đã học, nhãn Đã thu / Chưa đóng, mức cảnh báo.
 * KHÔNG có tên phụ huynh, SĐT, CCCD, ghi chú (có thể chứa thông tin cá nhân từ Excel), số tiền, giảm giá.
 * tuition: kết quả tuitionOf() (classes/tuitionData.js) hoặc undefined.
 */
function studentView(s, isOwner, tuition) {
  const t = tuition
    ? {
        sessionsDone: tuition.sessionsDone,
        startNo: tuition.startNo,
        startDate: tuition.startDate,
        labels: tuition.labels,
        alert: tuition.alert ? { level: tuition.alert.level, cycleNo: tuition.alert.cycleNo, remaining: tuition.alert.remaining, kind: tuition.alert.kind } : null,
      }
    : undefined;
  if (!isOwner) {
    return { id: s.id, classId: s.classId, fullName: s.fullName, isActive: s.isActive, stats: s.stats, tuition: t };
  }
  return {
    ...s,
    missingInfo: missingInfo(s),
    tuition: t && {
      ...t,
      alert: t.alert && { ...t.alert, amount: tuition.alertAmount, snoozed: false },
      snoozedCycles: tuition.snoozedCycles,
      cycles: tuition.cycles.map((cy) => ({
        cycleNo: cy.cycleNo,
        firstNo: cy.firstNo,
        lastNo: cy.lastNo,
        sessionCount: cy.sessionCount,
        amount: cy.amount,
        dueDate: cy.dueDate,
        mismatch: cy.mismatch,
        snoozed: tuition.snoozedCycles.includes(cy.cycleNo),
        payment: cy.payment && {
          amount: cy.payment.amount, paidOn: cy.payment.paidOn, method: cy.payment.method, note: cy.payment.note, by: cy.payment.by,
        },
      })),
    },
  };
}

module.exports = { STUDENT_SELECT, loadStudents, loadStudent, loadRoster, studentView, missingInfo, byGivenName };
