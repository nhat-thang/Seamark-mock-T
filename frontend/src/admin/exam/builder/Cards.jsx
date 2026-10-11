// Các thẻ không phải question: tiêu đề đề, đầu Part, khối chữ / ảnh / audio.
import PassageText from '../../../components/PassageText.jsx';
import Icon, { IconButton } from './icons.jsx';
import { AutoText, DraftAudio, DraftImage, Menu } from './widgets.jsx';

/** Thẻ tiêu đề trên cùng: tên đề (sửa được) + mô tả đề (hiện cho học viên trước khi làm bài) */
export function TitleCard({ selected, title, description, onTitle, onDescription }) {
  if (!selected) {
    return (
      <>
        <h2 className="fb-form-title">{title || 'Đề chưa có tên'}</h2>
        <p className={`fb-form-desc ${description ? '' : 'is-empty'}`}>{description || 'Mô tả đề'}</p>
      </>
    );
  }
  return (
    <>
      <input className="fb-form-title-input" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Tên đề" aria-label="Tên đề" />
      <AutoText
        className="fb-form-desc-input"
        value={description}
        onChange={onDescription}
        placeholder="Mô tả đề (không bắt buộc — học viên thấy trước khi làm bài)"
        aria-label="Mô tả đề"
      />
    </>
  );
}

/** Đầu một Part ("Phần 2 trên 3"): tên, lời dặn, audio cho cả part */
export function PartCard({ part, no, total, count, selected, ctx }) {
  const set = (patch) => ctx.saveP(no, patch);
  const audioItem = {
    label: part.audio ? 'Đổi audio của part' : 'Thêm audio cho cả part',
    onClick: () => ctx.openPicker({ kinds: ['audio'], title: 'Audio cho cả part', onPick: (name) => set({ audio: name }) }),
  };
  return (
    <>
      {selected ? (
        <>
          <input className="fb-part-title-input" value={part.name} onChange={(e) => set({ name: e.target.value })} placeholder={`Part ${no}`} aria-label="Tên part" />
          <AutoText
            className="fb-desc-input"
            value={part.directions}
            onChange={(v) => set({ directions: v })}
            placeholder="Lời dặn (không bắt buộc — hiện trước question đầu tiên của part)"
            aria-label="Lời dặn của part"
          />
        </>
      ) : (
        <>
          <h3 className="fb-part-title">{part.name || `Part ${no}`}</h3>
          {part.directions && <p className="fb-q-desc">{part.directions}</p>}
        </>
      )}
      {part.audio && (
        <div className="fb-audio-row">
          <DraftAudio name={part.audio} url={ctx.url(part.audio)} />
          {selected && <IconButton icon="close" label="Xóa audio của part" onClick={() => set({ audio: null })} />}
        </div>
      )}
      <p className="fb-hint">{count} question</p>
      {selected && (
        <div className="fb-footer">
          <span className="fb-spacer" />
          <IconButton icon="audio" label={audioItem.label} onClick={audioItem.onClick} />
          <IconButton icon="delete" label="Xóa part (các question gộp vào part bên cạnh)" disabled={total <= 1} onClick={() => ctx.remove(`p:${no}`)} />
          <Menu
            label="Tùy chọn khác của part"
            items={[
              { label: 'Chuyển part lên', disabled: no === 1, onClick: () => ctx.movePart(no, -1) },
              { label: 'Chuyển part xuống', disabled: no === total, onClick: () => ctx.movePart(no, 1) },
              audioItem,
            ]}
          />
        </div>
      )}
    </>
  );
}

const BLOCK_NAME = { text: 'Khối tiêu đề và mô tả', image: 'Khối ảnh', audio: 'Khối audio' };

/**
 * Khối không phải question: tiêu đề + mô tả (đoạn văn), ảnh, audio.
 * Các question ngay bên dưới có vạch nối bên trái là "thuộc khối": học viên thấy khối bên cạnh các question đó.
 */
