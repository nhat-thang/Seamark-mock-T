// File trong đề (bản nháp): nội dung ghi TÊN file, cần đổi sang đường dẫn để hiển thị.

const key = (name) => String(name || '').toLowerCase();

/** Tạo hàm tên file -> đường dẫn từ danh sách media của đề */
export function fileResolver(media) {
  const map = new Map((media || []).map((m) => [key(m.name), m.url]));
  return (name) => (name ? map.get(key(name)) || null : null);
}

/** Đổi mọi tên file trong nội dung đề thành đường dẫn (giống server làm cho học viên) */
export function resolveContentFiles(content, media) {
  const url = fileResolver(media);
  const parts = {};
  for (const p of [1, 2, 3, 4]) parts[p] = url(content.audio?.parts?.[p]);
  return {
    ...content,
    audio: { full: url(content.audio?.full), parts },
    parts: content.parts ? content.parts.map((p) => ({ ...p, audio: url(p.audio) })) : content.parts,
    groups: (content.groups || []).map((g) => ({
      ...g,
      passageImages: (g.passageImages || []).map(url).filter(Boolean),
      image: url(g.image),
      audio: url(g.audio),
    })),
    questions: content.questions.map((q) => ({ ...q, image: url(q.image), audio: url(q.audio) })),
  };
}

/**
 * Các "chỗ cần file" trong đề: { id, label, kind, name, set(content, newName) -> content }
 * Gồm chỗ đã ghi tên file và chỗ còn trống (ảnh Part 1, audio Listening).
 */
export function fileSlots(content) {
  if (content.examType === 'CUSTOM') return customFileSlots(content);
  const slots = [];
  const hasListening = content.questions.some((q) => q.part <= 4);
  const audio = content.audio || { full: null, parts: {} };

  const setAudio = (part) => (c, name) => ({
    ...c,
    audio: part === 'full' ? { ...c.audio, full: name } : { ...c.audio, parts: { ...c.audio.parts, [part]: name } },
  });
  if (hasListening || audio.full) {
    slots.push({ id: 'audio-full', label: 'Audio cả bài Listening', kind: 'audio', name: audio.full, set: setAudio('full') });
  }
  for (const p of [1, 2, 3, 4]) {
    const hasPart = content.questions.some((q) => q.part === p);
    if (audio.parts?.[p] || (hasPart && !audio.full)) {
      slots.push({ id: `audio-${p}`, label: `Audio Part ${p}`, kind: 'audio', name: audio.parts?.[p] || null, set: setAudio(p) });
    }
  }

  for (const g of content.groups || []) {
    (g.passageImages || []).forEach((img, i) => {
      slots.push({
        id: `g-${g.code}-p${i}`,
        label: `Ảnh đoạn văn nhóm ${g.code}`,
        kind: 'image',
        name: img,
        set: (c, name) => ({
          ...c,
          groups: c.groups.map((x) =>
            x.code === g.code
              ? { ...x, passageImages: name ? x.passageImages.map((v, j) => (j === i ? name : v)) : x.passageImages.filter((_, j) => j !== i) }
              : x
          ),
        }),
      });
    });
    if (g.image) {
      slots.push({
        id: `g-${g.code}-img`,
        label: `Ảnh kèm nhóm ${g.code}`,
        kind: 'image',
        name: g.image,
        set: (c, name) => ({ ...c, groups: c.groups.map((x) => (x.code === g.code ? { ...x, image: name } : x)) }),
      });
    }
  }

  for (const q of content.questions) {
    if (q.image || q.part === 1) {
      slots.push({
        id: `q-${q.no}`,
        label: `Ảnh câu ${q.no}`,
        kind: 'image',
        name: q.image,
        set: (c, name) => ({ ...c, questions: c.questions.map((x) => (x.no === q.no ? { ...x, image: name } : x)) }),
      });
    }
  }
  return slots;
}

/** Đề tự thiết kế: chỉ liệt kê những chỗ đã ghi tên file (thêm file mới ở tab "Soạn đề") */
function customFileSlots(content) {
  const slots = [];
  content.parts.forEach((p, i) => {
    if (p.audio) {
      slots.push({
        id: `p-${i}`, label: `Audio "${p.name || `Part ${i + 1}`}"`, kind: 'audio', name: p.audio,
        set: (c, name) => ({ ...c, parts: c.parts.map((x, j) => (j === i ? { ...x, audio: name } : x)) }),
      });
    }
  });
  for (const g of content.groups) {
    const setG = (patch) => (c) => ({ ...c, groups: c.groups.map((x) => (x.code === g.code ? { ...x, ...patch(x) } : x)) });
    (g.passageImages || []).forEach((img, i) => {
      slots.push({
        id: `g-${g.code}-p${i}`, label: `Ảnh đoạn văn nhóm ${g.code}`, kind: 'image', name: img,
        set: (c, name) => setG((x) => ({ passageImages: name ? x.passageImages.map((v, j) => (j === i ? name : v)) : x.passageImages.filter((_, j) => j !== i) }))(c),
      });
    });
    if (g.image) slots.push({ id: `g-${g.code}-img`, label: `Ảnh kèm nhóm ${g.code}`, kind: 'image', name: g.image, set: (c, name) => setG(() => ({ image: name }))(c) });
    if (g.audio) slots.push({ id: `g-${g.code}-audio`, label: `Audio nhóm ${g.code}`, kind: 'audio', name: g.audio, set: (c, name) => setG(() => ({ audio: name }))(c) });
  }
  for (const q of content.questions) {
    const setQ = (patch) => (c) => ({ ...c, questions: c.questions.map((x) => (x.id === q.id ? { ...x, ...patch } : x)) });
    if (q.image) slots.push({ id: `q-${q.id}-img`, label: `Ảnh câu ${q.no}`, kind: 'image', name: q.image, set: (c, name) => setQ({ image: name })(c) });
    if (q.audio) slots.push({ id: `q-${q.id}-audio`, label: `Audio câu ${q.no}`, kind: 'audio', name: q.audio, set: (c, name) => setQ({ audio: name })(c) });
  }
  return slots;
}

export const mediaKind = (m) => (String(m.mime).startsWith('audio') ? 'audio' : 'image');
export const sameFile = (a, b) => key(a) === key(b);

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
