import { useState } from 'react';
import { Link } from 'react-router-dom';
import StudentForm from '../components/StudentForm.jsx';
import ExamList from '../components/ExamList.jsx';
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

  return (
    <div className="start-page">
      {/* Ảnh trang trí: nằm phía sau nội dung, không bấm được, ẩn trên điện thoại */}
      <img src="/images/decor-1.png" alt="" aria-hidden="true" className="decor decor-1" />
      <img src="/images/decor-2.png" alt="" aria-hidden="true" className="decor decor-2" />

      <header className="start-header">
        <Link to="/" className="start-logo-link" aria-label="Về trang chủ">
          <img src="/images/logo-seamark.png" alt="Seamark" className="start-logo" />
        </Link>
      </header>

      <main className="start-main">
        {step === 'form' ? (
          <div className="card">
            <h1 className="start-title">Thông tin học viên</h1>
            <p className="muted start-subtitle">Vui lòng nhập thông tin trước khi chọn đề thi.</p>
            <StudentForm initialValues={student} onSubmit={handleSubmit} />
          </div>
        ) : (
          <div className="card">
            <h1 className="start-title">
              Xin chào {student.lastName} {student.firstName}
            </h1>
            <p className="muted start-subtitle">
              Chọn một đề để bắt đầu.{' '}
              <button type="button" className="btn btn-link" onClick={() => setStep('form')}>
                Sửa thông tin
              </button>
            </p>
            <ExamList student={student} />
          </div>
        )}
      </main>
    </div>
  );
}
