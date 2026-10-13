// Hàm dùng chung khi tạo file Excel tải về (danh sách lớp, học phí, cảnh báo...).

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Tô màu dòng tên cột */
function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4FA8' } };
  });
}

/** Tô nền một dòng (dòng tổng, dòng tiêu đề nhóm) */
function fillRow(row, argb, bold = true) {
  row.font = { bold };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });
}

/** "2026-10-13" -> ô ngày của Excel (lưu giờ UTC để Excel hiện đúng ngày) */
const excelDate = (date) => (date ? new Date(`${date}T00:00:00Z`) : null);

/** Định dạng tiền VNĐ trong ô Excel: 1.500.000 */
const MONEY_FMT = '#,##0';

async function sendWorkbook(res, wb, fileName) {
  res.setHeader('Content-Type', XLSX_MIME);
  res.attachment(fileName.replace(/[\\/:*?"<>|]+/g, '-'));
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { XLSX_MIME, styleHeader, fillRow, excelDate, MONEY_FMT, sendWorkbook };
