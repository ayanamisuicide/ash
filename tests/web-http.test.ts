import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import {
  HttpError,
  MAX_BODY_BYTES,
  RateLimiter,
  assertSameOrigin,
  getClientIp,
  parseCookies,
  readJson,
  securityHeaders,
  sendError,
  sendJson,
  serializeCookie,
} from '../src/web/http.js';

function request(init: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const stream = Readable.from(init.body ? [init.body] : []) as unknown as IncomingMessage;
  stream.method = init.method ?? 'GET';
  stream.headers = init.headers ?? {};
  return stream;
}

test('cookies: serialize and parse', () => {
  const header = serializeCookie('pp_sid', 'abc def', { maxAge: 60, secure: true });
  assert.match(header, /^pp_sid=abc%20def/);
  assert.match(header, /Max-Age=60/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Secure/);

  const parsed = parseCookies('a=b%20c; c=d; broken');
  assert.deepEqual(parsed, { a: 'b c', c: 'd' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('origin: чужие Origin отклоняются только для мутаций', () => {
  const publicUrl = 'https://panel.example.com';

  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({ method: 'GET', headers: { origin: 'https://evil.example' } }),
      publicUrl,
    ),
  );

  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({ method: 'POST', headers: { origin: 'https://panel.example.com' } }),
      publicUrl,
    ),
  );

  assert.doesNotThrow(() => assertSameOrigin(request({ method: 'POST' }), publicUrl));

  assert.throws(
    () =>
      assertSameOrigin(
        request({ method: 'POST', headers: { origin: 'https://evil.example' } }),
        publicUrl,
      ),
    (error: unknown) => error instanceof HttpError && error.status === 403,
  );
});

test('origin: свой Host разрешён даже при другом публичном адресе', () => {
  const publicUrl = 'https://panel.example.com';
  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({
        method: 'PATCH',
        headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
      }),
      publicUrl,
    ),
  );
});

test('readJson: объект, массив, битый JSON и лимит размера', async () => {
  assert.deepEqual(await readJson(request({ method: 'POST', body: '{"a":1}' })), { a: 1 });
  assert.deepEqual(await readJson(request({ method: 'POST' })), {});

  await assert.rejects(
    () => readJson(request({ method: 'POST', body: '[1,2,3]' })),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  await assert.rejects(
    () => readJson(request({ method: 'POST', body: '{oops' })),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  const huge = JSON.stringify({ blob: 'x'.repeat(MAX_BODY_BYTES + 1024) });
  await assert.rejects(
    () => readJson(request({ method: 'POST', body: huge })),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
});

test('rate limiter: считает окно и восстанавливается после prune', async () => {
  const limiter = new RateLimiter(2, 20);
  assert.equal(limiter.check('ip'), true);
  assert.equal(limiter.check('ip'), true);
  assert.equal(limiter.check('ip'), false);
  assert.equal(limiter.check('other-ip'), true);

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(limiter.check('ip'), true);

  limiter.prune();
  assert.equal(limiter.check('ip'), true);
});

test('origin: null и чужой Host отклоняются для мутаций', () => {
  const publicUrl = 'https://panel.example.com';

  assert.throws(
    () =>
      assertSameOrigin(
        request({
          method: 'POST',
          headers: { origin: 'null', host: 'panel.example.com' },
        }),
        publicUrl,
      ),
    (error: unknown) => error instanceof HttpError && error.status === 403,
  );

  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({
        method: 'POST',
        headers: { origin: 'https://panel.example.com', host: 'panel.example.com' },
      }),
      publicUrl,
    ),
  );
});

test('security headers: запрещают фрейминг, MIME-sniffing и inline-скрипты', () => {
  const headers = new Map<string, string>();

  securityHeaders({
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
  } as unknown as Parameters<typeof securityHeaders>[0]);

  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'same-origin');
  assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');

  const csp = headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'self'/);
});

test('sendJson/sendError: статус, no-store и JSON-ошибка', () => {
  const makeResponse = () => {
    const headers = new Map<string, string | number>();
    let body = '';
    let status = 200;
    const res = {
      get statusCode(): number {
        return status;
      },
      set statusCode(value: number) {
        status = value;
      },
      setHeader(name: string, value: string | number) {
        headers.set(name.toLowerCase(), value);
      },
      end(chunk?: unknown) {
        if (chunk !== undefined) body += String(chunk);
      },
    };
    return { res, headers, body: () => body };
  };

  const sent = makeResponse();
  sendJson(sent.res as unknown as Parameters<typeof sendJson>[0], 418, { ok: false });

  assert.equal(sent.res.statusCode, 418);
  assert.equal(sent.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(sent.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(sent.body()) as unknown, { ok: false });

  const error = makeResponse();
  sendError(error.res as unknown as Parameters<typeof sendError>[0], 403, 'Нет доступа.');

  assert.equal(error.res.statusCode, 403);
  assert.deepEqual(JSON.parse(error.body()) as unknown, {
    ok: false,
    error: 'Нет доступа.',
  });
});

test('client ip: X-Forwarded-For учитывается только с trustProxy', () => {
  const req = request({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } });
  req.socket = { remoteAddress: '10.0.0.1' } as IncomingMessage['socket'];

  assert.equal(getClientIp(req, true), '203.0.113.5');
  assert.equal(getClientIp(req, false), '10.0.0.1');
});
