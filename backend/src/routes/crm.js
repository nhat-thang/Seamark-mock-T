// API CHĂM SÓC KHÁCH HÀNG (CSKH) — CHỈ admin chính (requireOwner gắn ở app.js; giáo viên gọi vào bị 403).
// Giao diện là một bảng tính kiểu Excel (frontend/src/admin/crm/): sửa ô nào gửi đúng ô đó.
// Trình duyệt đã đổi chữ người dùng gõ sang dạng chuẩn: ngày "YYYY-MM-DD", học phí là số nguyên (utils/crm.js);
// server kiểm tra lại, chuẩn hóa SĐT / CCCD và trạng thái.
//
//   GET  /api/admin/crm                       mọi khách hàng + trạng thái tự thêm + tên nhân viên đã dùng + SĐT đã là phụ huynh học sinh
//   POST /api/admin/crm                       thêm khách hàng: { rows: [{ studentName, parentName, phone, ... }] } (dán từ Excel: nhiều dòng)
//   POST /api/admin/crm/cells                 sửa nhiều ô: { changes: [{ id, field, value }] } — ô sai bị bỏ qua, trả về trong `errors`
//   POST /api/admin/crm/delete                xóa (mềm) nhiều dòng: { ids }
//   POST /api/admin/crm/restore               khôi phục các dòng đã xóa: { ids }
//   GET  /api/admin/crm/deleted               các khách hàng đã xóa (để khôi phục)
//   GET  /api/admin/crm/export                tải bảng CSKH về Excel (+ trang thống kê)
//   GET  /api/admin/crm/:id/history           lịch sử thay đổi của một khách hàng
//   POST /api/admin/crm/:id/enroll            gắn với học sinh vừa thêm vào lớp: { classStudentId } -> trạng thái thành "Đã chốt"
//   POST /api/admin/crm/statuses              thêm trạng thái tự đặt: { name, color? }
//   POST /api/admin/crm/statuses/:id/update   đổi tên / màu (các dòng đang dùng trạng thái đó đổi theo)
//   POST /api/admin/crm/statuses/:id/delete   xóa trạng thái tự đặt (chỉ khi không còn khách hàng nào dùng)
const express = require('express');
const ExcelJS = require('exceljs');
const { requireJson } = require('../auth/middleware');
const { logAudit } = require('../audit');
const { foldText } = require('../db');
const { vnDate, isValidDate, formatDate } = require('../classes/time');
const { cleanPhone, cleanIdNumber } = require('../utils/contactInfo');
const { styleHeader, fillRow, sendWorkbook, excelDate, MONEY_FMT } = require('../utils/excel');

// 3 trạng thái cố định (đã chốt với người dùng). Đổi ở đây thì đổi cả frontend/src/utils/crm.js
const WON = 'Đã chốt';
const PENDING = 'Đang chờ chốt';
const FAIL = 'Fail';
const FIXED_STATUSES = [WON, PENDING, FAIL];
// Cách viết khác hay gặp khi gõ / dán từ Excel (đã bỏ dấu, chữ thường) -> trạng thái cố định
const STATUS_ALIASES = { chot: WON, 'da chot': WON, 'cho chot': PENDING, 'dang cho': PENDING, 'that bai': FAIL, failed: FAIL };
// Màu nhãn cho trạng thái tự thêm (lần lượt) — tên màu khớp với crm.css
const STATUS_COLORS = ['blue', 'purple', 'teal', 'pink', 'orange', 'sky', 'gray'];
const STATUS_ARGB = {
  [WON]: 'FFD9F2E3', [PENDING]: 'FFFDF0D5', [FAIL]: 'FFFADBD8',
  blue: 'FFDCE8FB', purple: 'FFEADFF7', teal: 'FFD5F1EE', pink: 'FFFBDDEB', orange: 'FFFDE3D3', sky: 'FFDDF0FA', gray: 'FFE9EDF2',
};

