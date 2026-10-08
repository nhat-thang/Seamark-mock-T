// Chia đề thành các "trang" để hiển thị khi làm bài:
// - câu thuộc nhóm (Part 3, 4, 6, 7 / nhóm đọc hiểu của đề tự thiết kế): cả nhóm một trang, đoạn văn bên cạnh câu hỏi
// - câu lẻ: mỗi câu một trang
// Thứ tự trang theo đúng thứ tự câu server gửi xuống (đề xáo trộn thì đã xáo sẵn).
import { partsOf, shownNo } from './parts.js';

// Giữ lại cho các chỗ cũ (đề TOEIC); chỗ mới dùng partName(content, no)
export const PART_TITLES = Object.fromEntries(partsOf({}).map((p) => [p.no, p.name]));

export const GROUP_KIND_LABELS = {
  single: 'Đoạn đơn',
  double: 'Đoạn đôi',
  triple: 'Đoạn ba',
  reading: 'Nhóm đọc hiểu',
};

export function buildPages(content) {
  const groupsByCode = new Map((content.groups || []).map((g) => [g.code, g]));
  const pages = [];
  const pageOfGroup = new Map();

  for (const q of content.questions) {
    const group = q.groupCode ? groupsByCode.get(q.groupCode) : null;
    if (group) {
      if (!pageOfGroup.has(group.code)) {
        pageOfGroup.set(group.code, pages.length);
        pages.push({ key: group.code, part: q.part, group, questions: [] });
      }
      pages[pageOfGroup.get(group.code)].questions.push(q);
    } else {
      pages.push({ key: `q${q.no}`, part: q.part, group: null, questions: [q] });
    }
  }
  // Đánh dấu trang đầu tiên của mỗi phần (để hiện tên phần + lời dặn)
  const seen = new Set();
  for (const p of pages) {
    p.firstOfPart = !seen.has(p.part);
    seen.add(p.part);
  }
  return pages;
}

/** Map số câu -> vị trí trang chứa câu đó */
export function pageIndexByQuestion(pages) {
  const map = new Map();
  pages.forEach((p, i) => p.questions.forEach((q) => map.set(q.no, i)));
  return map;
}

/** Nhóm câu theo phần (cho bảng số câu): [[số phần, tên phần, [{ no, label }]]] theo thứ tự câu */
export function questionsByPart(content) {
  const names = new Map(partsOf(content).map((p) => [p.no, p.name]));
  const parts = new Map();
  for (const q of content.questions) {
    if (!parts.has(q.part)) parts.set(q.part, []);
    parts.get(q.part).push({ no: q.no, label: shownNo(q) });
  }
  return [...parts.entries()].map(([no, items]) => [no, names.get(no) || `Part ${no}`, items]);
}
