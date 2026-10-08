import './PassageText.css';

// Hiển thị đoạn văn của đề. Quy ước trong nội dung:
//   "---"           -> đường ngăn giữa các văn bản (đoạn đôi / đoạn ba)
//   dòng bắt đầu "|" -> một hàng của bảng (hàng đầu là tiêu đề)
//   "__(131)__"     -> chỗ trống của câu 131
// Chỉ dùng phần tử React thường (KHÔNG dùng dangerouslySetInnerHTML) nên nội dung luôn được escape.

function parseBlocks(text) {
  const blocks = [];
  let para = [];
  let table = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', lines: para });
    para = [];
  };
  const flushTable = () => {
    if (table.length) blocks.push({ type: 'table', rows: table });
    table = [];
  };

  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      flushPara();
      flushTable();
      blocks.push({ type: 'hr' });
    } else if (trimmed.startsWith('|')) {
      flushPara();
      table.push(trimmed.replace(/^\|/, '').split('|').map((c) => c.trim()));
    } else if (trimmed === '') {
      flushPara();
      flushTable();
    } else {
      flushTable();
      para.push(line);
    }
  }
  flushPara();
  flushTable();
  return blocks;
}

// Tô nổi chỗ trống "__(131)__"
function withBlanks(line) {
  const parts = line.split(/__\((\d+)\)__/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="passage-blank">({part})</span>
    ) : (
      part
    )
  );
}

export default function PassageText({ text }) {
  const blocks = parseBlocks(text);
  let docNo = 1;
  const hasMultipleDocs = blocks.some((b) => b.type === 'hr');

  return (
    <div className="passage">
      {hasMultipleDocs && <p className="passage-doc-label">Văn bản {docNo}</p>}
      {blocks.map((b, i) => {
        if (b.type === 'hr') {
          docNo += 1;
          return (
            <div key={i} className="passage-divider">
              <span>Văn bản {docNo}</span>
            </div>
          );
        }
        if (b.type === 'table') {
          const [head, ...rows] = b.rows;
          return (
            <div key={i} className="passage-table-wrap">
              <table className="passage-table">
                <thead>
                  <tr>{head.map((c, j) => <th key={j}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i} className="passage-p">
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {withBlanks(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
