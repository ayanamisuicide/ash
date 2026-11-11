/** Коды сетевых ошибок Node/undici, при которых имеет смысл повторить запрос. */
const TRANSIENT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

const TRANSIENT_NAMES = new Set(['AbortError', 'TimeoutError']);

function hasTransientCode(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 5) return false;

  const candidate = value as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };

  if (typeof candidate.code === 'string' && TRANSIENT_CODES.has(candidate.code)) return true;
  if (typeof candidate.name === 'string' && TRANSIENT_NAMES.has(candidate.name)) return true;

  // undici приносит реальную причину в cause, а снаружи оставляет «fetch failed».
  if (candidate.cause && candidate.cause !== value) {
    return hasTransientCode(candidate.cause, depth + 1);
  }

  return false;
}

/**
 * Отличает временную сетевую ошибку (VPN моргнул, Discord недоступен) от
 * реальной ошибки регистрации команд (неверный токен, 403 и т.п.).
 */
export function isTransientNetworkError(error: unknown): boolean {
  return hasTransientCode(error);
}
