import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { logout as logoutRequest } from '@/api/endpoints';
import { isDemoGuildId } from '@/lib/demo-data';
import { useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

/** Завершает сессию, чистит клиентский кеш и уводит на экран входа */
export function useLogout() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => {
      // Демо-сессия живёт только на клиенте — не дёргаем реальный /api/logout.
      if (isDemoGuildId(useAuthStore.getState().activeGuildId)) {
        return Promise.resolve({ ok: true as const });
      }
      return logoutRequest();
    },
    onSuccess: () => {
      toast.success('Сессия завершена', 'До встречи в NEXUS.');
    },
    onSettled: () => {
      // Локальную сессию очищаем в любом случае: даже если сеть упала,
      // пользователь ожидает выйти из панели.
      clearSession();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
}