// Các cột của bảng: tên gửi qua API -> cột trong database
const FIELDS = {
  studentName: { col: 'student_name', label: 'Học sinh', type: 'text', max: 80 },
  parentName: { col: 'parent_name', label: 'Phụ huynh', type: 'text', max: 80 },
  phone: { col: 'phone', label: 'SĐT', type: 'phone' },
  idNumber: { col: 'id_number', label: 'CCCD', type: 'idNumber' },
  contactDate: { col: 'contact_date', label: 'Ngày CSKH', type: 'date' },
  staff: { col: 'staff', label: 'Nhân viên CSKH', type: 'text', max: 60 },
  status: { col: 'status', label: 'Trạng thái', type: 'status' },
  tuition: { col: 'tuition', label: 'Học phí', type: 'money' },
  followUp: { col: 'follow_up', label: 'Hẹn gọi lại', type: 'date' },
  note: { col: 'note', label: 'Ghi chú', type: 'note' },
};

const MAX_ROWS = 2000; // thêm (dán) tối đa 2000 khách hàng / lần
const MAX_CHANGES = 5000; // sửa tối đa 5000 ô / lần
const MONEY_MAX = 1000000000;
const AUDIT_MERGE_MS = 10 * 60 * 1000; // sửa liên tiếp một khách hàng: mỗi 10 phút ghi 1 dòng lịch sử chỉnh sửa

const nowIso = () => new Date().toISOString();
const toInt = (v) => Number.parseInt(v, 10);
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const foldKey = (s) => foldText(s).replace(/\s+/g, ' ').trim();
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

/** Ghi chú: giữ xuống dòng (tối đa 30 dòng, 1000 ký tự), bỏ khoảng trắng thừa trong từng dòng */
function cleanNote(v) {
  const lines = String(v ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n').slice(0, 30).join('\n').slice(0, 1000);
}

/**
 * Ô SĐT: một hoặc nhiều số ("0901234567 / 0912345678"). Đọc được hết thì chuẩn hóa từng số;
 * có phần không phải SĐT thì giữ nguyên chữ đã gõ (giao diện hiện cảnh báo) — không làm mất dữ liệu.
 */
function cleanPhones(v) {
  const text = cleanText(v, 60);
  if (!text) return '';
  const parts = [];
  for (const part of text.split(/\s*[/,;|]\s*|\s+-\s+/).filter(Boolean)) {
    const digits = part.replace(/[\s.()-]/g, '');
    // Hai số di động viết liền, chỉ cách nhau dấu cách: "0901234567 0912345678"
    if (/^0\d{9}0\d{9}$/.test(digits)) parts.push(digits.slice(0, 10), digits.slice(10));
    else parts.push(part);
  }
  const out = parts.map(cleanPhone);
  return out.every(Boolean) ? out.join(' / ') : text;
}

/** CCCD: đọc được thì chuẩn hóa (thêm lại số 0 Excel làm mất), không thì giữ chữ đã gõ (giao diện cảnh báo) */
function cleanId(v) {
  const text = cleanText(v, 20);
  return cleanIdNumber(text) || text;
}

/** Kiểm tra + chuẩn hóa giá trị một ô (trừ trạng thái). Trả { value } hoặc { error }. */
function cleanValue(f, v) {
  switch (f.type) {
    case 'text':
      return { value: cleanText(v, f.max) };
    case 'note':
      return { value: cleanNote(v) };
    case 'phone':
      return { value: cleanPhones(v) };
    case 'idNumber':
      return { value: cleanId(v) };
    case 'date': {
      if (v === null || v === undefined || v === '') return { value: null };
      const s = String(v);
      if (!isValidDate(s) || s < '1990-01-01' || s > '2100-12-31') return { error: 'Ngày không đúng (ví dụ 13/10/2026).' };
      return { value: s };
    }
    case 'money': {
      if (v === null || v === undefined || v === '') return { value: null };
      const n = typeof v === 'number' ? v : /^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > MONEY_MAX) return { error: 'Học phí phải là số tiền (VNĐ), ví dụ 1.500.000.' };
      return { value: n };
    }
    default:
      return { error: 'Cột không hợp lệ.' };
  }
}

/** Danh sách id (số nguyên dương, không trùng) gửi lên */
const readIds = (v) => [...new Set((Array.isArray(v) ? v : []).map(toInt).filter((n) => Number.isInteger(n) && n > 0))];

