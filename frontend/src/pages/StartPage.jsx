import { useState } from 'react';
import StudentForm from '../components/StudentForm.jsx';
import ExamList from '../components/ExamList.jsx';
import PageShell from '../components/brand/PageShell.jsx';
import { loadStudent, saveStudent } from '../utils/studentStorage.js';
import './StartPage.css';

// Màn hình sau khi bấm "Bắt đầu làm bài":
// bước 1 nhập thông tin -> bước 2 chọn đề.
export default function StartPage() {
  // Nếu học viên đã nhập trước đó (cùng tab) thì điền sẵn
  const [student, setStudent] = useState(() => loadStudent());
  const [step, setStep] = useState('form'); // 'form' | 'exams'

  function handleSubmit(values) {
    saveStudent(values);
    setStudent(values);
    setStep('exams');
  }

  if (step === 'form') {
    return (
      <PageShell title="Thông tin học viên" subtitle="Vui lòng nhập thông tin trước khi chọn đề thi." step={1} narrow>
        <div className="card">
          <StudentForm initialValues={student} onSubmit={handleSubmit} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={`Xin chào ${student.lastName} ${student.firstName}!`} subtitle="Chọn một đề để bắt đầu. Chúc bạn làm bài thật tốt!" step={2}>
      <div className="card">
        <div className="start-card-head">
          <h2 className="start-card-title">Đề thi đang mở</h2>
          <button type="button" className="btn btn-link" onClick={() => setStep('form')}>
            Sửa thông tin
          </button>
        </div>
        <ExamList student={student} />
      </div>
    </PageShell>
  );
}
