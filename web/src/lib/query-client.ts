import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { getErrorMessage, isApiError } from '@/api/client';
import { toast } from '@/store/ui';

function shouldSilence(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldSilence(error)) return;
      // meta.silent отключает глобальный тост там, где ошибка обрабатывается локально.
      if (query.meta?.silent === true) return;
      toast.error('Не удалось загрузить данные', getErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (shouldSilence(error)) return;
      toast.error('Действие не выполнено', getErrorMessage(error));
    },
  }),
});
