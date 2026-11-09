import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { Collection, type Guild, type GuildMember } from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-member-list-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-member-list-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { searchMembers } = await import('../src/web/data.js');

const guildId = '123456789012345678';

function member(id: string, username: string, displayName: string, bot = false): GuildMember {
  return {
    id,
    nickname: null,
    displayName,
    joinedTimestamp: 1_700_000_000_000,
    communicationDisabledUntilTimestamp: null,
    user: {
      id,
      username,
      globalName: null,
      avatar: null,
      bot,
      createdTimestamp: 1_600_000_000_000,
    },
    roles: {
      cache: new Collection(),
      highest: { name: '@everyone' },
    },
  } as unknown as GuildMember;
}

function guildWithMembers(items: GuildMember[]): Guild {
  return {
    id: guildId,
    memberCount: items.length,
    members: {
      cache: new Collection(items.map((item) => [item.id, item])),
      fetch: async () => new Collection(),
    },
    roles: { cache: new Collection() },
  } as unknown as Guild;
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

test('участники: список, поиск, сортировка и пагинация', async () => {
  const guild = guildWithMembers([
    member('111111111111111111', 'zeta', 'Zeta'),
    member('222222222222222222', 'alice', 'Alice'),
    member('333333333333333333', 'bot', 'Bot', true),
  ]);

  const firstPage = await searchMembers(guild, '', { page: 1, pageSize: 2 });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.pages, 2);
  assert.equal(firstPage.partial, false);
  assert.deepEqual(
    firstPage.items.map((item) => item.username),
    ['alice', 'zeta'],
  );

  const secondPage = await searchMembers(guild, '', { page: 2, pageSize: 2 });
  assert.deepEqual(
    secondPage.items.map((item) => item.username),
    ['bot'],
  );

  const search = await searchMembers(guild, 'ali', { page: 1, pageSize: 50 });
  assert.equal(search.total, 1);
  assert.equal(search.items[0]?.username, 'alice');

  const byId = await searchMembers(guild, '333333333333333333', { page: 1, pageSize: 50 });
  assert.equal(byId.total, 1);
  assert.equal(byId.items[0]?.username, 'bot');
  assert.equal(byId.items[0]?.bot, true);
});
