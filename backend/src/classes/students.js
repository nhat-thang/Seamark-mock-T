// Học sinh của lớp: đọc kèm số buổi đã học, điểm cộng, và trạng thái nhắc học phí.
//
// NHẮC HỌC PHÍ (đã chốt với người dùng): tính theo số buổi học của TỪNG học sinh, không theo số buổi của lớp.
// - Một buổi được tính cho học sinh khi buổi đó đã điểm danh và học sinh có tên trong điểm danh,
//   KỂ CẢ khi vắng (có phép hay không phép).
// - Học sinh vào lớp muộn chỉ có tên trong các buổi từ ngày vào học -> chỉ tính các buổi đó.
//   Ví dụ lớp đã học 3 buổi rồi bạn B mới vào: lớp học tới buổi 10 thì B mới được tính 7 buổi.
// - Cộng thêm "số buổi đã học trước đó" (prior_sessions) nhập tay khi đưa lớp đang học dở lên web.
// - Nhắc mỗi N buổi (classes.fee_every). Mỗi lần bấm "Đã thu học phí" là xong một đợt;
//   đợt tiếp theo nhắc khi học đủ N buổi nữa (mốc 10, 20, 30... dù thu sớm hay muộn).

/** Trạng thái học phí. sessions: số buổi đã tính; paidCycles: số đợt đã thu; every: N buổi / đợt */
function feeInfo({ sessions, paidCycles, every }) {
  if (!every) return { state: 'off', sessions, paidCycles };
  const nextAt = (paidCycles + 1) * every; // mốc nhắc tiếp theo
  // Số buổi đã học trong đợt hiện tại (để hiện thanh tiến độ "7/10")
  const progress = Math.max(0, sessions - paidCycles * every);
  if (sessions >= nextAt) {
    return { state: 'due', sessions, paidCycles, every, nextAt, progress, owed: Math.floor(sessions / every) - paidCycles, remaining: 0 };
  }
  const remaining = nextAt - sessions;
  // Còn 1 buổi nữa là tới hạn: báo trước để giáo viên kịp nhắc phụ huynh
  return { state: remaining === 1 ? 'soon' : 'ok', sessions, paidCycles, every, nextAt, progress, owed: 0, remaining };
}

const STUDENT_SELECT = `
  SELECT st.*,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id) AS attended,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'present') AS n_present,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'late') AS n_late,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'excused') AS n_excused,
         (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.status = 'absent') AS n_absent,
         (SELECT COALESCE(SUM(a.bonus), 0) FROM attendance a WHERE a.student_id = st.id) AS bonus_total,
         (SELECT COALESCE(MAX(p.cycle_no), 0) FROM fee_payments p WHERE p.student_id = st.id) AS paid_cycles,
         (SELECT MAX(p.created_at) FROM fee_payments p WHERE p.student_id = st.id) AS last_paid_at
    FROM class_students st`;

/** Chuyển một dòng (từ STUDENT_SELECT) sang dữ liệu trả về cho trình duyệt */
function toStudent(row, every) {
  const sessions = row.prior_sessions + row.attended;
  return {
    id: row.id,
    classId: row.class_id,
    fullName: row.full_name,
    phone: row.phone,
    note: row.note,
    joinedOn: row.joined_on,
    priorSessions: row.prior_sessions,
    isActive: !row.removed_at,
    removedAt: row.removed_at,
    stats: {
      sessions,
      attended: row.attended,
      present: row.n_present,
      late: row.n_late,
      excused: row.n_excused,
      absent: row.n_absent,
      bonus: row.bonus_total,
    },
    fee: { ...feeInfo({ sessions, paidCycles: row.paid_cycles, every }), lastPaidAt: row.last_paid_at },
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
    .map((r) => toStudent(r, cls.fee_every))
    .sort((a, b) => Number(!a.isActive) - Number(!b.isActive) || byGivenName(a, b));
}

function loadStudent(db, cls, studentId) {
  const row = db.prepare(`${STUDENT_SELECT} WHERE st.class_id = ? AND st.id = ?`).get(cls.id, studentId);
  return row ? toStudent(row, cls.fee_every) : null;
}

/**
 * Danh sách học sinh của MỘT BUỔI HỌC (để điểm danh):
 * - học sinh đã có tên trong điểm danh buổi này (kể cả đã nghỉ học sau đó), và
 * - học sinh vào học từ ngày học trở về trước, chưa nghỉ trước giờ học.
 * Nhờ vậy học sinh vào lớp muộn không bị tính các buổi trước khi vào.
 */
function loadRoster(db, cls, session) {
  return db
    .prepare(
      `${STUDENT_SELECT}
        WHERE st.class_id = ?
          AND (st.id IN (SELECT student_id FROM attendance WHERE session_id = ?)
               OR (st.joined_on <= ? AND (st.removed_at IS NULL OR st.removed_at > ?)))`
    )
    .all(cls.id, session.id, session.date, session.starts_at)
    .map((r) => toStudent(r, cls.fee_every))
    .sort(byGivenName);
}

/**
 * Học sinh đang học có học phí tới hạn / sắp tới hạn, ở mọi lớp chưa xóa.
 * Dùng cho trang chính và chuông thông báo.
 */
function feeReminders(db) {
  const classes = db.prepare('SELECT * FROM classes WHERE deleted_at IS NULL AND fee_every > 0').all();
  const out = [];
  for (const cls of classes) {
    const rows = db.prepare(`${STUDENT_SELECT} WHERE st.class_id = ? AND st.removed_at IS NULL`).all(cls.id);
    for (const r of rows) {
      const s = toStudent(r, cls.fee_every);
      if (s.fee.state === 'due' || s.fee.state === 'soon') {
        out.push({ ...s, className: cls.name, classColor: cls.color });
      }
    }
  }
  // Tới hạn trước, sắp tới hạn sau; trong nhóm thì theo tên lớp, tên học sinh
  const rank = { due: 0, soon: 1 };
  out.sort((a, b) => rank[a.fee.state] - rank[b.fee.state] || viCompare(a.className, b.className) || byGivenName(a, b));
  return out;
}

module.exports = { feeInfo, loadStudents, loadStudent, loadRoster, feeReminders, byGivenName };
