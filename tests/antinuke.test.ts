import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild } from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-antinuke-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(
  os.tmpdir(),
  `probot-antinuke-legacy-${process.pid}.json`,
);

const storage = await import('../src/storage/sqlite.js');
const logSettings = await import('../src/lib/logSettings.js');
const settings = await import('../src/lib/modSettings.js');
const nuke = await import('../src/lib/nuke.js');

const guildId = 'guild-antinuke';
const sent: unknown[] = [];

const logChannel = {
  id: 'log-1',
  isTextBased: () => true,
  send: async (payload: unknown) => {
    sent.push(payload);
    return { id: `message-${sent.length}` };
  },
};

const now = Date.now();
const entries = new Map<string, unknown>([
  [
    'entry-1',
    {
      targetId: 'target-1',
      createdTimestamp: now,
      reason: 'test',
      executor: {
        id: 'mod-1',
        tag: 'Mod#0001',
        partial: false,
        toString: () => '<@mod-1>',
      },
    },
  ],
  [
    'entry-2',
    {
      targetId: 'target-2',
      createdTimestamp: now,
      reason: 'test',
      executor: {
        id: 'mod-1',
        tag: 'Mod#0001',
        partial: false,
        toString: () => '<@mod-1>',
      },
    },
  ],
]);

const guild = {
  id: guildId,
  name: 'Test Guild',
  ownerId: 'owner-1',
  client: { user: { id: 'bot-1' } },
  channels: { cache: new Map([['log-1', logChannel]]) },
  members: {
    fetch: async (id: string) =>
      id === 'mod-1'
        ? {
            id,
            permissions: { has: () => false },
            roles: { cache: { has: () => false } },
          }
        : null,
  },
  fetchAuditLogs: async () => ({ entries }),
} as unknown as Guild;

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

test('antinuke: threshold triggers alert and resets counters', async () => {
  logSettings.setLogChannel(guildId, 'log-1');
  settings.updateNukeConfig(guildId, {
    enabled: true,
    threshold: 2,
    windowSec: 60,
    action: 'alert',
    ignoreAdmins: true,
  });
  nuke.resetNukeRuntime(guildId);
  sent.length = 0;

  await nuke.recordNuke(guild, 'ban', 'target-1');
  assert.equal(nuke.getNukeCounters(guildId).length, 1);
  assert.equal(nuke.getNukeCounters(guildId)[0]?.count, 1);
  assert.equal(sent.length, 0);

  const persisted = storage.db
    .prepare('SELECT nuke_state FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { nuke_state: string } | undefined;
  assert.ok(persisted?.nuke_state.includes('mod-1'));

  await nuke.recordNuke(guild, 'ban', 'target-2');
  assert.equal(sent.length, 1);
  assert.equal(nuke.getNukeCounters(guildId).length, 0);

  const cleared = storage.db
    .prepare('SELECT nuke_state FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { nuke_state: string } | undefined;
  assert.equal(cleared?.nuke_state, '{}');
});

test('antinuke: reset clears runtime', async () => {
  nuke.resetNukeRuntime(guildId);
  assert.deepEqual(nuke.getNukeCounters(guildId), []);
  nuke.resetNukeRuntime();
  assert.deepEqual(nuke.getNukeCounters(guildId), []);
});
