import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet } from '../utils/api.js';
import { buildPages, GROUP_KIND_LABELS, pageIndexByQuestion } from '../utils/examLayout.js';
import { partName, shownNo } from '../utils/parts.js';
import PassageText from '../components/PassageText.jsx';
import QuestionCard, { hideOptionsFor } from '../exam/QuestionCard.jsx';
import QuestionNav from '../exam/QuestionNav.jsx';
import { GroupImages, ListeningAudio, PartIntro } from '../exam/PageMedia.jsx';
import { resolveContentFiles } from '../utils/fileRefs.js';
import '../exam/exam.css';

// Xem trước BẢN NHÁP như học viên. Không tính giờ, không lưu gì.
// Có nút "Hiện đáp án" để giáo viên rà lại đáp án và giải thích.
export default function ExamPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/admin/exams/${id}`)
      .then(setData)
      .catch((err) => {
        if (err.status === 401) navigate('/admin/dang-nhap', { replace: true });
        else setError(err.message);
      });
  }, [id, navigate]);

  if (error) return <main className="simple-center"><p className="alert-error">{error}</p></main>;
  if (!data) return <main className="simple-center"><p className="muted">Đang tải…</p></main>;
  if (data.content.questions.length === 0) {
    return (
      <main className="simple-center">
        <div className="card exam-message-card">
          <p>Đề "{data.exam.title}" chưa có câu hỏi nào để xem trước.</p>
          <button type="button" className="btn btn-secondary" onClick={() => window.close()}>Đóng</button>
        </div>
      </main>
    );
  }
  // Đổi tên file trong bản nháp thành đường dẫn để hiện ảnh / phát audio
  return <Preview exam={data.exam} content={resolveContentFiles(data.content, data.media)} />;
}

function Preview({ exam, content }) {
  const pages = useMemo(() => buildPages(content), [content]);
  const pageOf = useMemo(() => pageIndexByQuestion(pages), [pages]);
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showKey, setShowKey] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const page = pages[pageIndex];
  const first = shownNo(page.questions[0]);
  const last = shownNo(page.questions[page.questions.length - 1]);

  function goToQuestion(no) {
    setPageIndex(pageOf.get(no) ?? 0);
    setNavOpen(false);
    setTimeout(() => document.getElementById(`q-${no}`)?.scrollIntoView({ block: 'center' }), 50);
  }
  function goToPage(i) {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, i)));
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="exam-page">
      <div className="preview-banner">
        Bản xem trước của <strong>bản nháp</strong> — học viên chỉ thấy sau khi bấm "Xuất bản". Không tính giờ, không lưu bài.
      </div>
      <header className="exam-header">
        <div className="exam-header-info">
          <strong className="exam-header-title">{exam.title}</strong>
          <span className="exam-header-student">{exam.code} · {exam.durationMinutes} phút · {content.questions.length} câu</span>
        </div>
        <div className="exam-header-actions">
          <label className="checkbox-label preview-key-toggle">
            <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />
            Hiện đáp án và giải thích
          </label>
          <button type="button" className="btn btn-secondary btn-small exam-nav-toggle" onClick={() => setNavOpen(true)}>
            Bảng câu hỏi
          </button>
        </div>
      </header>

      <div className="exam-body">
        <main className="exam-main">
          <div className="exam-part-title">
            {!page.firstOfPart && <span>{partName(content, page.part)}</span>}
            <span className="muted">
              {first === last ? `Question ${first}` : `Question ${first}–${last}`}
              {page.group && GROUP_KIND_LABELS[page.group.kind] ? ` · ${GROUP_KIND_LABELS[page.group.kind]}` : ''}
              {page.group ? ` · Nhóm ${page.group.code}` : ''}
            </span>
          </div>

          {page.firstOfPart && <PartIntro content={content} part={page.part} />}
          <ListeningAudio content={content} part={page.part} allowSeek={exam.allowSeekAudio} />

          <div className={page.group ? 'exam-split' : 'exam-single'}>
            {page.group && (
              <section className="exam-passage card">
                {page.group.passage && <PassageText text={page.group.passage} />}
                <GroupImages group={page.group} allowSeek />
                {!page.group.passage && !(page.group.passageImages || []).length && !page.group.image && !page.group.audio && (
                  <p className="muted">(Nhóm này chưa có đoạn văn.)</p>
                )}
              </section>
            )}
            <section className="exam-questions">
              {page.questions.map((q) => (
                <div key={q.no}>
                  <QuestionCard
                    question={q}
                    chosen={answers[q.no]}
                    flagged={false}
                    showFlag={false}
                    onChoose={(no, letter) => setAnswers((a) => ({ ...a, [no]: letter }))}
                    onToggleFlag={() => {}}
                    hideOptionText={hideOptionsFor(content, q)}
                    examType={content.examType}
                    allowSeek
                  />
                  {showKey && (
                    <div className="preview-key">
                      <p>
                        Đáp án: <strong>{q.answer || '(chưa có)'}</strong>
                        {answers[q.no] && (answers[q.no] === q.answer ? ' · Bạn chọn đúng' : ` · Bạn chọn ${answers[q.no]} (sai)`)}
                      </p>
                      {q.explanation ? <p>{q.explanation}</p> : <p className="muted">(Chưa có giải thích.)</p>}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>

          <div className="exam-pager">
            <button type="button" className="btn btn-secondary" disabled={pageIndex === 0} onClick={() => goToPage(pageIndex - 1)}>
              Trang trước
            </button>
            <span className="muted">{pageIndex + 1} / {pages.length}</span>
            <button type="button" className="btn btn-primary" disabled={pageIndex === pages.length - 1} onClick={() => goToPage(pageIndex + 1)}>
              Trang sau
            </button>
          </div>
        </main>

        <aside className={`exam-nav ${navOpen ? 'open' : ''}`}>
          <div className="exam-nav-inner">
            <div className="exam-nav-head">
              <strong>{content.questions.length} câu</strong>
              <button type="button" className="btn btn-secondary btn-small exam-nav-close" onClick={() => setNavOpen(false)}>
                Đóng
              </button>
            </div>
            <QuestionNav
              content={content}
              answers={answers}
              flagged={[]}
              currentNos={page.questions.map((q) => q.no)}
              onSelect={goToQuestion}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
