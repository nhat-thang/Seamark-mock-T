// Tạo file Excel theo đúng mẫu (3 trang, đúng tên cột) từ dữ liệu đề — dùng cho test import.
const ExcelJS = require('exceljs');

const KIND_LABELS = {
  conversation: 'Hội thoại',
  talk: 'Bài nói',
  text: 'Đoạn văn điền từ',
  single: 'Đoạn văn đơn',
  double: 'Đoạn văn đôi',
  triple: 'Đoạn văn ba',
};

/**
 * @param {object} content nội dung đề
 * @param {object} info { code, title, duration, note, audioFull }
 * @param {(wb) => void} [tweak] sửa workbook trước khi xuất (để tạo file lỗi)
 */
async function buildWorkbook(content, info = {}, tweak) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Hướng dẫn').addRow(['Hướng dẫn điền đề']);

  const infoSheet = wb.addWorksheet('Thông tin đề');
  infoSheet.addRow(['Mục', 'Giá trị', 'Ghi chú']);
  infoSheet.addRow(['Mã đề', info.code ?? '']);
  infoSheet.addRow(['Tên đề', info.title ?? '']);
  infoSheet.addRow(['Thời gian (phút)', info.duration ?? 120]);
  infoSheet.addRow(['Ghi chú nội bộ', info.note ?? '']);
  infoSheet.addRow(['Audio cả bài Listening', info.audioFull ?? '']);
  for (const p of [1, 2, 3, 4]) infoSheet.addRow([`Audio Part ${p}`, '']);

  const gs = wb.addWorksheet('Nhóm câu');
  // Cố ý đổi thứ tự cột + thêm khoảng trắng thừa: parser phải đọc theo TÊN cột
  gs.addRow(['Mã nhóm', 'Part', 'Loại', 'Từ câu', 'Đến câu', '  Đoạn văn (chữ) ', 'Ảnh đoạn văn', 'Ảnh kèm']);
  for (const g of content.groups) {
    gs.addRow([g.code, g.part, KIND_LABELS[g.kind], g.from, g.to, g.passage, (g.passageImages || []).join('; '), g.image || '']);
  }

  const qs = wb.addWorksheet('Câu hỏi');
  qs.addRow(['Số câu', 'Part', 'Mã nhóm', 'Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án', 'Ảnh', 'Giải thích']);
  for (const q of content.questions) {
    qs.addRow([q.no, q.part, q.groupCode || '', q.question, q.options.A, q.options.B, q.options.C, q.options.D ?? '',
      q.answer, q.image || '', q.explanation]);
  }

  if (tweak) tweak(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildWorkbook };
