import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../utils/api.js';
import { vnToday } from '../../utils/schedule.js';
import {
  COLUMNS,
  NO_STATUS,
  PENDING,
  WON,
  allStatuses,
  computeView,
  computeWarnings,
  detectHeader,
  followUpDue,
  isBlank,
  parseCellInput,
  parseTsv,
  rowToContact,
} from '../../utils/crm.js';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { Dolphin, Sparkle } from '../../components/brand/SeaArt.jsx';
import { ExcelLink } from '../classes/TuitionBits.jsx';
import CrmHero from './CrmHero.jsx';
import CrmSheet from './CrmSheet.jsx';
import { DeletedDialog, EnrollDialog, HistoryDialog, OverwriteDialog, PasteDialog, StatusManager } from './CrmDialogs.jsx';
import '../classes/classes.css';
import './crm.css';

const STAFF_KEY = 'seamark.crm.staff'; // tên nhân viên CSKH gõ gần nhất trên máy này (điền sẵn cho dòng mới)
const TIP_KEY = 'seamark.crm.tip-hidden';
const EMPTY = { studentName: '', parentName: '', phone: '', idNumber: '', contactDate: null, staff: '', status: '', tuition: null, followUp: null, note: '' };
const sameValue = (a, b) => (isBlank(a) ? '' : String(a)) === (isBlank(b) ? '' : String(b));

function readLocal(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Trình duyệt chặn lưu: bỏ qua
  }
}

/**
 * Chăm sóc khách hàng (chỉ admin chính): bảng tính kiểu Excel, mỗi ô sửa xong là tự lưu lên server.
 *
 * Cách giữ dữ liệu trên trình duyệt:
 * - Mỗi khách hàng có `id` = khóa trên trình duyệt (không bao giờ đổi, để dòng không bị vẽ lại khi đang gõ) và
 *   `serverId` = id trong database. Khách hàng vừa thêm có id âm, serverId = null cho tới khi server trả về.
 * - Sửa ô: hiện ngay trên bảng, rồi gửi lên server theo hàng đợi (lần lượt từng yêu cầu, không chen nhau).
 *   Server báo lỗi thì trả ô về như cũ và báo cho người dùng.
 * - Thứ tự dòng (`viewIds`) chỉ tính lại khi đổi bộ lọc / sắp xếp, để dòng đang sửa không nhảy chỗ;
 *   khi bảng không còn đúng thứ tự thì hiện nút "Sắp xếp / lọc lại".
 * - Hoàn tác / làm lại: mỗi việc (sửa ô, dán, thêm, xóa) là một mục trong lịch sử của trang.
 */
