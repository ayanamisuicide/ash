import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild, GuildMember, Role, User } from 'discord.js';
import type { Appeal } from '../src/lib/appeals.js';

const dbFile = path.join(os.tmpdir(), `probot-appeal-resolution-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-appeal-resolution-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { resolveAppealPunishment } = await import('../src/lib/appealResolution.js');
const { createCase, getCase } = await import('../src/lib/cases.js');

const BOT_ID = '323456789012345678';
const MOD_ID = '123456789012345678';
const USER_ID = '223456789012345678';

let guildSeq = 40;

function nextGuildId(): string {
  guildSeq += 1;
  return `1000000000000000${guildSeq}`;
}

function makeUser(id: string): User {
  return {
    id,
    username: `user-${id.slice(-4)}`,
    displayAvatarURL: () => null,
    send: async () => ({}),
    toString: () => `<@${id}>`,
  } as unknown as User;
}

interface FakeOptions {
  banned?: boolean;
  muteRoleId?: string;
  member?: boolean;
  timedOut?: boolean;
}

function makeGuild(options: FakeOptions = {}) {
  const guildId = nextGuildId();
  const muteRole = { id: '990000000000000010', name: 'Muted', managed: false } as Role;

  const member = {
    id: USER_ID,
    user: makeUser(USER_ID),
    moderatable: true,
    isCommunicationDisabled: () => options.timedOut ?? false,
    timeout: async () => undefined,
    roles: {
      cache: { has: (id: string) => Boolean(options.muteRoleId) && id === options.muteRoleId },
      remove: async () => undefined,
    },
    toString: () => `<@${USER_ID}>`,
  } as unknown as GuildMember;

  const guild = {
    id: guildId,
    name: 'Test Guild',
    ownerId: '999999999999999999',
    iconURL: () => null,
    client: { user: { id: BOT_ID } },
    members: {
      fetch: async () => (options.member === false ? null : member),
      me: { roles: { highest: { position: 100 } }, permissions: { has: () => true } },
    },
    roles: {
      cache: {
        get: (id: string) => (id === muteRole.id ? muteRole : undefined),
        find: (predicate: (role: Role) => boolean) => (predicate(muteRole) ? muteRole : undefined),
      },
    },
    bans: {
      fetch: async () => (options.banned ? { user: makeUser(USER_ID) } : null),
      remove: async () => undefined,
    },
  } as unknown as Guild;

  return { guild, guildId };
}

function makeAppeal(guildId: string, overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 1,
    guildId,
    userId: USER_ID,
    reason: 'не согласен',
    status: 'pending',
    createdAt: Date.now(),
    caseId: null,
    channelId: null,
    messageId: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
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

test('legacy-апелляция: снимает доступное и не падает на уже снятом', async () => {
  const { guild, guildId } = makeGuild();
  const result = await resolveAppealPunishment(guild, MOD_ID, makeAppeal(guildId));

  assert.equal(result.ok, true);
  assert.match(result.message, /Наказания уже не действовали/i);
});

test('апелляция: отсутствующий кейс не считается ошибкой', async () => {
  const { guild, guildId } = makeGuild();
  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: 999_999 }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /не найден/i);
});

test('апелляция: бан снимается и кейс остаётся в истории', async () => {
  const { guild, guildId } = makeGuild({ banned: true });
  const modCase = createCase({
    guildId,
    type: 'ban',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'бан',
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /бан снят/i);
  assert.equal(getCase(guildId, modCase.id)?.type, 'ban');
});

test('апелляция: мут снимается через роль Muted', async () => {
  const { guild, guildId } = makeGuild({ muteRoleId: '990000000000000010' });
  const modCase = createCase({
    guildId,
    type: 'mute',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'мут',
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /мут снят/i);
});

test('апелляция: таймаут снимается при активном ограничении', async () => {
  const { guild, guildId } = makeGuild({ timedOut: true });
  const modCase = createCase({
    guildId,
    type: 'timeout',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'таймаут',
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /таймаут снят/i);
});

test('апелляция: варн без привязки закрывает кейс', async () => {
  const { guild, guildId } = makeGuild();
  const modCase = createCase({
    guildId,
    type: 'warn',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'варн',
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /кейс варна закрыт/i);
  assert.equal(getCase(guildId, modCase.id)?.active, false);
});

test('апелляция: временная роль снимается, если роль ещё существует', async () => {
  const { guild, guildId } = makeGuild();
  const modCase = createCase({
    guildId,
    type: 'temprole',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'роль',
    extra: { roleId: '990000000000000010' },
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /временная роль снята/i);
});

test('апелляция: завершённое наказание закрывает кейс без действий', async () => {
  const { guild, guildId } = makeGuild();
  const modCase = createCase({
    guildId,
    type: 'kick',
    userId: USER_ID,
    moderatorId: MOD_ID,
    reason: 'кик',
  });

  const result = await resolveAppealPunishment(
    guild,
    MOD_ID,
    makeAppeal(guildId, { caseId: modCase.id }),
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /уже завершено/i);
  assert.equal(getCase(guildId, modCase.id)?.active, false);
});
