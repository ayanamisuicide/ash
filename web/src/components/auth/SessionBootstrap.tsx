import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/api/endpoints';
import { getErrorMessage, isApiError } from '@/api/client';
import { useAuthStore } from '@/store/auth';

/**
 * Один раз загружает /api/me и наполняет auth-store.
 * 401 — штатный сценарий «гость», остальные ошибки показываем на логине.
 */
export function SessionBootstrap() {
  const setSession = useAuthStore((state) => state.setSession);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setSessionError = useAuthStore((state) => state.setSessionError);

  const { data, error, isSuccess, isError } = useQuery({
    queryKey: ['session', 'me'],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
    staleTime: 60_000,
    meta: { silent: true },
  });

  useEffect(() => {
    setStatus('loading');
  }, [setStatus]);

  useEffect(() => {
    if (isSuccess && data) setSession(data);
  }, [data, isSuccess, setSession]);

  useEffect(() => {
    if (!isError) return;

    if (isApiError(error) && error.status === 401) {
      setStatus('guest');
      setSessionError(null);
      return;
    }

    setStatus('guest');
    setSessionError(getErrorMessage(error));
  }, [error, isError, setSessionError, setStatus]);

  return null;
}
