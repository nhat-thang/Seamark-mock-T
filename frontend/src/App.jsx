import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import StartPage from './pages/StartPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AdminLayout, { OwnerOnly } from './admin/AdminLayout.jsx';
import AdminHomePage from './admin/AdminHomePage.jsx';
import ChangePasswordPage from './admin/ChangePasswordPage.jsx';
import AccountsPage from './admin/AccountsPage.jsx';
import AuditLogPage from './admin/AuditLogPage.jsx';
import LoginHistoryPage from './admin/LoginHistoryPage.jsx';
import TestPage from './exam/TestPage.jsx';
import ExamListPage from './admin/ExamListPage.jsx';
import ExamEditPage from './admin/ExamEditPage.jsx';
import ExamPreviewPage from './admin/ExamPreviewPage.jsx';
import ResultsPage from './admin/ResultsPage.jsx';
import ResultDetailPage from './admin/ResultDetailPage.jsx';
import GuidePage from './admin/GuidePage.jsx';

export default function App() {
  return (
    <Routes>
      {/* Học viên */}
      <Route path="/" element={<HomePage />} />
      <Route path="/bat-dau" element={<StartPage />} />
      <Route path="/lam-bai/:attemptId" element={<TestPage />} />

      {/* Admin */}
      <Route path="/admin/dang-nhap" element={<AdminLoginPage />} />
      {/* Xem trước mở ở tab mới, toàn màn hình như học viên */}
      <Route path="/admin/xem-truoc/:id" element={<ExamPreviewPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHomePage />} />
        <Route path="de-thi" element={<ExamListPage />} />
        <Route path="de-thi/:id" element={<ExamEditPage />} />
        <Route path="ket-qua" element={<ResultsPage />} />
        <Route path="ket-qua/:id" element={<ResultDetailPage />} />
        <Route path="doi-mat-khau" element={<ChangePasswordPage />} />
        <Route path="huong-dan" element={<GuidePage />} />
        {/* Chỉ admin chính */}
        <Route path="tai-khoan" element={<OwnerOnly><AccountsPage /></OwnerOnly>} />
        <Route path="lich-su-chinh-sua" element={<OwnerOnly><AuditLogPage /></OwnerOnly>} />
        <Route path="lich-su-dang-nhap" element={<OwnerOnly><LoginHistoryPage /></OwnerOnly>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
