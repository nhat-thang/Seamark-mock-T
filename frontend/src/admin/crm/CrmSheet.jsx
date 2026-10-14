// Bảng tính kiểu Excel của trang Chăm sóc khách hàng (chỉ admin chính).
// - Bấm một ô rồi gõ là sửa (chữ mới thay chữ cũ, như Excel). Enter / F2 / bấm đúp: sửa tiếp chữ đang có.
// - Mũi tên, Tab, Enter để đi giữa các ô; giữ Shift (hoặc kéo chuột) để chọn nhiều ô; bấm số dòng để chọn cả dòng.
// - Ctrl+C / Ctrl+X / Ctrl+V: chép / cắt / dán (dán được cả bảng từ Excel); Delete: xóa nội dung; Ctrl+Z / Ctrl+Y: hoàn tác / làm lại.
// - Chuột phải: menu. Kéo mép tên cột để đổi độ rộng (nhớ trên máy này). Bấm tên cột để sắp xếp.
// Tọa độ ô: dòng r = 0 là "dòng mới" (gõ vào để thêm khách hàng), r = 1..N là khách hàng thứ r đang hiện; cột c theo COLUMNS.
// Chỉ vẽ các dòng đang nhìn thấy (vài nghìn khách hàng vẫn mượt). Ô đang chọn luôn có một ô nhập (trong suốt khi chưa sửa)
// để nhận phím gõ — kể cả bộ gõ tiếng Việt — và sự kiện chép / dán của trình duyệt.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LineIcon from '../../components/brand/LineIcon.jsx';
import { fold } from '../../utils/rosterImport.js';
import {
  COLUMNS,
  cellText,
  copyText,
  formatDateCell,
  formatMoneyCell,
  isBlank,
  parseCellInput,
  statusOptions,
  toTsv,
} from '../../utils/crm.js';

const ROW_H = 34; // chiều cao một dòng (px) — khớp crm.css
const LETTER_H = 24; // dòng chữ cái A, B, C...
const HEAD_H = 40; // dòng tên cột
const HEAD = LETTER_H + HEAD_H;
const NUM_W = 52; // cột số thứ tự dòng
const OVERSCAN = 8; // vẽ dư vài dòng trên / dưới cho cuộn mượt
const LAST_COL = COLUMNS.length - 1;
const WIDTHS_KEY = 'seamark.crm.widths';
const INPUT_MODE = { phone: 'tel', idNumber: 'numeric', money: 'numeric' };
const DR = { up: -1, down: 1, left: 0, right: 0 };
const DC = { up: 0, down: 0, left: -1, right: 1 };
const QUICK_DATES = {
  contactDate: [['Hôm nay', 0], ['Hôm qua', -1], ['Hôm kia', -2]],
  followUp: [['Hôm nay', 0], ['Mai', 1], ['+3 ngày', 3], ['+1 tuần', 7], ['+2 tuần', 14]],
};
const GHOST = {}; // "dòng mới": chưa có dữ liệu

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const rangeOf = (s) => ({ r1: Math.min(s.ar, s.fr), r2: Math.max(s.ar, s.fr), c1: Math.min(s.ac, s.fc), c2: Math.max(s.ac, s.fc) });
const sameValue = (a, b) => (isBlank(a) ? '' : String(a)) === (isBlank(b) ? '' : String(b));

function loadWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}');
    return COLUMNS.map((c) => (Number.isFinite(saved[c.key]) ? Math.max(60, Math.min(900, saved[c.key])) : c.width));
  } catch {
    return COLUMNS.map((c) => c.width);
  }
}

/** Tên nhân viên CSKH đã dùng, khớp chữ đang gõ (tối đa 6) */
function staffSuggestions(names, text) {
  const t = fold(text);
  return names.filter((n) => fold(n) !== t && (!t || fold(n).includes(t))).slice(0, 6);
}