/** Giá trị dễ đọc trong "Lịch sử chỉnh sửa" */
function showValue(field, v) {
  if (v === null || v === undefined || v === '') return '(trống)';
  const type = FIELDS[field]?.type;
  if (type === 'date') return formatDate(v);
  if (type === 'money') return money(v);
  const s = String(v).replace(/\n/g, ' ');
  return `"${s.length > 60 ? `${s.slice(0, 57)}…` : s}"`;
}
const whoOf = (row) => `"${row.student_name || row.parent_name || row.phone || `khách hàng #${row.id}`}"`;
const listNames = (rows) => {
  const names = rows.map((r) => r.student_name || r.parent_name || r.phone || `#${r.id}`);
  return names.length > 10 ? `${names.slice(0, 10).join(', ')} và ${names.length - 10} khách hàng khác` : names.join(', ');
};

// Dòng khách hàng kèm lớp đã vào (nếu có)
const SELECT = `SELECT c.*, cs.class_id AS cs_class_id, cs.full_name AS cs_full_name, cs.removed_at AS cs_removed_at,
                       cl.name AS class_name, cl.deleted_at AS class_deleted_at
                  FROM crm_contacts c
                  LEFT JOIN class_students cs ON cs.id = c.class_student_id
                  LEFT JOIN classes cl ON cl.id = cs.class_id`;

