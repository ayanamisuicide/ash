import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { Collection, type Guild, type GuildMember } from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-role-clear-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-role-clear-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { clearRoles } = await import('../src/lib/moderation/roles.js');
const { searchCases } = await import('../src/lib/cases.js');

const guildId = '123456789012345678';
const userId = '223456789012345678';
const moderatorId = '323456789012345678';
const roleA = '423456789012345678';
const roleB = '523456789012345678';

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

function fakeGuild(roles: Collection<string, unknown>): {
  guild: Guild;
  removed: string[];
  dms: unknown[];
} {
  const removed: string[] = [];
  const dms: unknown[] = [];
  const member = {
    id: userId,
    user: {
      id: userId,
      bot: false,
      send: async (payload: unknown) => {
        dms.push(payload);
      },
    },
    roles: {
      cache: roles,
      highest: { position: 5 },
      remove: async (collection: Collection<string, { id: string }>) => {
        removed.push(...collection.keys());
      },
    },
  } as unknown as GuildMember;

  const guild = {
    id: guildId,
    ownerId: '623456789012345678',
    client: { user: { id: '723456789012345678' } },
    members: {
      me: { roles: { highest: { position: 100 } } },
      fetch: async () => member,
    },
  } as unknown as Guild;

  return { guild, removed, dms };
}

test('clearRoles: снимает все управляемые роли, кроме @everyone и managed', async () => {
  const roles = new Collection<string, unknown>([
    [roleA, { id: roleA, managed: false, position: 2 }],
    [roleB, { id: roleB, managed: true, position: 1 }],
    [guildId, { id: guildId, managed: false, position: 0 }],
  ]);
  const { guild, removed, dms } = fakeGuild(roles);

  const result = await clearRoles(guild, moderatorId, userId, 'Тестовое снятие');
  assert.equal(result.ok, true);
  assert.deepEqual(removed, [roleA]);
  assert.equal(dms.length, 1);
  assert.match(JSON.stringify(dms[0]), /Тестовое снятие/);

  const [modCase] = searchCases(guildId, { userId, pageSize: 10 }).items;
  assert.equal(modCase?.type, 'role');
  assert.equal(modCase?.extra.action, 'clear');
  assert.equal(modCase?.extra.removed, 1);
});

test('clearRoles: без управляемых ролей возвращает ошибку', async () => {
  const roles = new Collection<string, unknown>([
    [roleB, { id: roleB, managed: true, position: 1 }],
    [guildId, { id: guildId, managed: false, position: 0 }],
  ]);
  const { guild } = fakeGuild(roles);

  const result = await clearRoles(guild, moderatorId, userId, 'Нечего снимать');
  assert.equal(result.ok, false);
  assert.match(result.message, /нет управляемых ролей/);
});