export default function CrmPage() {
  const sheetRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [contacts, setContacts] = useState(() => new Map()); // id -> khách hàng (cả dòng vừa xóa: _deleted = true, để hoàn tác)
  const [viewIds, setViewIds] = useState([]); // thứ tự dòng đang hiện
  const [custom, setCustom] = useState([]); // trạng thái tự thêm
  const [staffNames, setStaffNames] = useState([]);
  const [knownPhones, setKnownPhones] = useState({});
  const [today, setToday] = useState(vnToday());
  const [filter, setFilter] = useState({ status: '', followUp: false, search: '' });
  const [sort, setSort] = useState({ key: 'contactDate', dir: 'desc' });
  const [saving, setSaving] = useState(0);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [party, setParty] = useState(null); // cá heo ăn mừng khi chốt được khách
  const [tipHidden, setTipHidden] = useState(() => readLocal(TIP_KEY) === '1');
  const [, setHistoryTick] = useState(0);

  // Bản mới nhất (đọc ngay được trong các hàm, không phải chờ vẽ lại)
  const contactsRef = useRef(contacts);
  const viewRef = useRef(viewIds);
  const keyByServer = useRef(new Map()); // id database -> id trên trình duyệt
  const serverByKey = useRef(new Map()); // ngược lại
  const pending = useRef(new Map()); // id -> Map(cột -> số lần sửa đang gửi): server trả về không ghi đè chữ mới gõ
  const queue = useRef(Promise.resolve());
  const savingRef = useRef(0);
  const tempSeq = useRef(0);
  const history = useRef({ undo: [], redo: [] });
  const batch = useRef(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const lastLoad = useRef(0);

  const updateContacts = useCallback((fn) => {
    const next = fn(new Map(contactsRef.current));
    contactsRef.current = next;
    setContacts(next);
  }, []);
  const updateView = useCallback((fn) => {
    const next = fn(viewRef.current);
    viewRef.current = next;
    setViewIds(next);
  }, []);
  const notify = useCallback((type, text) => setToast({ type, text, at: Date.now() }), []);
  const activeList = () => [...contactsRef.current.values()].filter((c) => !c._deleted);
  const serverIdOf = (id) => contactsRef.current.get(id)?.serverId ?? serverByKey.current.get(id) ?? null;

  /** Khách hàng từ server -> trên trình duyệt (giữ nguyên id trình duyệt đã có) */
  const fromServer = (s) => {
    const id = keyByServer.current.get(s.id) ?? s.id;
    keyByServer.current.set(s.id, id);
    serverByKey.current.set(id, s.id);
    return { ...s, id, serverId: s.id };
  };

  // ----- Tải dữ liệu -----

  const load = useCallback(async ({ keepOrder = false } = {}) => {
    try {
      const d = await apiGet('/admin/crm');
      lastLoad.current = Date.now();
      const map = new Map();
      for (const s of d.contacts) {
        const c = fromServer(s);
        map.set(c.id, c);
      }
      contactsRef.current = map;
      setContacts(map);
      setCustom(d.statuses);
      setStaffNames(d.staffNames);
      setKnownPhones(d.knownPhones);
      setToday(d.today);
      if (keepOrder) {
        // Tải lại khi quay lại trang: giữ thứ tự đang xem, khách hàng mới (thêm từ máy khác) lên đầu
        updateView((v) => {
          const seen = new Set(v);
          return [...[...map.keys()].filter((id) => !seen.has(id)), ...v.filter((id) => map.has(id))];
        });
      } else {
        updateView(() => computeView([...map.values()], filterRef.current, sortRef.current, d.today));
      }
      setLoaded(true);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
    // fromServer chỉ dùng ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateView]);

  useEffect(() => {
    load();
  }, [load]);

  // Quay lại tab này (sau khi mở Zalo, Excel...): tải lại để thấy thay đổi từ máy khác — chỉ khi không đang sửa / đang lưu
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || savingRef.current > 0 || dialogRef.current) return;
      if (sheetRef.current?.isEditing() || Date.now() - lastLoad.current < 30000) return;
      load({ keepOrder: true });
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Còn thay đổi chưa lưu xong mà đóng trang: hỏi lại
  useEffect(() => {
    const onLeave = (e) => {
      if (savingRef.current > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  // Đổi bộ lọc / sắp xếp: tính lại thứ tự dòng, về đầu bảng
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    updateView(() => computeView(activeList(), filter, sort, today));
    sheetRef.current?.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.type === 'error' ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ----- Gửi lên server (lần lượt từng yêu cầu) -----

  function enqueue(task) {
    savingRef.current += 1;
    setSaving(savingRef.current);
    const run = queue.current.then(task);
    queue.current = run.catch(() => {}).finally(() => {
      savingRef.current -= 1;
      setSaving(savingRef.current);
    });
    return run;
  }

  function markPending(list, delta) {
    for (const { id, field } of list) {
      if (!pending.current.has(id)) pending.current.set(id, new Map());
      const m = pending.current.get(id);
      const n = (m.get(field) || 0) + delta;
      if (n > 0) m.set(field, n);
      else m.delete(field);
    }
  }

  /** Ghép dữ liệu server trả về; ô người dùng vừa gõ tiếp (chưa gửi xong) thì giữ chữ mới */
  function mergeServer(list) {
    if (!list?.length) return;
    updateContacts((map) => {
      for (const s of list) {
        const next = fromServer(s);
        const cur = map.get(next.id);
        const pend = pending.current.get(next.id);
        if (cur && pend) for (const [field, n] of pend) if (n > 0) next[field] = cur[field];
        if (cur?._deleted) next._deleted = true;
        map.set(next.id, next);
      }
      return map;
    });
  }

  function afterStatuses(r) {
    if (r?.statuses) setCustom(r.statuses);
    if (r?.newStatuses?.length) notify('info', `Đã thêm trạng thái mới vào danh sách: ${r.newStatuses.map((n) => `"${n}"`).join(', ')}.`);
  }

  function rememberStaff(name) {
    writeLocal(STAFF_KEY, name);
    setStaffNames((list) => (list.includes(name) ? list : [name, ...list]));
  }

  function celebrate(contact) {
    setParty({ name: contact?.studentName || contact?.parentName || '', at: Date.now() });
  }
  const endParty = useCallback(() => setParty(null), []);

  // ----- Lịch sử để hoàn tác -----

  function pushHistory(entry) {
    if (batch.current) {
      batch.current.cells.push(...entry.cells);
      batch.current.created.push(...entry.created);
      batch.current.deleted.push(...entry.deleted);
      batch.current.positions.push(...(entry.positions || []));
      return;
    }
    history.current.undo.push({ positions: [], ...entry });
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    setHistoryTick((n) => n + 1);
  }
  /** Gộp nhiều việc (ví dụ dán: sửa ô + thêm dòng) thành một lần hoàn tác */
  function inBatch(fn) {
    batch.current = { cells: [], created: [], deleted: [], positions: [] };
    try {
      fn();
    } finally {
      const b = batch.current;
      batch.current = null;
      if (b.cells.length || b.created.length || b.deleted.length) pushHistory(b);
    }
  }

  // ----- Thêm / sửa / xóa -----

  /** Thêm khách hàng. position: 'top' (đầu bảng) | 'end' (cuối bảng, khi dán quá dòng cuối) */
  function createRows(list, { position = 'top', record = true } = {}) {
    const ids = list.map(() => (tempSeq.current -= 1));
    updateContacts((map) => {
      list.forEach((v, i) => map.set(ids[i], { ...EMPTY, ...v, id: ids[i], serverId: null, enrolled: null }));
      return map;
    });
    updateView((v) => (position === 'top' ? [...ids, ...v] : [...v, ...ids]));
    if (record) pushHistory({ cells: [], created: ids, deleted: [] });
    enqueue(async () => {
      try {
        const r = await apiPost('/admin/crm', { rows: list });
        r.contacts.forEach((s, i) => {
          keyByServer.current.set(s.id, ids[i]);
          serverByKey.current.set(ids[i], s.id);
        });
        mergeServer(r.contacts);
        afterStatuses(r);
      } catch (err) {
        updateContacts((map) => {
          ids.forEach((id) => map.delete(id));
          return map;
        });
        updateView((v) => v.filter((id) => !ids.includes(id)));
        notify('error', `Chưa thêm được khách hàng: ${err.message}`);
      }
    });
    return ids;
  }

  /** Sửa ô: changes = [{ key: id trên trình duyệt, field, value (đã ở dạng chuẩn) }] */
  function changeCells(changes, { record = true } = {}) {
    const map = contactsRef.current;
    const list = changes.filter((ch) => map.has(ch.key)).map((ch) => ({ ...ch, before: map.get(ch.key)[ch.field] }));
    if (!list.length) return;
    updateContacts((m) => {
      for (const ch of list) m.set(ch.key, { ...m.get(ch.key), [ch.field]: ch.value });
      return m;
    });
    const marks = list.map((ch) => ({ id: ch.key, field: ch.field }));
    markPending(marks, 1);
    if (record) pushHistory({ cells: list.map(({ key, field, before, value }) => ({ key, field, before, after: value })), created: [], deleted: [] });
    // Vừa chốt được một khách: cá heo nhảy lên ăn mừng
    const won = list.filter((ch) => ch.field === 'status' && ch.value === WON && ch.before !== WON);
    if (record && won.length === 1) celebrate(map.get(won[0].key));
    const staff = list.find((ch) => ch.field === 'staff' && ch.value);
    if (staff) rememberStaff(staff.value);

    enqueue(async () => {
      const payload = list.map((ch) => ({ id: serverIdOf(ch.key), field: ch.field, value: ch.value })).filter((x) => x.id);
      const revert = (items) =>
        updateContacts((m) => {
          for (const ch of items) {
            // Đã gõ chữ mới hơn vào ô này thì thôi
            if (m.has(ch.key) && !pending.current.get(ch.key)?.get(ch.field)) m.set(ch.key, { ...m.get(ch.key), [ch.field]: ch.before });
          }
          return m;
        });
      try {
        const r = payload.length ? await apiPost('/admin/crm/cells', { changes: payload }) : { contacts: [], errors: [] };
        markPending(marks, -1);
        mergeServer(r.contacts);
        afterStatuses(r);
        if (r.errors.length) {
          const bad = list.filter((ch) => r.errors.some((e) => e.id === serverIdOf(ch.key) && e.field === ch.field));
          revert(bad);
          const first = r.errors[0];
          const col = COLUMNS.find((c) => c.key === first.field);
          notify('error', `${r.errors.length} ô chưa lưu được${col ? ` (${col.label})` : ''}: ${first.error}`);
        }
      } catch (err) {
        markPending(marks, -1);
        revert(list);
        notify('error', `Chưa lưu được: ${err.message}`);
      }
    });
  }

  /** Xóa dòng (xóa mềm — hoàn tác / khôi phục được) */
  function deleteRows(ids, { record = true } = {}) {
    const map = contactsRef.current;
    const list = ids.filter((id) => map.has(id) && !map.get(id)._deleted);
    if (!list.length) return;
    if (record && list.length > 1 && !window.confirm(`Xóa ${list.length} khách hàng đang chọn khỏi bảng CSKH?\n\nLỡ tay vẫn lấy lại được: bấm "Hoàn tác" (Ctrl+Z) hoặc mục "Đã xóa".`)) return;
    const positions = list.map((id) => ({ key: id, index: viewRef.current.indexOf(id) }));
    const hide = (flag) =>
      updateContacts((m) => {
        list.forEach((id) => m.has(id) && m.set(id, { ...m.get(id), _deleted: flag }));
        return m;
      });
    hide(true);
    updateView((v) => v.filter((id) => !list.includes(id)));
    if (record) {
      pushHistory({ cells: [], created: [], deleted: list, positions });
      notify('info', `Đã xóa ${list.length} khách hàng. Lỡ tay thì bấm "Hoàn tác".`);
    }
    enqueue(async () => {
      const serverIds = list.map(serverIdOf).filter(Boolean);
      if (!serverIds.length) return;
      try {
        await apiPost('/admin/crm/delete', { ids: serverIds });
      } catch (err) {
        hide(false);
        updateView((v) => [...list.filter((id) => !v.includes(id)), ...v]);
        notify('error', `Chưa xóa được: ${err.message}`);
      }
    });
  }

  /** Đưa các dòng đã xóa về bảng (đúng chỗ cũ nếu biết) */
  function restoreRows(ids, positions = []) {
    updateContacts((m) => {
      ids.forEach((id) => m.has(id) && m.set(id, { ...m.get(id), _deleted: false }));
      return m;
    });
    updateView((v) => {
      const out = v.filter((id) => !ids.includes(id));
      const pos = new Map(positions.map((p) => [p.key, p.index]));
      for (const id of [...ids].sort((a, b) => (pos.get(a) ?? -1) - (pos.get(b) ?? -1))) {
        const i = pos.get(id);
        if (i === undefined || i < 0 || i > out.length) out.unshift(id);
        else out.splice(i, 0, id);
      }
      return out;
    });
    enqueue(async () => {
      const serverIds = ids.map(serverIdOf).filter(Boolean);
      if (!serverIds.length) return;
      try {
        const r = await apiPost('/admin/crm/restore', { ids: serverIds });
        mergeServer(r.contacts);
        afterStatuses(r);
      } catch (err) {
        notify('error', `Chưa khôi phục được: ${err.message}`);
      }
    });
  }

  const describe = (e) =>
    [
      e.cells.length && `sửa ${e.cells.length} ô`,
      e.created.length && `thêm ${e.created.length} khách hàng`,
      e.deleted.length && `xóa ${e.deleted.length} khách hàng`,
    ].filter(Boolean).join(', ');

  function undo() {
    const e = history.current.undo.pop();
    if (!e) return notify('info', 'Không còn việc nào để hoàn tác.');
    if (e.cells.length) changeCells(e.cells.map((x) => ({ key: x.key, field: x.field, value: x.before })), { record: false });
    if (e.created.length) deleteRows(e.created, { record: false });
    if (e.deleted.length) restoreRows(e.deleted, e.positions);
    history.current.redo.push(e);
    setHistoryTick((n) => n + 1);
    notify('info', `Đã hoàn tác: ${describe(e)}.`);
  }
  function redo() {
    const e = history.current.redo.pop();
    if (!e) return notify('info', 'Không còn việc nào để làm lại.');
    if (e.created.length) restoreRows(e.created);
    if (e.cells.length) changeCells(e.cells.map((x) => ({ key: x.key, field: x.field, value: x.after })), { record: false });
    if (e.deleted.length) deleteRows(e.deleted, { record: false });
    history.current.undo.push(e);
    setHistoryTick((n) => n + 1);
    notify('info', `Đã làm lại: ${describe(e)}.`);
  }
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  // Ctrl+Z / Ctrl+Y khi con trỏ không ở trong ô nhập nào (ví dụ vừa bấm nút trên thanh công cụ)
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || dialogRef.current || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        (e.shiftKey ? redoRef : undoRef).current();
      } else if (k === 'y') {
        e.preventDefault();
        redoRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- Dữ liệu cho bảng -----

  const active = useMemo(() => [...contacts.values()].filter((c) => !c._deleted), [contacts]);
  const rows = useMemo(() => viewIds.map((id) => contacts.get(id)).filter((c) => c && !c._deleted), [viewIds, contacts]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const statuses = useMemo(() => allStatuses(custom), [custom]);
  const statusColorOf = useCallback((name) => statuses.find((s) => s.name === name)?.color || 'gray', [statuses]);
  const warnings = useMemo(() => computeWarnings(active, knownPhones), [active, knownPhones]);
  const fresh = useMemo(() => computeView(active, filter, sort, today), [active, filter, sort, today]);
  const stale = loaded && (fresh.length !== rows.length || fresh.some((id, i) => id !== rows[i].id));

  const stats = useMemo(() => {
    const counts = new Map();
    const month = today.slice(0, 7);
    const s = { total: active.length, won: 0, pending: 0, due: 0, late: 0, wonTuition: 0, thisMonth: 0, noStatus: 0, counts };
    for (const c of active) {
      counts.set(c.status, (counts.get(c.status) || 0) + 1);
      if (!c.status) s.noStatus += 1;
      if (c.status === WON) {
        s.won += 1;
        s.wonTuition += c.tuition || 0;
      }
      if (c.status === PENDING) s.pending += 1;
      if (followUpDue(c, today)) {
        s.due += 1;
        if (c.followUp < today) s.late += 1;
      }
      if (c.contactDate?.startsWith(month)) s.thisMonth += 1;
    }
    s.rate = s.total ? Math.round((s.won / s.total) * 100) : 0;
    return s;
  }, [active, today]);

  const setStatusFilter = useCallback((name) => setFilter((f) => ({ ...f, status: f.status === name ? '' : name })), []);
  const toggleFollow = useCallback(() => setFilter((f) => ({ ...f, followUp: !f.followUp })), []);

  function handleSort(key) {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'contactDate' || key === 'tuition' ? 'desc' : 'asc' };
    });
  }

  function refreshView() {
    updateView(() => fresh);
    sheetRef.current?.reset();
  }

  // ----- Dòng mới, dán -----

  /** Gõ vào "dòng mới": thêm khách hàng, điền sẵn ngày hôm nay + tên nhân viên CSKH gõ gần nhất trên máy này */
  function handleCreate(values) {
    const staff = readLocal(STAFF_KEY);
    createRows([{ contactDate: today, ...(staff ? { staff } : {}), ...values }]);
    if (values.staff) rememberStaff(values.staff);
  }

  /**
   * Sau khi dán nhiều khách hàng mới: không bật bộ lọc thì xếp lại cả bảng (các dòng vừa dán về đúng chỗ theo ngày);
   * đang lọc thì giữ các dòng mới ở đầu bảng (để không "biến mất" vì không khớp bộ lọc) và chọn sẵn chúng.
   */
  function showPasted(count, before, c1 = 0) {
    const f = filterRef.current;
    if (!f.status && !f.followUp && !f.search.trim()) {
      updateView(() => computeView(activeList(), f, sortRef.current, today));
      sheetRef.current?.reset();
    } else {
      sheetRef.current?.select(1, c1, count, COLUMNS.length - 1, { max: before + count });
    }
  }

  /** Dán thành khách hàng mới */
  function pasteAsNew(dataRows, mapping, { position = 'top', fillToday = true } = {}) {
    const prepared = dataRows.filter((row) => row.some((cell) => String(cell).trim())).map((cells) => rowToContact(cells, mapping, today));
    const list = prepared
      .map((p) => ({ ...(fillToday && !p.contact.contactDate ? { contactDate: today } : {}), ...p.contact }))
      .filter((c) => Object.values(c).some((v) => !isBlank(v)));
    if (!list.length) return;
    const before = rowsRef.current.length;
    inBatch(() => createRows(list, { position }));
    const warns = prepared.reduce((n, p) => n + p.warnings.length, 0);
    notify(warns ? 'warn' : 'success', `Đã thêm ${list.length} khách hàng${warns ? ` (${warns} ô ngày / học phí không đọc được, đã ghi vào Ghi chú)` : ''}.`);
    if (position === 'top') showPasted(list.length, before, Math.max(0, COLUMNS.findIndex((c) => c.key === mapping.find(Boolean))));
  }

  /** Dán đè lên các dòng từ dòng r, cột c; dòng thừa ở cuối bảng thành khách hàng mới */
  function pasteOver(grid, mapping, r, c) {
    const list = rowsRef.current;
    const changes = [];
    const errors = [];
    const extra = [];
    grid.forEach((cells, i) => {
      const contact = list[r - 1 + i];
      if (!contact) {
        extra.push(cells);
        return;
      }
      mapping.forEach((key, j) => {
        const col = COLUMNS.find((x) => x.key === key);
        const raw = String(cells[j] ?? '');
        const p = parseCellInput(col, raw, today);
        if (p.error) errors.push(`dòng ${r + i}, ${col.label} "${raw.trim()}"`);
        else if (!sameValue(contact[key], p.value)) changes.push({ key: contact.id, field: key, value: p.value });
      });
    });
    inBatch(() => {
      if (changes.length) changeCells(changes);
      if (extra.length) {
        createRows(extra.map((cells) => ({ contactDate: today, ...rowToContact(cells, mapping, today).contact })), { position: 'end' });
      }
    });
    sheetRef.current?.select(r, c, r + grid.length - 1, c + mapping.length - 1, { max: list.length + extra.length });
    if (errors.length) notify('error', `${errors.length} ô không dán được (chữ không phải ngày / số tiền): ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
    else if (changes.length + extra.length > 1) notify('success', `Đã dán ${changes.length} ô${extra.length ? `, thêm ${extra.length} khách hàng mới ở cuối bảng` : ''}.`);
  }

  /** Một chữ dán vào vùng nhiều ô: điền vào mọi ô của vùng (như Excel) */
  function fillRange(raw, range) {
    const changes = [];
    let bad = 0;
    for (const contact of rowsRef.current.slice(Math.max(1, range.r1) - 1, range.r2)) {
      for (let c = range.c1; c <= range.c2; c++) {
        const col = COLUMNS[c];
        const p = parseCellInput(col, raw, today);
        if (p.error) bad += 1;
        else if (!sameValue(contact[col.key], p.value)) changes.push({ key: contact.id, field: col.key, value: p.value });
      }
    }
    if (changes.length) changeCells(changes);
    if (bad) notify('error', `${bad} ô không điền được "${raw.trim()}" (cột ngày / học phí cần đúng dạng).`);
  }

  function handlePaste({ text, r, c, range }) {
    const grid = parseTsv(text);
    if (!grid.length) return;
    // Chép cả bảng Excel kèm dòng tên cột: hỏi ghép cột rồi thêm thành khách hàng mới
    const header = grid.length > 1 ? detectHeader(grid) : null;
    if (header) {
      setDialog({ kind: 'paste', grid, mapping: header });
      return;
    }
    if (grid.length === 1 && grid[0].length === 1 && (range.r2 > range.r1 || range.c2 > range.c1)) {
      fillRange(grid[0][0], range);
      return;
    }
    const width = Math.min(Math.max(...grid.map((g) => g.length)), COLUMNS.length - c);
    const mapping = COLUMNS.slice(c, c + width).map((col) => col.key);
    if (r === 0) {
      pasteAsNew(grid, mapping);
      return;
    }
    // Dán nhiều dòng đè lên ô đang có chữ: hỏi trước
    const targets = rowsRef.current.slice(r - 1, r - 1 + grid.length);
    let overwrites = 0;
    targets.forEach((contact, i) => mapping.forEach((key, j) => {
      if (!isBlank(contact[key]) && String(grid[i][j] ?? '').trim() !== cellTextOf(contact, key)) overwrites += 1;
    }));
    if (grid.length > 1 && overwrites > 0) {
      setDialog({
        kind: 'overwrite', grid, mapping, r, c,
        info: { rows: grid.length, cols: width, overwrites, from: r, to: r + targets.length - 1 },
      });
      return;
    }
    pasteOver(grid, mapping, r, c);
  }

  // ----- Hộp thoại -----

  function handleEnrolled(r, className) {
    const contact = r.contact;
    mergeServer([contact]);
    afterStatuses(r);
    setDialog(null);
    celebrate(contact);
    notify('success', `Đã thêm "${contact.studentName || contact.parentName}" vào lớp ${className}.`);
  }

  function handleRestoredFromTrash(r) {
    const list = r.contacts.map(fromServer);
    updateContacts((map) => {
      list.forEach((c) => map.set(c.id, c));
      return map;
    });
    updateView((v) => [...list.map((c) => c.id).filter((id) => !v.includes(id)), ...v]);
    afterStatuses(r);
    notify('success', `Đã khôi phục ${list.length} khách hàng (ở đầu bảng).`);
  }

  function handleStatusesChanged(r) {
    setCustom(r.statuses);
    // Đổi tên trạng thái: các dòng đang dùng đổi theo -> tải lại bảng
    if (r.renamed) load({ keepOrder: true });
  }

  if (loadError && !loaded) {
    return (
      <div className="crm-page">
        <p className="alert-error">{loadError}</p>
        <button type="button" className="btn btn-secondary" onClick={() => load()}>Thử lại</button>
      </div>
    );
  }

  return (
    <div className="crm-page">
      <CrmHero stats={stats} statuses={statuses} filter={filter} onStatus={setStatusFilter} onFollow={toggleFollow} />

      <div className="crm-toolbar">
        <button type="button" className="btn btn-sun crm-add" onClick={() => sheetRef.current?.startNewRow()} disabled={!loaded}>
          <LineIcon name="plus" size={20} /> Thêm khách hàng
        </button>
        <div className="crm-tools" role="group" aria-label="Hoàn tác">
          <button type="button" className="crm-tool" onClick={undo} disabled={!history.current.undo.length} title="Hoàn tác (Ctrl+Z)">
            <LineIcon name="undo" size={18} /> <span>Hoàn tác</span>
          </button>
          <button type="button" className="crm-tool" onClick={redo} disabled={!history.current.redo.length} title="Làm lại (Ctrl+Y)">
            <LineIcon name="redo" size={18} /> <span>Làm lại</span>
          </button>
        </div>
        <label className="crm-search">
          <LineIcon name="search" size={18} />
          <span className="cl-sr">Tìm khách hàng</span>
          <input
            type="search"
            className="input"
            placeholder="Tìm tên, SĐT, CCCD, ghi chú…"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <div className="crm-sortbox" role="group" aria-label="Sắp xếp theo ngày CSKH">
          <span><LineIcon name="calendar" size={16} /> <span className="crm-sortbox-label">Ngày CSKH:</span></span>
          <button type="button" className={sort.key === 'contactDate' && sort.dir === 'desc' ? 'is-on' : ''} onClick={() => setSort({ key: 'contactDate', dir: 'desc' })}>
            Mới nhất trước
          </button>
          <button type="button" className={sort.key === 'contactDate' && sort.dir === 'asc' ? 'is-on' : ''} onClick={() => setSort({ key: 'contactDate', dir: 'asc' })}>
            Cũ nhất trước
          </button>
        </div>
        <span className={`crm-save${saving ? ' is-busy' : ''}`} role="status">
          {saving ? <><Dolphin className="crm-save-dolphin" /> Đang lưu…</> : <><LineIcon name="check" size={16} /> Đã lưu</>}
        </span>
      </div>

      <div className="crm-filters" role="group" aria-label="Lọc khách hàng">
        <button type="button" className={`crm-fchip${!filter.status ? ' is-on' : ''}`} onClick={() => setFilter((f) => ({ ...f, status: '' }))}>
          Tất cả <span className="crm-fchip-n">{stats.total}</span>
        </button>
        {statuses.map((s) => (
          <button key={s.name} type="button" className={`crm-fchip${filter.status === s.name ? ' is-on' : ''}`} onClick={() => setStatusFilter(s.name)}>
            <span className={`crm-dot is-${s.color}`} aria-hidden="true" />
            {s.name} <span className="crm-fchip-n">{stats.counts.get(s.name) || 0}</span>
          </button>
        ))}
        {(stats.noStatus > 0 || filter.status === NO_STATUS) && (
          <button type="button" className={`crm-fchip${filter.status === NO_STATUS ? ' is-on' : ''}`} onClick={() => setStatusFilter(NO_STATUS)}>
            <span className="crm-dot is-none" aria-hidden="true" />
            Chưa có trạng thái <span className="crm-fchip-n">{stats.noStatus}</span>
          </button>
        )}
        <span className="crm-filters-sep" aria-hidden="true" />
        <button type="button" className={`crm-fchip is-call${filter.followUp ? ' is-on' : ''}`} onClick={toggleFollow} aria-pressed={filter.followUp}>
          <LineIcon name="call" size={14} /> Cần gọi lại <span className="crm-fchip-n">{stats.due}</span>
        </button>
        <div className="crm-filters-end">
          <button type="button" className="crm-link-btn" onClick={() => setDialog({ kind: 'statuses' })}>
            <LineIcon name="tag" size={16} /> Quản lý trạng thái
          </button>
          <button type="button" className="crm-link-btn" onClick={() => setDialog({ kind: 'deleted' })}>
            <LineIcon name="trash" size={16} /> Đã xóa
          </button>
          <ExcelLink href="/admin/crm/export" small>Tải Excel</ExcelLink>
        </div>
      </div>

      {stale && (
        <div className="crm-stale" role="status">
          <LineIcon name="refresh" size={18} />
          <span>Bảng chưa xếp / lọc lại theo chỗ vừa sửa (để dòng đang sửa không nhảy chỗ).</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={refreshView}>Sắp xếp / lọc lại</button>
        </div>
      )}

      {!tipHidden && loaded && (
        <div className="crm-tip">
          <Sparkle className="crm-tip-spark" size={18} filled />
          <p>
            <strong>Mẹo:</strong> Đã có danh sách CSKH trong Excel? Mở file Excel → chọn cả bảng (kèm dòng tên cột) → <kbd>Ctrl</kbd>+<kbd>C</kbd> →
            bấm vào một ô bất kỳ ở bảng dưới → <kbd>Ctrl</kbd>+<kbd>V</kbd>. Web tự nhận các cột.
          </p>
          <button
            type="button"
            className="cl-icon-btn"
            aria-label="Ẩn mẹo"
            onClick={() => {
              setTipHidden(true);
              writeLocal(TIP_KEY, '1');
            }}
          >
            <LineIcon name="close" size={18} />
          </button>
        </div>
      )}

      {loaded && active.length === 0 && (
        <div className="crm-empty">
          <Dolphin className="crm-empty-dolphin sea-float" />
          <div>
            <h2>Chưa có khách hàng nào</h2>
            <p>Bấm <strong>"Thêm khách hàng"</strong> hoặc gõ thẳng vào dòng có dấu <strong>+</strong> ở bảng dưới. Có sẵn danh sách trong Excel thì chép rồi dán vào (Ctrl+V).</p>
          </div>
        </div>
      )}
      {loaded && active.length > 0 && rows.length === 0 && (
        <div className="crm-empty is-small">
          <p>Không có khách hàng nào khớp bộ lọc.</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setFilter({ status: '', followUp: false, search: '' })}>Bỏ lọc</button>
        </div>
      )}

      {!loaded ? (
        <div className="crm-loading">
          <Dolphin className="crm-loading-dolphin sea-float" />
          <p>Cá heo đang bơi đi lấy dữ liệu…</p>
        </div>
      ) : (
        <CrmSheet
          ref={sheetRef}
          rows={rows}
          statuses={statuses}
          staffNames={staffNames}
          today={today}
          warnings={warnings}
          sort={sort}
          onSort={handleSort}
          onChangeCells={changeCells}
          onCreate={handleCreate}
          onPaste={handlePaste}
          onDeleteRows={deleteRows}
          onUndo={undo}
          onRedo={redo}
          onEnroll={(contact) => setDialog({ kind: 'enroll', contact })}
          onHistory={(contact) => setDialog({ kind: 'history', contact })}
          onNotify={notify}
        />
      )}

      {dialog?.kind === 'statuses' && (
        <StatusManager custom={custom} counts={stats.counts} onClose={() => setDialog(null)} onChanged={handleStatusesChanged} />
      )}
      {dialog?.kind === 'enroll' && <EnrollDialog contact={dialog.contact} onClose={() => setDialog(null)} onDone={handleEnrolled} />}
      {dialog?.kind === 'history' && <HistoryDialog contact={dialog.contact} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deleted' && <DeletedDialog statusColorOf={statusColorOf} onClose={() => setDialog(null)} onRestored={handleRestoredFromTrash} />}
      {dialog?.kind === 'paste' && (
        <PasteDialog
          grid={dialog.grid}
          mapping={dialog.mapping}
          today={today}
          onClose={() => setDialog(null)}
          onConfirm={(list) => {
            setDialog(null);
            const before = rowsRef.current.length;
            inBatch(() => createRows(list));
            showPasted(list.length, before);
            notify('success', `Đã thêm ${list.length} khách hàng từ Excel.`);
          }}
        />
      )}
      {dialog?.kind === 'overwrite' && (
        <OverwriteDialog
          info={dialog.info}
          onClose={() => setDialog(null)}
          onOverwrite={() => {
            setDialog(null);
            pasteOver(dialog.grid, dialog.mapping, dialog.r, dialog.c);
          }}
          onAppend={() => {
            setDialog(null);
            pasteAsNew(dialog.grid, dialog.mapping);
          }}
        />
      )}

      {party && <Celebration key={`party-${party.at}`} name={party.name} onDone={endParty} />}
      {toast && (
        <div key={`toast-${toast.at}`} className={`crm-toast is-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          <LineIcon name={toast.type === 'error' ? 'alert' : toast.type === 'success' ? 'check' : 'chat'} size={18} />
          <span>{toast.text}</span>
          <button type="button" className="crm-toast-close" aria-label="Đóng" onClick={() => setToast(null)}>
            <LineIcon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Chữ đang hiện trong ô (so với chữ dán vào xem có đổi không) */
function cellTextOf(contact, key) {
  const v = contact[key];
  if (isBlank(v)) return '';
  const col = COLUMNS.find((c) => c.key === key);
  if (col.type === 'money') return String(v);
  if (col.type === 'date') return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return String(v);
}

/** Cá heo nhảy vọt qua màn hình + pháo sáng khi chốt được khách */
function Celebration({ name, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="crm-party" aria-live="polite">
      <div className="crm-party-dolphin" aria-hidden="true"><Dolphin /></div>
      {Array.from({ length: 14 }, (_, i) => {
        // 14 ngôi sao tỏa đều ra mọi hướng từ giữa màn hình
        const angle = (i / 14) * 2 * Math.PI;
        const dist = 150 + (i % 3) * 50;
        const style = { '--i': i, '--dx': `${Math.round(Math.cos(angle) * dist)}px`, '--dy': `${Math.round(Math.sin(angle) * dist)}px` };
        return <Sparkle key={i} className={`crm-party-spark is-${i % 4}`} size={12 + (i % 3) * 6} filled={i % 2 === 0} style={style} />;
      })}
      <div className="crm-party-text">
        <span aria-hidden="true">🎉</span> Chốt thành công{name ? `: ${name}` : ''}!
      </div>
    </div>
  );
}