function toView(r) {
  return {
    id: r.id,
    studentName: r.student_name,
    parentName: r.parent_name,
    phone: r.phone,
    idNumber: r.id_number,
    contactDate: r.contact_date,
    staff: r.staff,
    status: r.status,
    tuition: r.tuition,
    followUp: r.follow_up,
    note: r.note,
    enrolled: r.class_student_id
      ? {
          studentId: r.class_student_id,
          studentName: r.cs_full_name,
          classId: r.cs_class_id,
          className: r.class_name,
          // Học sinh đã nghỉ / lớp đã xóa
          inactive: Boolean(r.cs_removed_at || r.class_deleted_at),
        }
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function crmRouter(db) {
  const router = express.Router();
  router.use(requireJson);
  // Lần ghi "Lịch sử chỉnh sửa" gần nhất cho (admin, khách hàng): gộp các lần sửa liên tiếp
  const lastAudit = new Map();

  const loadRows = (ids, deleted = false) =>
    db.prepare(`SELECT * FROM crm_contacts WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS ${deleted ? 'NOT ' : ''}NULL`).all(JSON.stringify(ids));
  /** Dòng gửi cho trình duyệt, đúng thứ tự ids */
  function loadViews(ids) {
    const map = new Map(db.prepare(`${SELECT} WHERE c.id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids)).map((r) => [r.id, r]));
    return ids.filter((id) => map.has(id)).map((id) => toView(map.get(id)));
  }
  const customStatuses = () =>
    db.prepare(
      `SELECT s.id, s.name, s.color,
              (SELECT COUNT(*) FROM crm_contacts c WHERE c.status = s.name AND c.deleted_at IS NULL) AS count
         FROM crm_statuses s ORDER BY s.id`
    ).all();
  const insertChange = (contactId, field, oldValue, newValue, adminId, at) =>
    db.prepare('INSERT INTO crm_changes (contact_id, field, old_value, new_value, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      contactId, field, oldValue === null || oldValue === undefined ? null : String(oldValue),
      newValue === null || newValue === undefined ? null : String(newValue), adminId, at
    );
  const audit = (req, action, detail, classId = null) => logAudit(db, { adminId: req.admin.id, action, classId, detail });

  /** Tên các trạng thái đã có (bỏ dấu, chữ thường) -> tên chuẩn */
  function statusKeys(exceptId = 0) {
    const keys = new Map();
    for (const n of FIXED_STATUSES) keys.set(foldKey(n), n);
    for (const [k, n] of Object.entries(STATUS_ALIASES)) keys.set(k, n);
    for (const s of db.prepare('SELECT id, name FROM crm_statuses WHERE id <> ?').all(exceptId)) keys.set(foldKey(s.name), s.name);
    return keys;
  }

  /**
   * Đọc chữ trong ô trạng thái -> tên trạng thái chuẩn. Gõ trạng thái chưa có thì tự thêm vào danh sách
   * (đã chốt: "chọn trạng thái khác để tự ghi và thêm vào"). Gọi bên trong transaction.
   */
  function statusResolver(adminId) {
    const keys = statusKeys();
    const created = [];
    let count = db.prepare('SELECT COUNT(*) AS n FROM crm_statuses').get().n;
    return {
      created,
      resolve(raw) {
        const name = cleanText(raw, 30);
        if (!name) return { value: '' };
        const hit = keys.get(foldKey(name));
        if (hit) return { value: hit };
        const color = STATUS_COLORS[count % STATUS_COLORS.length];
        db.prepare('INSERT INTO crm_statuses (name, color, created_by, created_at) VALUES (?, ?, ?, ?)').run(name, color, adminId, nowIso());
        count += 1;
        keys.set(foldKey(name), name);
        created.push(name);
        return { value: name };
      },
    };
  }

  // ----- Bảng khách hàng -----

  router.get('/', (req, res) => {
    const contacts = db.prepare(`${SELECT} WHERE c.deleted_at IS NULL ORDER BY c.id`).all().map(toView);
    // Tên nhân viên CSKH đã dùng (gợi ý khi gõ), dùng gần đây nhất lên trước
    const staffNames = db
      .prepare(`SELECT staff FROM crm_contacts WHERE deleted_at IS NULL AND staff <> '' GROUP BY staff ORDER BY MAX(updated_at) DESC LIMIT 50`)
      .all()
      .map((r) => r.staff);
    // SĐT đã là phụ huynh của học sinh đang học -> giao diện báo "đã là phụ huynh của …" (tránh gọi nhầm khách cũ)
    const knownPhones = {};
    for (const s of db
      .prepare(
        `SELECT cs.id, cs.phone, cs.full_name, c.name AS class_name FROM class_students cs JOIN classes c ON c.id = cs.class_id
          WHERE cs.removed_at IS NULL AND c.deleted_at IS NULL AND cs.phone <> ''`
      )
      .all()) {
      (knownPhones[s.phone] ||= []).push({ studentId: s.id, studentName: s.full_name, className: s.class_name });
    }
    res.json({ today: vnDate(), contacts, statuses: customStatuses(), staffNames, knownPhones });
  });

  // Thêm khách hàng: { rows: [{ studentName?, parentName?, phone?, idNumber?, contactDate?, staff?, status?, tuition?, followUp?, note? }] }
  // Một dòng trống cũng thêm được (nút "Thêm khách hàng": trình duyệt gửi sẵn ngày hôm nay).
  router.post('/', (req, res) => {
    const list = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (list.length === 0) return res.status(400).json({ error: 'Chưa có khách hàng nào để thêm.' });
    if (list.length > MAX_ROWS) return res.status(400).json({ error: `Mỗi lần thêm tối đa ${MAX_ROWS} khách hàng.` });
    const values = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i] && typeof list[i] === 'object' ? list[i] : {};
      const v = {};
      for (const [key, f] of Object.entries(FIELDS)) {
        if (f.type === 'status') continue;
        const r = cleanValue(f, item[key]);
        if (r.error) return res.status(400).json({ error: `${list.length > 1 ? `Dòng ${i + 1} — ` : ''}${f.label}: ${r.error}` });
        v[key] = r.value;
      }
      v.statusRaw = item.status;
      values.push(v);
    }
    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO crm_contacts (student_name, parent_name, phone, id_number, contact_date, staff, status, tuition, follow_up, note,
                                 created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let created = [];
    const ids = db.transaction(() => {
      const resolver = statusResolver(req.admin.id);
      const out = values.map((v) => {
        const status = resolver.resolve(v.statusRaw).value;
        const id = insert.run(v.studentName, v.parentName, v.phone, v.idNumber, v.contactDate, v.staff, status, v.tuition, v.followUp, v.note,
          req.admin.id, now, req.admin.id, now).lastInsertRowid;
        insertChange(id, 'create', null, v.studentName || v.parentName || v.phone, req.admin.id, now);
        return Number(id);
      });
      created = resolver.created;
      return out;
    })();
    const rows = loadRows(ids);
    const extra = created.length ? `. Thêm trạng thái mới: ${created.map((n) => `"${n}"`).join(', ')}` : '';
    audit(req, 'crm_add', ids.length === 1 && !rows[0].student_name && !rows[0].parent_name
      ? `Thêm một dòng mới vào bảng CSKH${extra}`
      : `Thêm ${ids.length} khách hàng vào bảng CSKH: ${listNames(rows)}${extra}`);
    res.status(201).json({ contacts: loadViews(ids), statuses: customStatuses(), newStatuses: created });
  });

  // Sửa ô: { changes: [{ id, field, value }] }. Ô nào sai thì bỏ qua ô đó (trả trong errors), các ô khác vẫn lưu.
  router.post('/cells', (req, res) => {
    const list = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (list.length === 0) return res.status(400).json({ error: 'Chưa có ô nào để lưu.' });
    if (list.length > MAX_CHANGES) return res.status(400).json({ error: `Mỗi lần sửa tối đa ${MAX_CHANGES} ô.` });
    const rows = new Map(loadRows(readIds(list.map((c) => c?.id))).map((r) => [r.id, r]));
    const errors = [];
    const applied = []; // { row, field, old, value }
    let created = [];
    const now = nowIso();
    db.transaction(() => {
      const resolver = statusResolver(req.admin.id);
      for (const ch of list) {
        const id = toInt(ch?.id);
        const field = String(ch?.field ?? '');
        const f = Object.hasOwn(FIELDS, field) ? FIELDS[field] : null;
        const row = rows.get(id);
        if (!row) {
          errors.push({ id, field, error: 'Không tìm thấy khách hàng này (có thể đã bị xóa).' });
          continue;
        }
        if (!f) {
          errors.push({ id, field, error: 'Cột không hợp lệ.' });
          continue;
        }
        const r = f.type === 'status' ? resolver.resolve(ch.value) : cleanValue(f, ch.value);
        if (r.error) {
          errors.push({ id, field, error: r.error });
          continue;
        }
        const old = row[f.col];
        if (old === r.value) continue;
        // f.col lấy từ danh sách FIELDS cố định ở trên (không phải chữ người dùng gửi)
        db.prepare(`UPDATE crm_contacts SET ${f.col} = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(r.value, req.admin.id, now, id);
        insertChange(id, field, old, r.value, req.admin.id, now);
        row[f.col] = r.value;
        applied.push({ row, field, old, value: r.value });
      }
      created = resolver.created;
    })();

    const changedIds = [...new Set(applied.map((a) => a.row.id))];
    if (changedIds.length) {
      const extra = created.length ? `. Thêm trạng thái mới: ${created.map((n) => `"${n}"`).join(', ')}` : '';
      const describe = (a) => `${FIELDS[a.field].label} ${showValue(a.field, a.old)} → ${showValue(a.field, a.value)}`;
      if (changedIds.length === 1) {
        // Một khách hàng: đổi trạng thái luôn ghi; sửa ô khác thì mỗi 10 phút ghi một dòng (chi tiết từng ô có ở lịch sử của khách hàng)
        const row = applied[0].row;
        const key = `${req.admin.id}:${row.id}`;
        const hasStatus = applied.some((a) => a.field === 'status');
        if (hasStatus || created.length || Date.now() - (lastAudit.get(key) || 0) > AUDIT_MERGE_MS) {
          const parts = applied.slice(0, 3).map(describe);
          if (applied.length > 3) parts.push(`và ${applied.length - 3} ô khác`);
          audit(req, 'crm_update', `CSKH ${whoOf(row)}: ${parts.join('; ')}${extra}`);
          lastAudit.set(key, Date.now());
        }
      } else {
        const won = applied.filter((a) => a.field === 'status' && a.value === WON).map((a) => a.row);
        const wonText = won.length ? `. Chuyển "${WON}": ${listNames(won)}` : '';
        const changedRows = changedIds.map((id) => rows.get(id));
        audit(req, 'crm_update', `Sửa ${applied.length} ô trong bảng CSKH (${changedIds.length} khách hàng: ${listNames(changedRows)})${wonText}${extra}`);
      }
    }
    res.json({ contacts: loadViews(changedIds), errors, statuses: customStatuses(), newStatuses: created });
  });

  // Xóa (mềm) nhiều dòng: { ids }. Khôi phục được (Hoàn tác / "Khách hàng đã xóa").
  router.post('/delete', (req, res) => {
    const rows = loadRows(readIds(req.body?.ids).slice(0, MAX_CHANGES));
    if (rows.length === 0) return res.status(400).json({ error: 'Chưa chọn khách hàng nào để xóa (hoặc đã bị xóa rồi).' });
    const now = nowIso();
    db.transaction(() => {
      for (const r of rows) {
        db.prepare('UPDATE crm_contacts SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(now, req.admin.id, now, r.id);
        insertChange(r.id, 'delete', null, null, req.admin.id, now);
      }
    })();
    audit(req, 'crm_delete', `Xóa ${rows.length} khách hàng khỏi bảng CSKH: ${listNames(rows)}`);
    res.json({ ids: rows.map((r) => r.id) });
  });

  router.post('/restore', (req, res) => {
    const rows = loadRows(readIds(req.body?.ids).slice(0, MAX_CHANGES), true);
    if (rows.length === 0) return res.status(400).json({ error: 'Không có khách hàng nào cần khôi phục.' });
    const now = nowIso();
    db.transaction(() => {
      for (const r of rows) {
        db.prepare('UPDATE crm_contacts SET deleted_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?').run(req.admin.id, now, r.id);
        insertChange(r.id, 'restore', null, null, req.admin.id, now);
      }
    })();
    audit(req, 'crm_restore', `Khôi phục ${rows.length} khách hàng vào bảng CSKH: ${listNames(rows)}`);
    res.json({ contacts: loadViews(rows.map((r) => r.id)), statuses: customStatuses() });
  });

  // Khách hàng đã xóa (mới xóa lên trước) — để khôi phục khi lỡ tay
  router.get('/deleted', (req, res) => {
    const rows = db.prepare(`${SELECT} WHERE c.deleted_at IS NOT NULL ORDER BY c.deleted_at DESC, c.id DESC LIMIT 500`).all();
    res.json({ contacts: rows.map((r) => ({ ...toView(r), deletedAt: r.deleted_at })) });
  });

  // ----- Tải Excel -----

  router.get('/export', async (req, res) => {
    const rows = db.prepare(`${SELECT} WHERE c.deleted_at IS NULL ORDER BY c.contact_date IS NULL, c.contact_date DESC, c.id DESC`).all();
    const colorOf = new Map(customStatuses().map((s) => [s.name, s.color]));
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Seamark';

    // Trang 1: đúng các cột như trên web (tên cột trùng lúc dán vào web nên dán ngược lại được)
    const ws = wb.addWorksheet('CSKH', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    ws.columns = [
      { header: 'Học sinh', key: 'studentName', width: 24 },
      { header: 'Phụ huynh', key: 'parentName', width: 24 },
      { header: 'SĐT', key: 'phone', width: 15 },
      { header: 'CCCD', key: 'idNumber', width: 15 },
      { header: 'Ngày CSKH', key: 'contactDate', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Nhân viên CSKH', key: 'staff', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Học phí', key: 'tuition', width: 13, style: { numFmt: MONEY_FMT } },
      { header: 'Hẹn gọi lại', key: 'followUp', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Ghi chú', key: 'note', width: 50 },
      { header: 'Đã vào lớp', key: 'className', width: 18 },
    ];
    for (const r of rows) {
      const row = ws.addRow({
        studentName: r.student_name,
        parentName: r.parent_name,
        phone: r.phone, // ghi dạng chữ: giữ số 0 ở đầu
        idNumber: r.id_number,
        contactDate: excelDate(r.contact_date),
        staff: r.staff,
        status: r.status,
        tuition: r.tuition,
        followUp: excelDate(r.follow_up),
        note: r.note,
        className: r.class_name || '',
      });
      const argb = STATUS_ARGB[r.status] || STATUS_ARGB[colorOf.get(r.status)];
      if (argb) row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
    }
    styleHeader(ws.getRow(1));
    // Bật nút lọc của Excel ở dòng tên cột
    ws.autoFilter = 'A1:K1';

    // Trang 2: thống kê
    const st = wb.addWorksheet('Thống kê');
    [26, 12, 12, 12, 18].forEach((w, i) => (st.getColumn(i + 1).width = w));
    const title = (text) => (st.addRow([text]).font = { bold: true, size: 13, color: { argb: 'FF16235F' } });
    const head = (cells) => styleHeader(st.addRow(cells));
    const pct = (a, b) => (b ? a / b : 0);
    const sumTuition = (list) => list.reduce((n, r) => n + (r.tuition || 0), 0);

    title(`Bảng CSKH ngày ${formatDate(vnDate())} — ${rows.length} khách hàng`);
    st.addRow([]);
    title('Theo trạng thái');
    head(['Trạng thái', 'Số khách', 'Tỉ lệ', '', 'Tổng học phí']);
    const statusNames = [...FIXED_STATUSES, ...colorOf.keys()];
    const others = rows.filter((r) => r.status && !statusNames.includes(r.status));
    for (const name of [...statusNames, ...new Set(others.map((r) => r.status)), '']) {
      const list = rows.filter((r) => r.status === name);
      if (!list.length && !FIXED_STATUSES.includes(name)) continue;
      const row = st.addRow([name || 'Chưa có trạng thái', list.length, pct(list.length, rows.length), '', sumTuition(list)]);
      row.getCell(3).numFmt = '0%';
      row.getCell(5).numFmt = MONEY_FMT;
      const argb = STATUS_ARGB[name] || STATUS_ARGB[colorOf.get(name)];
      if (argb) row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    }

    st.addRow([]);
    title('Theo nhân viên CSKH');
    head(['Nhân viên', 'Số khách', 'Đã chốt', 'Tỉ lệ chốt', 'Học phí đã chốt']);
    const byStaff = new Map();
    for (const r of rows) {
      const k = r.staff || '(chưa ghi)';
      if (!byStaff.has(k)) byStaff.set(k, []);
      byStaff.get(k).push(r);
    }
    for (const [name, list] of [...byStaff].sort((a, b) => b[1].length - a[1].length)) {
      const won = list.filter((r) => r.status === WON);
      const row = st.addRow([name, list.length, won.length, pct(won.length, list.length), sumTuition(won)]);
      row.getCell(4).numFmt = '0%';
      row.getCell(5).numFmt = MONEY_FMT;
    }

    st.addRow([]);
    title('Theo tháng (ngày CSKH)');
    head(['Tháng', 'Số khách', 'Đã chốt', 'Tỉ lệ chốt', 'Học phí đã chốt']);
    const byMonth = new Map();
    for (const r of rows) {
      const k = r.contact_date ? r.contact_date.slice(0, 7) : '';
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(r);
    }
    for (const [m, list] of [...byMonth].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
      const won = list.filter((r) => r.status === WON);
      const row = st.addRow([m ? `${m.slice(5)}/${m.slice(0, 4)}` : 'Chưa ghi ngày', list.length, won.length, pct(won.length, list.length), sumTuition(won)]);
      row.getCell(4).numFmt = '0%';
      row.getCell(5).numFmt = MONEY_FMT;
    }
    fillRow(st.addRow(['Tổng', rows.length, rows.filter((r) => r.status === WON).length, pct(rows.filter((r) => r.status === WON).length, rows.length), sumTuition(rows.filter((r) => r.status === WON))]), 'FFF1F5F9');
    st.lastRow.getCell(4).numFmt = '0%';
    st.lastRow.getCell(5).numFmt = MONEY_FMT;

    audit(req, 'export_crm', `Tải bảng CSKH về Excel (${rows.length} khách hàng)`);
    await sendWorkbook(res, wb, `CSKH ${formatDate(vnDate()).replace(/\//g, '-')}.xlsx`);
  });

  // ----- Trạng thái tự thêm -----

  router.post('/statuses', (req, res) => {
    const name = cleanText(req.body?.name, 30);
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên trạng thái.' });
    const hit = statusKeys().get(foldKey(name));
    if (hit) return res.status(409).json({ error: `Đã có trạng thái "${hit}".` });
    const count = db.prepare('SELECT COUNT(*) AS n FROM crm_statuses').get().n;
    const color = STATUS_COLORS.includes(req.body?.color) ? req.body.color : STATUS_COLORS[count % STATUS_COLORS.length];
    db.prepare('INSERT INTO crm_statuses (name, color, created_by, created_at) VALUES (?, ?, ?, ?)').run(name, color, req.admin.id, nowIso());
    audit(req, 'crm_status', `Thêm trạng thái CSKH "${name}"`);
    res.status(201).json({ statuses: customStatuses() });
  });

  function loadStatus(req, res) {
    const st = db.prepare('SELECT * FROM crm_statuses WHERE id = ?').get(toInt(req.params.id) || 0);
    if (!st) res.status(404).json({ error: 'Không tìm thấy trạng thái này (có thể đã bị xóa).' });
    return st;
  }

  // Đổi tên / màu: { name?, color? }. Đổi tên thì mọi khách hàng đang ở trạng thái này đổi theo.
  router.post('/statuses/:id/update', (req, res) => {
    const st = loadStatus(req, res);
    if (!st) return;
    const name = req.body && 'name' in req.body ? cleanText(req.body.name, 30) : st.name;
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên trạng thái.' });
    const hit = statusKeys(st.id).get(foldKey(name));
    if (hit) return res.status(409).json({ error: `Đã có trạng thái "${hit}".` });
    const color = STATUS_COLORS.includes(req.body?.color) ? req.body.color : st.color;
    let renamed = 0;
    db.transaction(() => {
      db.prepare('UPDATE crm_statuses SET name = ?, color = ? WHERE id = ?').run(name, color, st.id);
      if (name !== st.name) renamed = db.prepare('UPDATE crm_contacts SET status = ? WHERE status = ?').run(name, st.name).changes;
    })();
    if (name !== st.name) audit(req, 'crm_status', `Đổi tên trạng thái CSKH "${st.name}" thành "${name}" (${renamed} khách hàng đổi theo)`);
    else if (color !== st.color) audit(req, 'crm_status', `Đổi màu trạng thái CSKH "${name}"`);
    res.json({ statuses: customStatuses(), renamed });
  });

  router.post('/statuses/:id/delete', (req, res) => {
    const st = loadStatus(req, res);
    if (!st) return;
    const used = db.prepare('SELECT COUNT(*) AS n FROM crm_contacts WHERE status = ? AND deleted_at IS NULL').get(st.name).n;
    if (used) {
      return res.status(409).json({
        error: `Trạng thái "${st.name}" đang dùng cho ${used} khách hàng. Hãy lọc theo trạng thái này và đổi trạng thái của các khách hàng đó trước.`,
      });
    }
    db.prepare('DELETE FROM crm_statuses WHERE id = ?').run(st.id);
    audit(req, 'crm_status', `Xóa trạng thái CSKH "${st.name}"`);
    res.json({ statuses: customStatuses() });
  });

  // ----- Một khách hàng -----

  router.get('/:id/history', (req, res) => {
    const id = toInt(req.params.id) || 0;
    const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
    const changes = db
      .prepare(
        `SELECT h.*, a.display_name AS by_name FROM crm_changes h LEFT JOIN admins a ON a.id = h.admin_id
          WHERE h.contact_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 500`
      )
      .all(id)
      .map((h) => ({ id: h.id, field: h.field, oldValue: h.old_value, newValue: h.new_value, by: h.by_name, at: h.created_at }));
    const creator = db.prepare('SELECT display_name FROM admins WHERE id = ?').get(row.created_by);
    res.json({ contact: { ...toView(row), deletedAt: row.deleted_at, createdBy: creator?.display_name || '' }, changes });
  });

  // Đã thêm khách hàng vào lớp (trình duyệt gọi POST /classes/:id/students trước, rồi gửi id học sinh vừa tạo):
  // ghi lại lớp đã vào + chuyển trạng thái "Đã chốt"
  router.post('/:id/enroll', (req, res) => {
    const row = loadRows([toInt(req.params.id) || 0])[0];
    if (!row) return res.status(404).json({ error: 'Không tìm thấy khách hàng (có thể đã bị xóa).' });
    const st = db
      .prepare('SELECT cs.id, cs.full_name, c.id AS class_id, c.name AS class_name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = ?')
      .get(toInt(req.body?.classStudentId) || 0);
    if (!st) return res.status(400).json({ error: 'Không tìm thấy học sinh vừa thêm vào lớp.' });
    const now = nowIso();
    db.transaction(() => {
      db.prepare('UPDATE crm_contacts SET class_student_id = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(st.id, req.admin.id, now, row.id);
      insertChange(row.id, 'enroll', null, st.class_name, req.admin.id, now);
      if (row.status !== WON) {
        db.prepare('UPDATE crm_contacts SET status = ? WHERE id = ?').run(WON, row.id);
        insertChange(row.id, 'status', row.status, WON, req.admin.id, now);
      }
    })();
    audit(req, 'crm_enroll', `Khách hàng CSKH ${whoOf(row)} vào lớp "${st.class_name}" (học sinh "${st.full_name}")`, st.class_id);
    res.json({ contact: loadViews([row.id])[0], statuses: customStatuses() });
  });

  return router;
}

module.exports = crmRouter;
module.exports.FIXED_STATUSES = FIXED_STATUSES;