const CrmSheet = forwardRef(function CrmSheet(props, ref) {
  const {
    rows, statuses, staffNames, today, warnings, sort, onSort,
    onChangeCells, onCreate, onPaste, onDeleteRows, onUndo, onRedo, onEnroll, onHistory, onNotify,
  } = props;
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [sel, setSel] = useState({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const [edit, setEditState] = useState(null); // { text, mode: 'replace' | 'edit', error, hi } — ô đang sửa luôn là ô (ar, ac)
  const [menu, setMenu] = useState(null); // { x, y } menu chuột phải
  const [win, setWin] = useState({ first: 0, last: 40 }); // các dòng đang vẽ
  const [widths, setWidths] = useState(loadWidths);

  // Giá trị mới nhất cho các hàm xử lý sự kiện (tránh dùng nhầm giá trị cũ)
  const selRef = useRef(sel);
  const editRef = useRef(edit);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const staffRef = useRef(staffNames);
  staffRef.current = staffNames;
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const focusNext = useRef(false); // sau lần vẽ tới: đặt con trỏ vào ô đang chọn
  const caretEnd = useRef(false); // ... và đưa con trỏ chữ về cuối
  const scrollNext = useRef(null); // ... và cuộn cho ô này hiện ra
  const drag = useRef(null); // đang kéo chuột chọn: 'cells' | 'rows'
  const ignoreBlur = useRef(false); // đang mở lịch chọn ngày

  const N = rows.length;
  const lefts = useMemo(() => {
    const out = [];
    let x = NUM_W;
    for (const w of widths) {
      out.push(x);
      x += w;
    }
    out.push(x);
    return out;
  }, [widths]);
  const leftsRef = useRef(lefts);
  leftsRef.current = lefts;
  const colorOf = useMemo(() => {
    const m = new Map(statuses.map((s) => [s.name, s.color]));
    return (name) => (name ? m.get(name) || 'gray' : '');
  }, [statuses]);

  const setEdit = useCallback((v) => {
    editRef.current = v;
    setEditState(v);
  }, []);

  /** Chọn ô (ar, ac) — kéo tới (fr, fc) nếu chọn vùng. max: số dòng tối đa (khi vừa thêm khách hàng mà bảng chưa kịp vẽ lại) */
  const select = useCallback((ar, ac, fr = ar, fc = ac, { max, focus = true, scroll = true } = {}) => {
    const lim = max ?? rowsRef.current.length;
    const cr = (r) => Math.max(0, Math.min(lim, r));
    const cc = (c) => Math.max(0, Math.min(LAST_COL, c));
    const next = { ar: cr(ar), ac: cc(ac), fr: cr(fr), fc: cc(fc) };
    selRef.current = next;
    setSel(next);
    if (focus) focusNext.current = true;
    if (scroll) scrollNext.current = { r: next.fr, c: next.fc };
  }, []);

  /** Vùng đang chọn, đã giới hạn trong số dòng hiện có */
  const curRange = () => {
    const s = selRef.current;
    const n = rowsRef.current.length;
    return rangeOf({ ...s, ar: Math.min(s.ar, n), fr: Math.min(s.fr, n) });
  };
  /** Khách hàng trong vùng đang chọn (bỏ "dòng mới") */
  const selectedContacts = () => {
    const { r1, r2 } = curRange();
    return rowsRef.current.slice(Math.max(1, r1) - 1, r2);
  };

  // ----- Sửa ô -----

  function popOptions(col, text) {
    if (col.type === 'status') return statusOptions(statusesRef.current, text);
    if (col.type === 'staff') return staffSuggestions(staffRef.current, text).map((name) => ({ name }));
    return [];
  }

  function startEdit() {
    const { ar: r, ac: c } = selRef.current;
    const col = COLUMNS[c];
    const contact = r > 0 ? rowsRef.current[r - 1] : null;
    if (r > 0 && !contact) return;
    if (col.type === 'status') {
      // Mở danh sách trạng thái: ô gõ để trống (gõ để lọc / thêm mới), chọn sẵn trạng thái hiện tại
      const hi = statusOptions(statusesRef.current, '').findIndex((o) => o.name === (contact?.status || ''));
      setEdit({ text: '', mode: 'edit', error: '', hi: Math.max(0, hi) });
    } else {
      setEdit({ text: contact ? cellText(contact, col) : '', mode: 'edit', error: '', hi: -1 });
      caretEnd.current = true;
    }
    focusNext.current = true;
  }

  /** Ghi giá trị (đã đổi sang dạng chuẩn) vào ô. Trả 'created' nếu vừa thêm khách hàng từ "dòng mới". */
  function applyValue(r, c, value) {
    const col = COLUMNS[c];
    if (r === 0) {
      if (isBlank(value)) return true;
      onCreate({ [col.key]: value });
      return 'created';
    }
    const contact = rowsRef.current[r - 1];
    if (contact && !sameValue(contact[col.key], value)) onChangeCells([{ key: contact.id, field: col.key, value }]);
    return true;
  }

  /**
   * Lưu ô đang sửa. text: chữ chọn từ danh sách (bỏ qua chữ đang gõ).
   * Trả 'created' | true (xong) | false (chữ gõ vào sai: giữ ô đang sửa và báo lỗi ngay dưới ô).
   */
  function commitEdit(text) {
    const ed = editRef.current;
    if (!ed && text === undefined) return true;
    const { ar: r, ac: c } = selRef.current;
    const col = COLUMNS[c];
    let input = text;
    if (input === undefined) {
      input = ed.text;
      const pick = ed.hi >= 0 ? popOptions(col, ed.text)[ed.hi] : null;
      if (pick) input = pick.name;
    }
    const parsed = parseCellInput(col, input, today);
    if (parsed.error) {
      setEdit({ ...(ed || { mode: 'edit', hi: -1 }), text: input, error: parsed.error });
      focusNext.current = true;
      return false;
    }
    setEdit(null);
    return applyValue(r, c, parsed.value);
  }

  /** Sau khi lưu ô: đi tiếp theo phím vừa bấm */
  function afterCommit(res, action) {
    if (!res) return;
    const { ar: r, ac: c } = selRef.current;
    if (res === 'created' && r === 0) {
      // Khách hàng mới hiện ngay dưới "dòng mới" (dòng 1): đi tiếp sang các ô của chính khách hàng đó
      const opt = { max: rowsRef.current.length + 1 };
      if (action === 'up') select(0, c);
      else if (action === 'none' || action === 'down') select(1, c, 1, c, opt);
      else if (action === 'left' || action === 'shiftTab') select(1, Math.max(0, c - 1), undefined, undefined, opt);
      else if (c === LAST_COL) select(0, 0);
      else select(1, c + 1, undefined, undefined, opt);
      return;
    }
    if (action === 'tab' || action === 'shiftTab') tab(action === 'shiftTab');
    else if (DR[action] !== undefined) move(DR[action], DC[action]);
    else focusNext.current = true;
  }

  function pickText(text) {
    afterCommit(commitEdit(text), 'none');
  }
  function pickValue(value) {
    ignoreBlur.current = false;
    const { ar, ac } = selRef.current;
    setEdit(null);
    afterCommit(applyValue(ar, ac, value), 'none');
  }

  /** Đang sửa mà bấm sang chỗ khác: lưu; chữ sai thì giữ ô đang sửa (trả false) */
  function commitBeforeLeave() {
    if (!editRef.current) return true;
    return Boolean(commitEdit());
  }

  // ----- Di chuyển -----

  function move(dr, dc, extend = false) {
    const s = selRef.current;
    if (extend) select(s.ar, s.ac, s.fr + dr, s.fc + dc);
    else select(s.ar + dr, s.ac + dc);
  }
  function tab(back) {
    const s = selRef.current;
    let r = s.ar;
    let c = s.ac + (back ? -1 : 1);
    if (c > LAST_COL && r < rowsRef.current.length) [r, c] = [r + 1, 0];
    if (c < 0 && r > 0) [r, c] = [r - 1, LAST_COL];
    select(r, c);
  }
  function jump(dir, extend) {
    const s = selRef.current;
    let r = extend ? s.fr : s.ar;
    let c = extend ? s.fc : s.ac;
    if (dir === 'up') r = r > 1 ? 1 : 0;
    if (dir === 'down') r = rowsRef.current.length;
    if (dir === 'left') c = 0;
    if (dir === 'right') c = LAST_COL;
    if (extend) select(s.ar, s.ac, r, c);
    else select(r, c);
  }

  // ----- Xóa nội dung, chép, dán -----

  function clearRange() {
    const { c1, c2 } = curRange();
    const changes = [];
    for (const contact of selectedContacts()) {
      for (let c = c1; c <= c2; c++) {
        const col = COLUMNS[c];
        if (!isBlank(contact[col.key])) changes.push({ key: contact.id, field: col.key, value: col.type === 'date' || col.type === 'money' ? null : '' });
      }
    }
    if (!changes.length) return;
    if (changes.length > 20 && !window.confirm(`Xóa nội dung ${changes.length} ô đang chọn?\n\n(Lỡ tay thì bấm "Hoàn tác" hoặc Ctrl+Z để lấy lại.)`)) return;
    onChangeCells(changes);
  }

  function rangeTsv() {
    const { c1, c2 } = curRange();
    return toTsv(selectedContacts().map((contact) => COLUMNS.slice(c1, c2 + 1).map((col) => copyText(contact, col))));
  }

  function copiedMessage() {
    const { c1, c2 } = curRange();
    const n = selectedContacts().length * (c2 - c1 + 1);
    return `Đã chép ${n} ô. Bấm vào ô khác (hoặc mở Excel) rồi Ctrl+V để dán.`;
  }

  function onCopy(e) {
    if (editRef.current) return; // đang sửa: chép chữ đang bôi đen như bình thường
    e.preventDefault();
    if (!selectedContacts().length) return;
    e.clipboardData.setData('text/plain', rangeTsv());
    onNotify('info', copiedMessage());
  }
  function onCut(e) {
    if (editRef.current) return;
    onCopy(e);
    clearRange();
  }
  function onPasteEvent(e) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // Đang sửa một ô mà dán chữ thường (không nhiều ô): dán vào ô như bình thường
    if (editRef.current && !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    if (editRef.current) setEdit(null);
    const s = selRef.current;
    onPaste({ text, r: s.ar, c: s.ac, range: curRange() });
  }

  async function menuCopy(cut) {
    setMenu(null);
    if (!selectedContacts().length) return;
    try {
      await navigator.clipboard.writeText(rangeTsv());
      onNotify('info', copiedMessage());
      if (cut) clearRange();
    } catch {
      onNotify('error', 'Trình duyệt chưa cho chép bằng menu. Hãy bấm Ctrl+C.');
    }
    focusNext.current = true;
  }
  async function menuPaste() {
    setMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      const s = selRef.current;
      onPaste({ text, r: s.ar, c: s.ac, range: curRange() });
    } catch {
      onNotify('error', 'Trình duyệt chưa cho dán bằng menu. Hãy bấm vào ô rồi bấm Ctrl+V.');
    }
  }

  // ----- Phím -----

  function onKeyDown(e) {
    if (e.nativeEvent.isComposing || e.key === 'Process') return; // bộ gõ đang ghép chữ
    const mod = e.ctrlKey || e.metaKey;
    const { key } = e;
    const s = selRef.current;
    const col = COLUMNS[s.ac];
    const ed = editRef.current;

    if (!ed) {
      if (mod && !key.startsWith('Arrow') && key !== 'Home' && key !== 'End') {
        const k = key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          (e.shiftKey ? onRedo : onUndo)();
        } else if (k === 'y') {
          e.preventDefault();
          onRedo();
        } else if (k === 'a') {
          e.preventDefault();
          select(1, 0, rowsRef.current.length, LAST_COL);
        }
        // Ctrl+C / X / V: để trình duyệt phát sự kiện chép / cắt / dán (onCopy / onCut / onPasteEvent)
        return;
      }
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[key];
      if (dir) {
        e.preventDefault();
        setMenu(null);
        if (e.altKey && dir === 'down' && (col.type === 'status' || col.type === 'date' || col.type === 'staff')) startEdit();
        else if (mod) jump(dir, e.shiftKey);
        else move(DR[dir], DC[dir], e.shiftKey);
        return;
      }
      switch (key) {
        case 'Tab':
          e.preventDefault();
          tab(e.shiftKey);
          return;
        case 'Enter':
          e.preventDefault();
          if (e.shiftKey) move(-1, 0);
          else startEdit();
          return;
        case 'F2':
          e.preventDefault();
          startEdit();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          clearRange();
          return;
        case 'Escape':
          if (menu) setMenu(null);
          else select(s.ar, s.ac);
          return;
        case 'Home':
          e.preventDefault();
          if (mod) select(1, 0);
          else select(s.ar, 0);
          return;
        case 'End':
          e.preventDefault();
          if (mod) select(rowsRef.current.length, LAST_COL);
          else select(s.ar, LAST_COL);
          return;
        case 'PageDown':
        case 'PageUp': {
          e.preventDefault();
          const page = Math.max(1, Math.floor(((scrollRef.current?.clientHeight || 600) - HEAD) / ROW_H) - 1);
          move(key === 'PageDown' ? page : -page, 0, e.shiftKey);
          return;
        }
        default:
          return; // chữ / số: ô nhập nhận chữ -> onInput bắt đầu sửa
      }
    }

    // Đang sửa ô
    const opts = popOptions(col, ed.text);
    switch (key) {
      case 'Escape':
        e.preventDefault();
        setEdit(null);
        focusNext.current = true;
        return;
      case 'Enter':
        if (col.type === 'note' && (e.altKey || e.shiftKey)) {
          // Alt+Enter / Shift+Enter: xuống dòng trong ô ghi chú (như Excel)
          e.preventDefault();
          const el = e.currentTarget;
          const at = el.selectionStart;
          setEdit({ ...ed, text: `${ed.text.slice(0, at)}\n${ed.text.slice(el.selectionEnd)}`, mode: 'edit' });
          requestAnimationFrame(() => el.setSelectionRange(at + 1, at + 1));
          return;
        }
        e.preventDefault();
        afterCommit(commitEdit(), opts.length && ed.hi >= 0 ? 'none' : e.shiftKey ? 'up' : 'down');
        return;
      case 'Tab':
        e.preventDefault();
        afterCommit(commitEdit(), e.shiftKey ? 'shiftTab' : 'tab');
        return;
      case 'ArrowDown':
      case 'ArrowUp':
        if (opts.length) {
          // Chọn trong danh sách gợi ý
          e.preventDefault();
          const n = opts.length;
          const down = key === 'ArrowDown';
          const hi = ed.hi < 0 ? (down ? 0 : n - 1) : (ed.hi + (down ? 1 : -1) + n) % n;
          setEdit({ ...ed, hi });
          return;
        }
        if (col.type === 'note' && ed.mode === 'edit') return;
        e.preventDefault();
        afterCommit(commitEdit(), key === 'ArrowDown' ? 'down' : 'up');
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (ed.mode === 'edit') return; // đang sửa chữ có sẵn: mũi tên di chuyển con trỏ chữ
        e.preventDefault();
        afterCommit(commitEdit(), key === 'ArrowLeft' ? 'left' : 'right');
        return;
      default:
    }
  }

  /** Mục được chọn sẵn trong danh sách trạng thái: khớp nhất với chữ đã gõ, chưa gõ gì thì là trạng thái hiện tại */
  function statusHi(text) {
    if (text.trim()) return 0;
    const contact = selRef.current.ar > 0 ? rowsRef.current[selRef.current.ar - 1] : null;
    return Math.max(0, statusOptions(statusesRef.current, '').findIndex((o) => o.name === (contact?.status || '')));
  }

  function onInput(e) {
    const text = e.target.value;
    const col = COLUMNS[selRef.current.ac];
    const ed = editRef.current;
    if (selRef.current.ar > rowsRef.current.length) return;
    const hi = col.type === 'status' ? statusHi(text) : -1;
    // Gõ khi đang chọn ô: bắt đầu sửa, chữ gõ thay chữ cũ (như Excel)
    if (!ed) setEdit({ text, mode: 'replace', error: '', hi });
    else setEdit({ ...ed, text, error: '', hi });
  }

  function onBlur(e) {
    if (ignoreBlur.current || !editRef.current) return;
    const box = e.currentTarget.closest('.crm-editor');
    if (e.relatedTarget && box?.contains(e.relatedTarget)) return;
    // Bấm ra ngoài bảng (thanh công cụ, ô tìm kiếm...) khi đang sửa: lưu luôn ô đó
    focusNext.current = false;
    if (!commitEdit()) {
      const msg = editRef.current?.error;
      setEdit(null);
      onNotify('error', `Ô vừa sửa chưa được lưu: ${msg}`);
    }
    focusNext.current = false;
  }

  // ----- Chuột -----

  function onMouseDown(e) {
    setMenu(null);
    if (e.target.closest('thead')) {
      const letter = e.target.closest('[data-letter]');
      const corner = e.target.closest('[data-corner]');
      if (!letter && !corner) return; // nút sắp xếp, mép kéo độ rộng: xử lý riêng
      e.preventDefault();
      if (!commitBeforeLeave()) return;
      const n = rowsRef.current.length;
      if (corner) select(1, 0, n, LAST_COL);
      else {
        const c = Number(letter.dataset.letter);
        if (e.shiftKey) select(1, selRef.current.ac, n, c);
        else select(1, c, n, c);
      }
      return;
    }
    if (e.target.closest('.crm-editor')) {
      if (editRef.current) return; // đang sửa: bấm trong ô nhập để đặt con trỏ chữ
      // Bấm lại vào ô đang chọn: ô trạng thái mở danh sách chọn; ô khác thì có thể kéo chọn vùng từ đây
      if (e.button === 0 && COLUMNS[selRef.current.ac].type === 'status') {
        e.preventDefault();
        startEdit();
        return;
      }
    }
    const cell = e.target.closest('td[data-c]');
    const num = cell ? null : e.target.closest('th[data-rownum]');
    if (!cell && !num) return;
    const r = Number((cell || num).dataset.r);
    const c = cell ? Number(cell.dataset.c) : 0;
    const s = selRef.current;
    if (e.button === 2) {
      // Chuột phải: bấm trong vùng đang chọn thì giữ vùng đó
      const rg = curRange();
      const inside = r >= rg.r1 && r <= rg.r2 && (num || (c >= rg.c1 && c <= rg.c2));
      if (!inside && commitBeforeLeave()) {
        if (num) select(r, 0, r, LAST_COL);
        else select(r, c);
      }
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault(); // không bôi đen chữ trên trang
    if (!commitBeforeLeave()) return;
    if (num) {
      if (e.shiftKey) select(s.ar, 0, r, LAST_COL);
      else select(r, 0, r, LAST_COL);
      drag.current = 'rows';
    } else {
      if (e.shiftKey) select(s.ar, s.ac, r, c);
      else select(r, c);
      drag.current = 'cells';
    }
  }

  function onMouseOver(e) {
    if (!drag.current) return;
    const s = selRef.current;
    const el = e.target.closest(drag.current === 'rows' ? '[data-r]' : 'td[data-c]');
    if (!el) return;
    const r = Number(el.dataset.r);
    if (drag.current === 'rows') {
      if (r !== s.fr) select(s.ar, 0, r, LAST_COL);
      return;
    }
    const c = Number(el.dataset.c);
    if (r !== s.fr || c !== s.fc) select(s.ar, s.ac, r, c);
  }

  function onDoubleClick(e) {
    if (!e.target.closest('td[data-c]') || e.target.closest('.crm-pop') || editRef.current) return;
    e.preventDefault();
    startEdit();
  }

  function onContextMenu(e) {
    if (!e.target.closest('td[data-c], th[data-rownum]') || e.target.closest('.crm-pop, .crm-editor.is-open')) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    const stop = () => (drag.current = null);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Đóng menu chuột phải khi bấm ra ngoài
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => !e.target.closest('.crm-menu') && setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  // ----- Kéo đổi độ rộng cột -----

  function startResize(e, c) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthsRef.current[c];
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const w = Math.max(60, Math.min(900, Math.round(startW + ev.clientX - startX)));
      setWidths((ws) => ws.map((x, i) => (i === c ? w : x)));
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }
  useEffect(() => {
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(Object.fromEntries(COLUMNS.map((c, i) => [c.key, widths[i]]))));
    } catch {
      // Trình duyệt chặn lưu: độ rộng chỉ giữ tới khi tải lại trang
    }
  }, [widths]);

  // ----- Cuộn, chỉ vẽ dòng đang thấy -----

  const updateWin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = Math.max(0, Math.floor((el.scrollTop - ROW_H) / ROW_H) - OVERSCAN);
    const last = first + Math.ceil(el.clientHeight / ROW_H) + OVERSCAN * 2;
    setWin((w) => (w.first === first && w.last === last ? w : { first, last }));
  }, []);
  useEffect(() => {
    updateWin();
    const ro = new ResizeObserver(updateWin);
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [updateWin]);

  function ensureVisible(r, c) {
    const el = scrollRef.current;
    if (!el) return;
    const top = HEAD + r * ROW_H;
    if (top < el.scrollTop + HEAD) el.scrollTop = top - HEAD;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
    if (c > 0) {
      const left = leftsRef.current[c];
      const right = left + widthsRef.current[c];
      const frozen = NUM_W + widthsRef.current[0];
      if (left < el.scrollLeft + frozen) el.scrollLeft = left - frozen;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    }
  }

  // Sau mỗi lần vẽ: cuộn tới ô vừa chọn, đặt con trỏ vào ô nhập
  useLayoutEffect(() => {
    if (scrollNext.current) {
      ensureVisible(scrollNext.current.r, scrollNext.current.c);
      scrollNext.current = null;
    }
    const el = inputRef.current;
    if (focusNext.current && el) {
      focusNext.current = false;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      // Trang dài: ô đang chọn nằm ngoài màn hình thì cuộn trang tới ô đó
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0) el.scrollIntoView({ block: 'nearest' });
      if (caretEnd.current) {
        caretEnd.current = false;
        const n = el.value.length;
        el.setSelectionRange(n, n);
      }
    }
  });

  // Bảng ít dòng đi (lọc, xóa): đưa ô đang chọn về trong bảng (không cướp con trỏ của ô tìm kiếm)
  useEffect(() => {
    const s = selRef.current;
    if (s.ar > N || s.fr > N) {
      if (editRef.current) setEdit(null);
      select(Math.min(s.ar, N), s.ac, Math.min(s.fr, N), s.fc, { focus: false, scroll: false });
    }
  }, [N, select, setEdit]);

  /** Nút "Thêm khách hàng": mở ô Học sinh của "dòng mới" để gõ */
  function startNewRow() {
    if (!commitBeforeLeave()) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // Bảng đang ở thấp trên màn hình: cuộn trang cho bảng lên đầu để gõ cho thoải mái
    const top = scrollRef.current?.closest('.crm-sheet')?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.4) scrollRef.current.closest('.crm-sheet').scrollIntoView({ block: 'start', behavior: 'smooth' });
    select(0, 0);
    setEdit({ text: '', mode: 'edit', error: '', hi: -1 });
  }

  // Hàm cho trang CSKH gọi (tạo lại mỗi lần vẽ để luôn dùng dữ liệu mới nhất)
  useImperativeHandle(ref, () => ({
    startNewRow,
    /** Chọn một vùng (sau khi dán, hoàn tác...) */
    select(ar, ac, fr, fc, opts) {
      if (editRef.current) setEdit(null);
      select(ar, ac, fr, fc, opts);
    },
    /** Đổi bộ lọc / sắp xếp: về đầu bảng, không lấy con trỏ của ô tìm kiếm */
    reset() {
      if (editRef.current) setEdit(null);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      select(Math.min(1, rowsRef.current.length), selRef.current.ac, undefined, undefined, { focus: false, scroll: false });
    },
    isEditing: () => Boolean(editRef.current),
  }));

  // ----- Vẽ -----

  const S = { ...sel, ar: Math.min(sel.ar, N), fr: Math.min(sel.fr, N) };
  const range = rangeOf(S);
  const anchorContact = S.ar > 0 ? rows[S.ar - 1] : null;
  const anchorCol = COLUMNS[S.ac];

  const editorEl = (
    <CellEditor
      col={anchorCol}
      contact={anchorContact}
      edit={edit}
      inputRef={inputRef}
      today={today}
      statuses={statuses}
      staffNames={staffNames}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPasteEvent}
      onPickText={pickText}
      onPickValue={pickValue}
      onHighlight={(hi) => setEdit({ ...editRef.current, hi })}
      onPickerOpen={() => (ignoreBlur.current = true)}
      onFocus={() => (ignoreBlur.current = false)}
    />
  );

  const rowProps = (i) => {
    const r = i + 1;
    const contact = rows[i];
    const inSel = r >= range.r1 && r <= range.r2;
    const w = warnings.get(contact.id);
    return {
      r,
      contact,
      today,
      colorOf,
      selFrom: inSel ? range.c1 : -1,
      selTo: inSel ? range.c2 : -1,
      activeCol: S.ar === r ? S.ac : -1,
      editor: S.ar === r ? editorEl : null,
      phoneWarn: w?.phone?.text || '',
      phoneTone: w?.phone?.tone || '',
      idWarn: w?.idNumber?.text || '',
      idTone: w?.idNumber?.tone || '',
    };
  };

  // Các dòng cần vẽ: dòng đang thấy + dòng của ô đang chọn (để ô nhập luôn còn đó); khoảng trống thay bằng một dòng cao
  const body = [];
  const first = Math.min(win.first, N);
  const last = Math.min(win.last, N);
  const indices = [];
  for (let i = first; i < last; i++) indices.push(i);
  const ai = S.ar - 1;
  if (ai >= 0 && ai < N && (ai < first || ai >= last)) indices.push(ai);
  indices.sort((a, b) => a - b);
  let prev = -1;
  for (const i of indices) {
    if (i - prev > 1) body.push(<Spacer key={`gap-${i}`} height={(i - prev - 1) * ROW_H} />);
    body.push(<SheetRow key={rows[i].id} {...rowProps(i)} />);
    prev = i;
  }
  if (N - 1 - prev > 0) body.push(<Spacer key="gap-end" height={(N - 1 - prev) * ROW_H} />);

  // Thanh nội dung ô (như thanh công thức của Excel)
  const single = range.r1 === range.r2 && range.c1 === range.c2;
  const address = S.ar === 0 && single
    ? `${anchorCol.letter} · Dòng mới`
    : single
      ? `${anchorCol.letter}${S.ar}`
      : `${COLUMNS[range.c1].letter}${Math.max(1, range.r1)}:${COLUMNS[range.c2].letter}${range.r2}`;
  const fullText = edit ? edit.text : anchorContact ? cellText(anchorContact, anchorCol) : '';
  const warn = anchorContact ? warnings.get(anchorContact.id)?.[anchorCol.key] : null;
  const picked = range.r2 >= 1 ? rows.slice(Math.max(1, range.r1) - 1, range.r2) : [];
  const one = picked.length === 1 ? picked[0] : null;

  // Thanh trạng thái dưới bảng (như Excel): tổng học phí của vùng đang chọn
  const moneyCol = COLUMNS.findIndex((c) => c.type === 'money');
  const moneySum = range.c1 <= moneyCol && moneyCol <= range.c2 && picked.length > 1
    ? picked.reduce((n, c) => n + (c.tuition || 0), 0)
    : null;

  return (
    <div className="crm-sheet">
      <div className="crm-fbar">
        <div className="crm-fbar-addr" title="Ô đang chọn (cột + dòng)">{address}</div>
        <div className="crm-fbar-fx" aria-hidden="true">fx</div>
        <div className={`crm-fbar-text${fullText ? '' : ' is-empty'}`}>
          {fullText || (S.ar === 0 ? 'Gõ vào "dòng mới" (dòng có dấu +) để thêm khách hàng' : single ? 'Ô trống — gõ để nhập' : `${picked.length} dòng đang chọn`)}
        </div>
        <div className="crm-fbar-actions">
          {one?.enrolled && (
            <Link className="crm-fbar-class" to={`/admin/lop-hoc/${one.enrolled.classId}`} title="Mở lớp">
              <LineIcon name="cap" size={16} /> Lớp {one.enrolled.className}{one.enrolled.inactive ? ' (đã nghỉ)' : ''}
            </Link>
          )}
          {one && !one.enrolled && one.serverId && (
            <button type="button" className="crm-mini-btn" onClick={() => onEnroll(one)}>
              <LineIcon name="cap" size={16} /> Thêm vào lớp
            </button>
          )}
          {one && one.serverId && (
            <button type="button" className="crm-mini-btn" onClick={() => onHistory(one)}>
              <LineIcon name="history" size={16} /> Lịch sử
            </button>
          )}
          {picked.length > 0 && (
            <button type="button" className="crm-mini-btn is-danger" onClick={() => onDeleteRows(picked.map((c) => c.id))}>
              <LineIcon name="trash" size={16} /> Xóa {picked.length > 1 ? `${picked.length} dòng` : 'dòng'}
            </button>
          )}
        </div>
      </div>
      {warn && (
        <p className={`crm-fbar-warn is-${warn.tone}`} role="status">
          <LineIcon name={warn.tone === 'known' ? 'users' : 'alert'} size={16} /> {warn.text}
        </p>
      )}

      <div className="crm-scroll" ref={scrollRef} onScroll={() => { updateWin(); if (menu) setMenu(null); }}>
        <table
          className="crm-grid"
          style={{ width: lefts[COLUMNS.length] }}
          role="grid"
          aria-label="Bảng chăm sóc khách hàng"
          aria-rowcount={N + 1}
          aria-colcount={COLUMNS.length}
          onMouseDown={onMouseDown}
          onMouseOver={onMouseOver}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        >
          <colgroup>
            <col style={{ width: NUM_W }} />
            {widths.map((w, i) => <col key={COLUMNS[i].key} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="crm-letters">
              <th className="crm-corner" data-corner="" title="Chọn tất cả" />
              {COLUMNS.map((col, c) => (
                <th key={col.key} data-letter={c} className={`${c === 0 ? 'is-frozen ' : ''}${c >= range.c1 && c <= range.c2 ? 'is-sel' : ''}`}>
                  {col.letter}
                </th>
              ))}
            </tr>
            <tr className="crm-heads">
              <th className="crm-corner crm-corner-2">#</th>
              {COLUMNS.map((col, c) => (
                <th key={col.key} className={`is-${col.type}${c === 0 ? ' is-frozen' : ''}`} aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" className="crm-sort" onClick={() => onSort(col.key)} title="Bấm để sắp xếp theo cột này">
                    <span>{col.label}</span>
                    {sort.key === col.key && <LineIcon name={sort.dir === 'asc' ? 'up' : 'down'} size={14} />}
                  </button>
                  <span className="crm-resize" onPointerDown={(e) => startResize(e, c)} onDoubleClick={() => setWidths((ws) => ws.map((x, i) => (i === c ? col.width : x)))} title="Kéo để đổi độ rộng cột (bấm đúp: về như cũ)" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SheetRow
              ghost
              r={0}
              contact={GHOST}
              today={today}
              colorOf={colorOf}
              selFrom={range.r1 === 0 ? range.c1 : -1}
              selTo={range.r1 === 0 ? range.c2 : -1}
              activeCol={S.ar === 0 ? S.ac : -1}
              editor={S.ar === 0 ? editorEl : null}
            />
            {body}
          </tbody>
        </table>
      </div>

      <div className="crm-statusbar">
        <span>{N} khách hàng đang hiện</span>
        {picked.length > 1 && <span>Đang chọn {picked.length} dòng</span>}
        {moneySum !== null && <span>Tổng học phí vùng chọn: <strong>{formatMoneyCell(moneySum)}đ</strong></span>}
        <span className="crm-statusbar-hint">Enter: sửa ô · Tab: sang phải · Ctrl+C / Ctrl+V: chép, dán · Delete: xóa · Ctrl+Z: hoàn tác · Chuột phải: thêm việc</span>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          count={picked.length}
          one={one}
          onClose={() => setMenu(null)}
          onCopy={() => menuCopy(false)}
          onCut={() => menuCopy(true)}
          onPaste={menuPaste}
          onClear={() => {
            setMenu(null);
            clearRange();
          }}
          onNewRow={() => {
            setMenu(null);
            startNewRow();
          }}
          onDelete={() => {
            setMenu(null);
            onDeleteRows(picked.map((c) => c.id));
          }}
          onEnroll={() => {
            setMenu(null);
            onEnroll(one);
          }}
          onHistory={() => {
            setMenu(null);
            onHistory(one);
          }}
        />
      )}
    </div>
  );
});

export default CrmSheet;

const Spacer = ({ height }) => (
  <tr className="crm-spacer" aria-hidden="true">
    <td colSpan={COLUMNS.length + 1} style={{ height }} />
  </tr>
);

/** Chữ / nhãn hiện trong một ô */
function renderValue(col, c, today, colorOf) {
  const v = c[col.key];
  if (isBlank(v)) return null;
  switch (col.type) {
    case 'status':
      return <span className={`crm-chip is-${colorOf(v)}`}><i aria-hidden="true" />{v}</span>;
    case 'money':
      return formatMoneyCell(v);
    case 'date': {
      const text = formatDateCell(v);
      if (col.key !== 'followUp' || v > today) return text;
      return (
        <span className={`crm-due ${v < today ? 'is-late' : 'is-today'}`} title={v < today ? 'Đã quá hẹn gọi lại' : 'Hôm nay cần gọi lại'}>
          <LineIcon name={v < today ? 'alert' : 'call'} size={13} /> {text}
        </span>
      );
    }
    case 'note':
      return v.replace(/\s*\n+\s*/g, ' · ');
    default:
      if (col.key === 'studentName' && c.enrolled) {
        return (
          <>
            {v}
            <span className="crm-cap" title={`Đã vào lớp ${c.enrolled.className}`}><LineIcon name="cap" size={14} /></span>
          </>
        );
      }
      return v;
  }
}

/** Một dòng của bảng. Chỉ vẽ lại khi dữ liệu / vùng chọn của chính dòng này đổi. */
const SheetRow = memo(function SheetRow({ r, contact, today, colorOf, selFrom, selTo, activeCol, editor, phoneWarn, phoneTone, idWarn, idTone, ghost = false }) {
  const rowSel = selFrom >= 0;
  return (
    <tr className={`crm-row${ghost ? ' is-ghost' : ''}${contact.serverId === null ? ' is-saving' : ''}`}>
      <th scope="row" className={`crm-num${rowSel ? ' is-sel' : ''}`} data-r={r} data-rownum="" title={ghost ? 'Dòng mới: gõ vào để thêm khách hàng' : 'Bấm để chọn cả dòng'}>
        {ghost ? <LineIcon name="plus" size={15} /> : r}
      </th>
      {COLUMNS.map((col, c) => {
        const inSel = rowSel && c >= selFrom && c <= selTo;
        const active = activeCol === c;
        const warn = col.key === 'phone' ? phoneWarn : col.key === 'idNumber' ? idWarn : '';
        const tone = col.key === 'phone' ? phoneTone : idTone;
        const note = col.type === 'note' && contact.note && contact.note.length > 40 ? contact.note : undefined;
        return (
          <td
            key={col.key}
            data-r={r}
            data-c={c}
            role="gridcell"
            aria-selected={inSel || undefined}
            className={`crm-td is-${col.type}${c === 0 ? ' is-frozen' : ''}${inSel ? ' is-sel' : ''}${active ? ' is-active' : ''}`}
            title={warn || note}
          >
            <div className="crm-cell">
              {ghost ? (c === 0 && <span className="crm-ghost-hint">Gõ để thêm mới…</span>) : renderValue(col, contact, today, colorOf)}
            </div>
            {warn && <span className={`crm-tri is-${tone}`} aria-hidden="true" />}
            {active && editor}
          </td>
        );
      })}
    </tr>
  );
});

/**
 * Ô nhập của ô đang chọn. Khi chưa sửa: trong suốt (chỉ để nhận phím gõ, chép / dán).
 * Khi sửa: hiện ra, kèm danh sách trạng thái / gợi ý tên nhân viên / chọn ngày nhanh.
 * Ô nhập giữ nguyên từ lúc chọn tới lúc sửa (không vẽ mới) để bộ gõ tiếng Việt không bị ngắt giữa chừng.
 */
function CellEditor({ col, contact, edit, inputRef, today, statuses, staffNames, onPickText, onPickValue, onHighlight, onPickerOpen, ...handlers }) {
  const open = Boolean(edit);
  const props = {
    ref: inputRef,
    className: 'crm-input',
    value: open ? edit.text : '',
    onChange: handlers.onInput,
    onKeyDown: handlers.onKeyDown,
    onBlur: handlers.onBlur,
    onFocus: handlers.onFocus,
    onCopy: handlers.onCopy,
    onCut: handlers.onCut,
    onPaste: handlers.onPaste,
    spellCheck: false,
    autoComplete: 'off',
    inputMode: open ? INPUT_MODE[col.type] || 'text' : 'none',
    'aria-label': `${col.label}${contact ? ` — ${contact.studentName || contact.parentName || 'khách hàng'}` : ' — dòng mới'}`,
  };
  let pop = null;
  if (open && edit.error) {
    pop = (
      <Pop className="crm-pop-error" role="alert">
        <LineIcon name="alert" size={16} /> {edit.error}
      </Pop>
    );
  } else if (open && col.type === 'status') {
    pop = <StatusPop options={statusOptions(statuses, edit.text)} hi={edit.hi} current={contact?.status || ''} onPick={onPickText} onHover={onHighlight} />;
  } else if (open && col.type === 'staff') {
    const list = staffSuggestions(staffNames, edit.text);
    if (list.length) {
      pop = (
        <Pop className="crm-listpop">
          <ul role="listbox" aria-label="Tên nhân viên đã dùng">
            {list.map((name, i) => (
              <li key={name} role="option" aria-selected={i === edit.hi} className={i === edit.hi ? 'is-hi' : ''} onMouseEnter={() => onHighlight(i)} onClick={() => onPickText(name)}>
                <LineIcon name="user" size={15} /> {name}
              </li>
            ))}
          </ul>
        </Pop>
      );
    }
  } else if (open && col.type === 'date') {
    pop = <DatePop col={col} today={today} current={contact?.[col.key] || ''} onPickValue={onPickValue} onPickerOpen={onPickerOpen} />;
  }
  const placeholder = open
    ? col.type === 'status' ? contact?.status || 'Chọn hoặc gõ trạng thái…' : col.type === 'date' ? 'dd/mm/yyyy, "mai", "+3"…' : col.type === 'money' ? 'ví dụ 1tr5 hoặc 1.500.000' : ''
    : '';
  return (
    <div className={`crm-editor${open ? ' is-open' : ''} is-${col.type}`}>
      {col.type === 'note' ? <textarea {...props} rows={1} placeholder={placeholder} /> : <input {...props} placeholder={placeholder} />}
      {pop}
    </div>
  );
}

/**
 * Khung nổi dưới ô đang sửa (danh sách chọn, chọn ngày, báo lỗi). Bấm vào khung không làm ô nhập mất con trỏ.
 * Phía dưới trong bảng không đủ chỗ thì lật lên trên ô; khung nằm ngoài màn hình thì cuộn trang tới.
 */
function Pop({ className, children, ...rest }) {
  const ref = useRef(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.closest('.crm-scroll')?.getBoundingClientRect();
    const cell = el?.parentElement?.getBoundingClientRect();
    if (!box || !cell) return;
    const below = box.bottom - cell.bottom;
    const above = cell.top - box.top - HEAD;
    if (below < el.offsetHeight + 8 && above > below) setUp(true);
  }, []);
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (r.bottom > window.innerHeight - 8) window.scrollBy({ top: r.bottom - window.innerHeight + 16, behavior: 'smooth' });
    else if (r.top < 8) window.scrollBy({ top: r.top - 16, behavior: 'smooth' });
  }, [up]);
  return (
    <div ref={ref} className={`crm-pop ${className}${up ? ' is-up' : ''}`} onMouseDown={(e) => e.target.tagName !== 'INPUT' && e.preventDefault()} {...rest}>
      {children}
    </div>
  );
}