export function BlockCard({ g, selected, memberCount, ctx }) {
  const set = (patch) => ctx.saveG(g.code, patch);
  const url = ctx.url;
  const images = g.passageImages || [];
  const addImage = () =>
    ctx.openPicker({ kinds: ['image'], title: 'Thêm ảnh vào khối', onPick: (name) => set({ passageImages: [...images.filter((x) => x !== name), name] }) });
  const pickAudio = () => ctx.openPicker({ kinds: ['audio'], title: 'Audio của khối', onPick: (name) => set({ audio: name }) });
  const empty = !g.title && !g.passage && !images.length && !g.image && !g.audio;

  return (
    <>
      <p className="fb-q-no">{BLOCK_NAME[g.blockType] || BLOCK_NAME.text}</p>
      {selected ? (
        <>
          <input className="fb-block-title-input" value={g.title} onChange={(e) => set({ title: e.target.value })} placeholder="Tiêu đề" aria-label="Tiêu đề khối" />
          <AutoText
            className="fb-desc-input"
            value={g.passage}
            onChange={(v) => set({ passage: v })}
            placeholder="Mô tả / đoạn văn (không bắt buộc)"
            aria-label="Mô tả hoặc đoạn văn của khối"
          />
          <p className="fb-hint">
            Dòng chỉ có <code>---</code> để ngăn hai văn bản; dòng bắt đầu bằng <code>|</code> là một hàng của bảng.
          </p>
        </>
      ) : (
        <>
          {g.title && <h3 className="fb-block-title">{g.title}</h3>}
          {g.passage && (
            <div className="fb-passage">
              <PassageText text={g.passage} />
            </div>
          )}
          {empty && <p className="fb-q-title is-empty">Khối chưa có nội dung — bấm vào để soạn</p>}
        </>
      )}

      {[...images, ...(g.image ? [g.image] : [])].map((name) => (
        <div key={name} className="fb-media fb-align-left">
          <div className="fb-media-inner">
            <DraftImage name={name} url={url(name)} className="fb-q-image" />
            {selected && (
              <div className="fb-media-menu">
                <IconButton
                  icon="close"
                  label={`Xóa ảnh ${name}`}
                  onClick={() => set(name === g.image ? { image: null } : { passageImages: images.filter((x) => x !== name) })}
                />
              </div>
            )}
          </div>
        </div>
      ))}
      {g.audio && (
        <div className="fb-audio-row">
          <DraftAudio name={g.audio} url={url(g.audio)} />
          {selected && <IconButton icon="close" label="Xóa audio của khối" onClick={() => set({ audio: null })} />}
        </div>
      )}

      {selected && g.blockType === 'image' && !images.length && (
        <button type="button" className="btn btn-secondary btn-small" onClick={addImage}>
          <Icon name="image" size={20} /> Chọn ảnh
        </button>
      )}
      {selected && g.blockType === 'audio' && !g.audio && (
        <button type="button" className="btn btn-secondary btn-small" onClick={pickAudio}>
          <Icon name="audio" size={20} /> Chọn audio
        </button>
      )}

      {selected && (
        <>
          <p className="fb-hint">
            {memberCount
              ? `${memberCount} question ngay bên dưới (có vạch nối bên trái) thuộc khối này — học viên thấy khối bên cạnh các question đó.`
              : 'Chưa có question nào thuộc khối này. Bấm ⊕ ở thanh bên phải để thêm question ngay dưới khối.'}
          </p>
          <div className="fb-footer">
            <span className="fb-spacer" />
            <IconButton icon="image" label="Thêm ảnh vào khối" onClick={addImage} />
            <IconButton icon="audio" label={g.audio ? 'Đổi audio của khối' : 'Thêm audio vào khối'} onClick={pickAudio} />
            <IconButton icon="copy" label="Nhân bản khối" onClick={() => ctx.duplicate(`g:${g.code}`)} />
            <IconButton icon="delete" label="Xóa khối (giữ các question)" onClick={() => ctx.remove(`g:${g.code}`)} />
          </div>
        </>
      )}
    </>
  );
}
