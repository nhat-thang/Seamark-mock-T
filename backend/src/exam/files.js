// File ảnh / audio trong đề.
//
// Trong nội dung đề, file được nhắc tới bằng TÊN GỐC (ví dụ "q1.jpg", như ghi trong Excel).
// Trên đĩa, file được lưu bằng tên ngẫu nhiên (stored_name) trong DATA_DIR/uploads.
// Khi xuất bản, bản xuất bản ghi lại bảng "tên gốc -> stored_name" (content.files)
// để về sau admin đổi / xóa file trong bản nháp cũng không làm hỏng bản đã xuất bản.

const key = (name) => String(name || '').toLowerCase();

/** Liệt kê mọi chỗ trong đề cần file: { name, where, kind: 'image' | 'audio' } */
function listFileRefs(content) {
  const refs = [];
  const audio = content?.audio || {};
  if (audio.full) refs.push({ name: audio.full, where: 'Audio cả bài Listening', kind: 'audio' });
  for (const p of [1, 2, 3, 4]) {
    if (audio.parts?.[p]) refs.push({ name: audio.parts[p], where: `Audio Part ${p}`, kind: 'audio' });
  }
  // Đề tự thiết kế: audio cho cả phần
  if (content?.examType === 'CUSTOM') {
    (content.parts || []).forEach((p, i) => {
      if (p.audio) refs.push({ name: p.audio, where: `Audio của "${p.name || `Part ${i + 1}`}"`, kind: 'audio' });
    });
  }
  for (const g of content?.groups || []) {
    for (const img of g.passageImages || []) refs.push({ name: img, where: `Ảnh đoạn văn nhóm ${g.code}`, kind: 'image' });
    if (g.image) refs.push({ name: g.image, where: `Ảnh kèm nhóm ${g.code}`, kind: 'image' });
    if (g.audio) refs.push({ name: g.audio, where: `Audio nhóm ${g.code}`, kind: 'audio' });
  }
  for (const q of content?.questions || []) {
    if (q.image) refs.push({ name: q.image, where: `Ảnh câu ${q.no}`, kind: 'image' });
    if (q.audio) refs.push({ name: q.audio, where: `Audio câu ${q.no}`, kind: 'audio' });
  }
  return refs;
}

/** Bảng tên gốc (chữ thường) -> stored_name, chỉ cho những file đề đang dùng */
function buildFilesMap(content, mediaRows) {
  const byName = new Map(mediaRows.map((m) => [key(m.original_name), m.stored_name]));
  const files = {};
  for (const ref of listFileRefs(content)) {
    const stored = byName.get(key(ref.name));
    if (stored) files[key(ref.name)] = stored;
  }
  return files;
}

/**
 * Đổi tên file trong nội dung đề thành đường dẫn tải về (/api/files/...), dùng bảng files.
 * File không có trong bảng -> null (không hiện).
 */
function withFileUrls(content, files = content?.files || {}) {
  const url = (name) => {
    if (!name) return null;
    const stored = files[key(name)];
    return stored ? `/api/files/${stored}` : null;
  };
  const audioParts = {};
  for (const p of [1, 2, 3, 4]) audioParts[p] = url(content.audio?.parts?.[p]);
  return {
    ...content,
    files: undefined,
    audio: { full: url(content.audio?.full), parts: audioParts },
    parts: content.parts ? content.parts.map((p) => ({ ...p, audio: url(p.audio) })) : content.parts,
    groups: (content.groups || []).map((g) => ({
      ...g,
      passageImages: (g.passageImages || []).map(url).filter(Boolean),
      image: url(g.image),
      audio: url(g.audio),
    })),
    questions: (content.questions || []).map((q) => ({ ...q, image: url(q.image), audio: url(q.audio) })),
  };
}

module.exports = { listFileRefs, buildFilesMap, withFileUrls, fileKey: key };