function StatusPop({ options, hi, current, onPick, onHover }) {
  const listRef = useRef(null);
  // Mục đang chọn luôn nằm trong khung danh sách
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.children[hi];
    if (!item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [hi]);
  return (
    <Pop className="crm-listpop">
      <ul ref={listRef} role="listbox" aria-label="Chọn trạng thái">
        {options.map((o, i) => (
          <li key={`${o.kind}-${o.name}`} role="option" aria-selected={i === hi} className={i === hi ? 'is-hi' : ''} onMouseEnter={() => onHover(i)} onClick={() => onPick(o.name)}>
            {o.kind === 'status' && <span className={`crm-chip is-${o.color}`}><i aria-hidden="true" />{o.name}</span>}
            {o.kind === 'new' && <span className="crm-list-new"><LineIcon name="plus" size={14} /> Thêm trạng thái mới “{o.name}”</span>}
            {o.kind === 'clear' && <span className="crm-list-muted">Để trống (chưa có trạng thái)</span>}
            {o.kind === 'status' && o.name === current && <LineIcon name="check" size={16} />}
          </li>
        ))}
      </ul>
      {!options.some((o) => o.kind === 'new') && <p className="crm-list-hint">Trạng thái khác? Gõ tên mới rồi bấm Enter để thêm vào danh sách.</p>}
    </Pop>
  );
}

