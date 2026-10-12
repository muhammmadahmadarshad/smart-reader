import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, ApiError, queryClient } from '../api';
import type { User } from './types';
export const useUser = () =>
  useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me'), staleTime: 60000 });
export function ProtectedRoute() {
  const user = useUser();
  const location = useLocation();
  useEffect(() => {
    const expired = () => {
      queryClient.clear();
      void user.refetch();
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [user.refetch]);
  if (user.isPending)
    return (
      <div className="page-loading">
        <Spin tip="Opening your workspace">
          <div />
        </Spin>
      </div>
    );
  if (user.error instanceof ApiError && user.error.status === 401)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.isError)
    return (
      <div className="page-loading">
        <Alert
          type="error"
          message="Unable to reach Smart Reader"
          description={user.error.message}
          action={<Button onClick={() => user.refetch()}>Retry</Button>}
        />
      </div>
    );
  return <Outlet />;
}
