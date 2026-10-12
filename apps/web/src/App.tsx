import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import LibraryPage from './books/LibraryPage';
import AuthPage from './auth/AuthPage';
import { ProtectedRoute } from './auth/Auth';
import Shell from './layout/Shell';
const ReaderPage = lazy(() => import('./reader/ReaderPage'));
export default function App() {
  return (
    <Routes>
      {(['login', 'signup', 'forgot-password', 'reset-password'] as const).map((mode) => (
        <Route key={mode} path={`/${mode}`} element={<AuthPage key={mode} mode={mode} />} />
      ))}
      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/library" element={<LibraryPage />} />
        </Route>
        <Route
          path="/books/:bookId/read"
          element={
            <Suspense
              fallback={
                <div className="page-loading">
                  <Spin />
                </div>
              }
            >
              <ReaderPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}
