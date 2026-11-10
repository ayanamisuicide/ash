import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test, { after } from 'node:test';
import type { BotClient } from '../src/core/client.js';
import type { Session, SessionStore } from '../src/web/sessions.js';

const dbFile = path.join(os.tmpdir(), `probot-web-api-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-web-api-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { handleApi } = await import('../src/web/api.js');

const CLIENT = {} as BotClient;
const SESSION: Session = {
  id: 'session-id',
  user: {
    id: '123456789012345678',
    username: 'moderator',
    globalName: 'Moderator',
    avatar: null,
  },
  csrf: 'csrf-token',
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  lastSeenAt: Date.now(),
};

interface FakeResponse {
  res: ServerResponse;
  headers: Map<string, string | number | readonly string[]>;
  body: () => string;
}

function createResponse(): FakeResponse {
  const headers = new Map<string, string | number | readonly string[]>();
  let body = '';
  let status = 200;

  const res = {
    get statusCode(): number {
      return status;
    },
    set statusCode(value: number) {
      status = value;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
    },
  } as unknown as ServerResponse;

  return { res, headers, body: () => body };
}

async function callApi(input: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  session?: Session | null;
}) {
  const fake = createResponse();
  const destroyed: string[] = [];
  const sessions = {
    destroy: (id: string) => {
      destroyed.push(id);
    },
  } as unknown as SessionStore;

  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = input.method;
  req.headers = input.headers ?? {};

  await handleApi({
    req,
    res: fake.res,
    url: new URL(`http://127.0.0.1:3000${input.path}`),
    client: CLIENT,
    session: input.session ?? null,
    sessions,
    secureCookies: false,
  });

  return {
    status: fake.res.statusCode,
    headers: fake.headers,
    body: fake.body(),
    destroyed,
  };
}

function json(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}

after(() => {
  storage.closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      // ignore
    }
  }
});

test('api: без сессии закрытые маршруты отдают 401', async () => {
  const me = await callApi({ method: 'GET', path: '/api/me' });
  assert.equal(me.status, 401);
  assert.equal(json(me.body).ok, false);

  const logout = await callApi({ method: 'POST', path: '/api/logout' });
  assert.equal(logout.status, 401);

  const guild = await callApi({
    method: 'POST',
    path: '/api/guilds/123456789012345678/cases',
  });
  assert.equal(guild.status, 401);

  const activity = await callApi({
    method: 'GET',
    path: '/api/guilds/123456789012345678/activity',
  });
  assert.equal(activity.status, 401);
});

test('api: /api/status не раскрывает данные бота без сессии', async () => {
  const anonymous = await callApi({ method: 'GET', path: '/api/status' });
  assert.equal(anonymous.status, 200);
  assert.deepEqual(json(anonymous.body), { ok: true });

  const wrongMethod = await callApi({ method: 'POST', path: '/api/status' });
  assert.equal(wrongMethod.status, 405);
});

test('api: мутации без CSRF-токена отклоняются до обращения к Discord', async () => {
  const missing = await callApi({
    method: 'POST',
    path: '/api/logout',
    session: SESSION,
  });
  assert.equal(missing.status, 403);
  assert.match(String(json(missing.body).error), /CSRF/i);
  assert.deepEqual(missing.destroyed, []);

  const wrong = await callApi({
    method: 'POST',
    path: '/api/logout',
    headers: { 'x-csrf-token': 'nope' },
    session: SESSION,
  });
  assert.equal(wrong.status, 403);
  assert.deepEqual(wrong.destroyed, []);

  const guild = await callApi({
    method: 'DELETE',
    path: '/api/guilds/123456789012345678/cases/1',
    session: SESSION,
  });
  assert.equal(guild.status, 403);
  assert.match(String(json(guild.body).error), /CSRF/i);
});

test('api: валидный CSRF-токен пропускает мутацию и гасит сессию', async () => {
  const response = await callApi({
    method: 'POST',
    path: '/api/logout',
    headers: { 'x-csrf-token': SESSION.csrf },
    session: SESSION,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(json(response.body), { ok: true });
  assert.deepEqual(response.destroyed, [SESSION.id]);
  assert.match(String(response.headers.get('set-cookie')), /pp_sid=;/);
  assert.match(String(response.headers.get('set-cookie')), /Max-Age=0/);
});

test('api: неизвестный маршрут с валидным токеном — 404, а не 403', async () => {
  const response = await callApi({
    method: 'POST',
    path: '/api/unknown',
    headers: { 'x-csrf-token': SESSION.csrf },
    session: SESSION,
  });

  assert.equal(response.status, 404);
});
