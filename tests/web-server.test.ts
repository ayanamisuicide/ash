import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import type { BotClient } from '../src/core/client.js';

const dbFile = path.join(os.tmpdir(), `probot-web-server-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-web-server-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { listeningPort, startWebPanel } = await import('../src/web/server.js');
const { SessionStore } = await import('../src/web/sessions.js');

const CLIENT = {} as BotClient;
const USER = {
  id: '123456789012345678',
  username: 'moderator',
  globalName: 'Moderator',
  avatar: null,
};

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let baseUrl = '';

before(async () => {
  server = await startWebPanel(CLIENT, 0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${listeningPort(server, 0)}`;
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  storage.closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      // ignore
    }
  }
});

function send(method: string, pathname: string, headers: Record<string, string> = {}) {
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = http.request(`${baseUrl}${pathname}`, { method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function json(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}

test('server: /health отдаёт версию и защитные заголовки', async () => {
  const response = await send('GET', '/health');

  assert.equal(response.status, 200);
  assert.equal(json(response.body).ok, true);
  assert.equal(typeof json(response.body).version, 'string');

  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'same-origin');
  assert.match(String(response.headers['content-security-policy']), /default-src 'self'/);
  assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.match(String(response.headers['content-security-policy']), /script-src 'self'/);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('server: cookie-сессия без CSRF получает 403, с токеном — выход', async () => {
  const session = new SessionStore(60 * 60_000).create(USER);
  const cookie = `pp_sid=${encodeURIComponent(session.id)}`;

  const withoutToken = await send('POST', '/api/logout', { cookie });
  assert.equal(withoutToken.status, 403);
  assert.match(String(json(withoutToken.body).error), /CSRF/i);

  const wrongToken = await send('POST', '/api/logout', {
    cookie,
    'x-csrf-token': 'invalid',
  });
  assert.equal(wrongToken.status, 403);

  const logout = await send('POST', '/api/logout', {
    cookie,
    'x-csrf-token': session.csrf,
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(json(logout.body), { ok: true });

  const afterLogout = await send('GET', '/api/me', { cookie });
  assert.equal(afterLogout.status, 401);
});

test('server: статика не выпускает файлы за пределы каталога панели', async () => {
  const traversal = await send('GET', '/%2e%2e%2fpackage.json');
  assert.equal(traversal.status, 404);

  const missingAsset = await send('GET', '/assets/missing.js');
  assert.equal(missingAsset.status, 404);
  assert.equal(missingAsset.headers['content-type'], 'application/json; charset=utf-8');
});

test('server: rate limit отвечает 429 на API и на логин', async () => {
  const isolated = await startWebPanel(CLIENT, 0, '127.0.0.1');
  const isolatedUrl = `http://127.0.0.1:${listeningPort(isolated, 0)}`;

  const request = (method: string, pathname: string) =>
    new Promise<number>((resolve, reject) => {
      const req = http.request(`${isolatedUrl}${pathname}`, { method }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });
      req.on('error', reject);
      req.end();
    });

  try {
    // 180 мутаций в минуту разрешены, 181-я упирается в лимит.
    for (let index = 0; index < 180; index += 1) {
      const status = await request('POST', '/api/guilds/123456789012345678/cases');
      assert.equal(status, 401);
    }

    const limited = await request('POST', '/api/guilds/123456789012345678/cases');
    assert.equal(limited, 429);

    for (let index = 0; index < 30; index += 1) {
      const status = await request('GET', '/auth/login');
      assert.equal(status, 302);
    }

    const loginLimited = await request('GET', '/auth/login');
    assert.equal(loginLimited, 429);
  } finally {
    await new Promise<void>((resolve) => {
      isolated.close(() => resolve());
    });
  }
});
