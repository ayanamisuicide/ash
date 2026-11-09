import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { queryClient } from '@/lib/query-client';

type Retry = (failureCount: number, error: unknown) => boolean;

function retry(): Retry {
  return queryClient.getDefaultOptions().queries?.retry as Retry;
}

describe('queryClient', () => {
  it('кеширует данные 15 секунд и не обновляет по фокусу', () => {
    const options = queryClient.getDefaultOptions().queries;

    expect(options?.staleTime).toBe(15_000);
    expect(options?.gcTime).toBe(5 * 60_000);
    expect(options?.refetchOnWindowFocus).toBe(false);
  });

  it('не повторяет клиентские ошибки 4xx', () => {
    expect(retry()(0, new ApiError('не найдено', 404))).toBe(false);
    expect(retry()(0, new ApiError('нет доступа', 403))).toBe(false);
    expect(retry()(0, new ApiError('сессия', 401))).toBe(false);
  });

  it('повторяет серверные и сетевые ошибки не больше двух раз', () => {
    expect(retry()(0, new ApiError('boom', 500))).toBe(true);
    expect(retry()(1, new ApiError('boom', 500))).toBe(true);
    expect(retry()(2, new ApiError('boom', 500))).toBe(false);

    expect(retry()(0, new Error('network'))).toBe(true);
    expect(retry()(2, new Error('network'))).toBe(false);
  });
});
