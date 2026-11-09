import type { IncomingMessage, ServerResponse } from 'node:http';

/** Ограничение на JSON-тело запроса (защита от мусора и переполнения памяти) */
export const MAX_BODY_BYTES = 512 * 1024;

/** Ошибка с HTTP-статусом, которую умеет превращать в JSON роутер */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined)
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function appendCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader('Set-Cookie');
  const list = Array.isArray(current) ? current : current ? [String(current)] : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function clearCookie(res: ServerResponse, name: string, secure: boolean, path = '/'): void {
  appendCookie(res, serializeCookie(name, '', { path, maxAge: 0, secure }));
}

export function securityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://cdn.discordapp.com data:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { ok: false, error: message });
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Слишком большой запрос.');
    chunks.push(buffer);
  }

  if (size === 0) return {};

  const text = Buffer.concat(chunks).toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Некорректный JSON в теле запроса.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'Тело запроса должно быть JSON-объектом.');
  }
  return parsed as Record<string, unknown>;
}

function isMutating(method: string | undefined): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

/**
 * Базовая защита от CSRF: для браузерных запросов Origin должен совпадать
 * с публичным адресом панели или с текущим Host.
 * Плюс к этому мутации требуют CSRF-токен (см. handleApi).
 */
export function assertSameOrigin(req: IncomingMessage, publicUrl: string): void {
  if (!isMutating(req.method)) return;

  const origin = req.headers.origin;
  if (!origin) return;

  const allowed = new Set<string>();
  const configured = safeOrigin(publicUrl);
  if (configured) allowed.add(configured);

  // За панелью может стоять reverse-proxy с другим протоколом/портом, поэтому
  // разрешаем оба варианта для фактического Host запроса: подделать Host из
  // браузера нельзя, а CSRF-токен для мутаций всё равно обязателен.
  const host = req.headers.host;
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }

  if (!allowed.has(origin)) {
    throw new HttpError(403, 'Запрос с недопустимого источника.');
  }
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function getClientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first?.trim()) return first.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Простой in-memory rate limit по ключу (сессия/IP + действие) */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  prune(): void {
    const now = Date.now();
    for (const [key, list] of this.hits) {
      const fresh = list.filter((at) => now - at < this.windowMs);
      if (fresh.length === 0) this.hits.delete(key);
      else this.hits.set(key, fresh);
    }
  }
}
