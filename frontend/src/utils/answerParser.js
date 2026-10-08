// Đọc chuỗi đáp án dán vào ô "Nhập nhanh đáp án".
// Hỗ trợ 2 kiểu:
//   1) Có số câu:   "101A 102C 103B"  /  "101.A, 102-C"  /  "101 D: chưa trả lời"  (mỗi cặp số + chữ)
//   2) Chỉ có chữ:  "ACBD DCBA ..."   -> gán lần lượt từ câu startNo trở đi (bỏ qua khoảng trắng, dấu phẩy)
// Trả về { answers: { [số câu]: 'A' }, errors: [chuỗi lỗi] }

const PART2_FROM = 7;
const PART2_TO = 31;

function checkLetter(no, letter, errors) {
  if (no < 1 || no > 200) {
    errors.push(`Câu ${no}: số câu phải từ 1 đến 200.`);
    return false;
  }
  if (no >= PART2_FROM && no <= PART2_TO && letter === 'D') {
    errors.push(`Câu ${no} (Part 2) chỉ có A, B, C.`);
    return false;
  }
  return true;
}

export function parseAnswerText(text, startNo = 1) {
  const answers = {};
  const errors = [];
  const src = String(text || '').toUpperCase();

  if (/\d/.test(src)) {
    // Kiểu 1: tìm từng cặp "số + (dấu phân cách) + chữ cái"
    const re = /(\d{1,3})\s*[.:\-)]?\s*([A-Z])(?![A-Z])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const no = Number(m[1]);
      const letter = m[2];
      if (!'ABCD'.includes(letter)) {
        errors.push(`Câu ${no}: "${letter}" không phải đáp án hợp lệ (A, B, C, D).`);
        continue;
      }
      if (!checkLetter(no, letter, errors)) continue;
      if (answers[no] && answers[no] !== letter) errors.push(`Câu ${no} xuất hiện 2 lần với 2 đáp án khác nhau.`);
      answers[no] = letter;
    }
  } else {
    // Kiểu 2: chuỗi chữ cái liên tiếp
    const letters = src.replace(/[\s,;.|/-]/g, '');
    for (let i = 0; i < letters.length; i++) {
      const no = startNo + i;
      const letter = letters[i];
      if (!'ABCD'.includes(letter)) {
        errors.push(`Ký tự thứ ${i + 1} (câu ${no}): "${letter}" không phải đáp án hợp lệ.`);
        continue;
      }
      if (checkLetter(no, letter, errors)) answers[no] = letter;
    }
  }
  return { answers, errors };
}
