import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dbFile = path.join(os.tmpdir(), `probot-web-sessions-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-web-sessions-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { SessionStore } = await import('../src/web/sessions.js');

const user = {
  id: '123456789012345678',
  username: 'moderator',
  globalName: 'Moderator',
  avatar: null,
};

const DAY_MS = 24 * 60 * 60 * 1_000;

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

test('сессии: вход переживает перезапуск панели', () => {
  const store = new SessionStore(DAY_MS);
  const session = store.create(user);

  // Новый экземпляр имитирует рестарт: кеша в памяти нет, читаем из SQLite.
  const afterRestart = new SessionStore(DAY_MS);
  const restored = afterRestart.get(session.id);

  assert.ok(restored);
  assert.deepEqual(restored.user, user);
  assert.equal(restored.csrf, session.csrf);
  assert.equal(restored.expiresAt, session.expiresAt);
});

test('сессии: истёкшие не восстанавливаются и удаляются', () => {
  const store = new SessionStore(-1);
  const expired = store.create(user);

  assert.equal(new SessionStore(DAY_MS).get(expired.id), null);

  const row = storage.db
    .prepare('SELECT COUNT(*) AS count FROM web_sessions WHERE id = ?')
    .get(expired.id) as { count: number } | undefined;
  assert.equal(Number(row?.count ?? 0), 0);
});

test('сессии: destroy и prune чистят SQLite', () => {
  const store = new SessionStore(DAY_MS);
  const active = store.create(user);
  const expired = new SessionStore(-1).create(user);

  store.destroy(active.id);
  assert.equal(store.get(active.id), null);

  store.prune();
  const row = storage.db
    .prepare('SELECT COUNT(*) AS count FROM web_sessions WHERE id = ?')
    .get(expired.id) as { count: number } | undefined;
  assert.equal(Number(row?.count ?? 0), 0);
});
