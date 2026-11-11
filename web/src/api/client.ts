import { isDemoGuildId } from '@/lib/demo-data';
import { useAuthStore } from '@/store/auth';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryPrimitive | QueryPrimitive[]>;

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: QueryParams;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Явный CSRF-токен. По умолчанию берётся из auth-store. */
  csrf?: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка. Попробуйте ещё раз.';
}

function buildQueryString(query?: QueryParams): string {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      params.append(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error;
  }

  if (typeof payload === 'string' && payload.trim() && !payload.trim().startsWith('<')) {
    return payload.slice(0, 300);
  }
  if (status >= 500) {
    return 'Сервер API временно недоступен. Проверьте, что бот запущен, и попробуйте снова.';
  }
  return `Ошибка запроса (${status}).`;
}

/**
 * Единая обёртка над fetch.
 *
 * - всегда отправляет cookie сессии (`credentials: include`);
 * - автоматически подставляет `x-csrf-token` для POST/PATCH/PUT/DELETE;
 * - нормализует ошибки API в ApiError с человекочитаемым сообщением.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = options.csrf ?? useAuthStore.getState().csrf;
    if (!csrfToken) {
      throw new ApiError('CSRF-токен ещё не получен. Обновите страницу.', 0);
    }
    headers.set('x-csrf-token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}${buildQueryString(options.query)}`, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Сервер недоступен. Проверьте соединение и попробуйте ещё раз.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    // Истёкшую сессию не показываем как локальную ошибку раздела:
    // сбрасываем клиентское состояние, ProtectedRoute уведёт на вход.
    if (response.status === 401 && normalizedPath !== '/api/me') {
      const state = useAuthStore.getState();
      if (!isDemoGuildId(state.activeGuildId)) {
        state.clearSession();
        state.setSessionError('Сессия истекла. Войдите через Discord заново.');
      }
    }
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

export interface DownloadResult {
  blob: Blob;
  filename: string | null;
}

/** Скачивание файла (CSV и т.п.) с той же авторизацией, что и API-запросы. */
export async function apiDownload(
  path: string,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
): Promise<DownloadResult> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'text/csv,application/octet-stream');

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}${buildQueryString(options.query)}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Сервер недоступен. Проверьте соединение и попробуйте ещё раз.', 0);
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);
    if (response.status === 401) {
      const state = useAuthStore.getState();
      if (!isDemoGuildId(state.activeGuildId)) {
        state.clearSession();
        state.setSessionError('Сессия истекла. Войдите через Discord заново.');
      }
    }
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}
