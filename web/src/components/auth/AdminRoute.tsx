import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { selectCanAdmin, useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

/** Настройки сервера доступны только уровню admin из /api/me */
export function AdminOnlyRoute() {
  const canAdmin = useAuthStore(selectCanAdmin);

  useEffect(() => {
    if (canAdmin) return;
    toast.warning(
      'Недостаточно прав',
      'Раздел настроек доступен только администраторам этого сервера.',
    );
  }, [canAdmin]);

  if (!canAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