function DatePop({ col, today, current, onPickValue, onPickerOpen }) {
  const pickRef = useRef(null);
  function openCalendar() {
    onPickerOpen();
    try {
      pickRef.current.showPicker();
    } catch {
      pickRef.current.focus();
    }
  }
  return (
    <Pop className="crm-datepop">
      <div className="crm-datepop-row">
        {(QUICK_DATES[col.key] || QUICK_DATES.contactDate).map(([label, n]) => (
          <button key={label} type="button" onClick={() => onPickValue(addDays(today, n))}>{label}</button>
        ))}
      </div>
      <div className="crm-datepop-row">
        <button type="button" onClick={openCalendar}><LineIcon name="calendar" size={15} /> Chọn trên lịch</button>
        {current && <button type="button" className="is-muted" onClick={() => onPickValue(null)}>Xóa ngày</button>}
        <input ref={pickRef} type="date" className="crm-datepick" tabIndex={-1} aria-hidden="true" defaultValue={current} onChange={(e) => e.target.value && onPickValue(e.target.value)} />
      </div>
    </Pop>
  );
}

function ContextMenu({ x, y, count, one, onClose, onCopy, onCut, onPaste, onClear, onNewRow, onDelete, onEnroll, onHistory }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // Không để menu tràn ra ngoài màn hình
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - width - 8), top: Math.min(y, window.innerHeight - height - 8) });
  }, [x, y]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const item = (icon, label, onClick, kbd, danger = false) => (
    <button type="button" role="menuitem" className={danger ? 'is-danger' : ''} onClick={onClick}>
      <LineIcon name={icon} size={16} />
      <span>{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
  return (
    <div className="crm-menu" role="menu" ref={ref} style={pos} onMouseDown={(e) => e.preventDefault()}>
      {count > 0 && item('copy', 'Sao chép', onCopy, 'Ctrl+C')}
      {count > 0 && item('minus', 'Cắt', onCut, 'Ctrl+X')}
      {item('paste', 'Dán', onPaste, 'Ctrl+V')}
      {count > 0 && item('close', 'Xóa nội dung ô', onClear, 'Delete')}
      <hr />
      {item('plus', 'Thêm khách hàng mới', onNewRow)}
      {one && one.serverId && !one.enrolled && item('cap', 'Thêm vào lớp…', onEnroll)}
      {one && one.serverId && item('history', 'Lịch sử thay đổi…', onHistory)}
      {count > 0 && (
        <>
          <hr />
          {item('trash', count > 1 ? `Xóa ${count} dòng` : 'Xóa dòng này', onDelete, null, true)}
        </>
      )}
    </div>
  );
}
