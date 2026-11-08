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

test('client ip: X-Forwarded-For учитывается только с trustProxy', () => {
  const req = request({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } });
  req.socket = { remoteAddress: '10.0.0.1' } as IncomingMessage['socket'];

  assert.equal(getClientIp(req, true), '203.0.113.5');
  assert.equal(getClientIp(req, false), '10.0.0.1');
});
