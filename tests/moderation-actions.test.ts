import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
  type User,
} from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-moderation-actions-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-moderation-actions-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const bans = await import('../src/lib/moderation/bans.js');
const timeouts = await import('../src/lib/moderation/timeouts.js');
const { getCase } = await import('../src/lib/cases.js');

const BOT_ID = '323456789012345678';
const MOD_ID = '123456789012345678';
const OWNER_ID = '999999999999999999';

let guildSeq = 10;

function nextGuildId(): string {
  guildSeq += 1;
  return `1000000000000000${guildSeq}`;
}

function makeUser(id: string): User {
  return {
    id,
    username: `user-${id.slice(-4)}`,
    displayAvatarURL: () => 'https://cdn.example/avatar.png',
    send: async () => ({}),
    toString: () => `<@${id}>`,
  } as unknown as User;
}

interface MemberOptions {
  position?: number;
  bannable?: boolean;
  kickable?: boolean;
  moderatable?: boolean;
  timedOut?: boolean;
  muteRoleId?: string;
}

function makeMember(id: string, options: MemberOptions = {}): GuildMember {
  const roleIds = new Set<string>(options.muteRoleId ? [options.muteRoleId] : []);
  return {
    id,
    user: makeUser(id),
    bannable: options.bannable ?? true,
    kickable: options.kickable ?? true,
    moderatable: options.moderatable ?? true,
    roles: {
      highest: { position: options.position ?? 1 },
      cache: { has: (roleId: string) => roleIds.has(roleId) },
      add: async (role: Role) => {
        roleIds.add(role.id);
      },
      remove: async (role: Role) => {
        roleIds.delete(role.id);
      },
    },
    isCommunicationDisabled: () => options.timedOut ?? false,
    timeout: async () => undefined,
    kick: async () => undefined,
    toString: () => `<@${id}>`,
  } as unknown as GuildMember;
}

interface GuildOptions {
  user?: User | null;
  member?: GuildMember | null;
  banned?: { user: User } | null;
  mePosition?: number;
  canManageRoles?: boolean;
  muteRole?: Role | null;
  failMuteRoleCreate?: boolean;
}

function makeGuild(options: GuildOptions = {}) {
  const guildId = nextGuildId();
  const mutedRole = options.muteRole === undefined ? null : options.muteRole;

  const guild = {
    id: guildId,
    name: 'Test Guild',
    ownerId: OWNER_ID,
    iconURL: () => null,
    client: {
      user: { id: BOT_ID },
      users: {
        fetch: async (id: string) => {
          if (options.user === null) throw new Error('unknown user');
          return options.user ?? makeUser(id);
        },
      },
    },
    members: {
      fetch: async (id: string) => {
        if (options.member === null) throw new Error('unknown member');
        return options.member ?? makeMember(id);
      },
      me: {
        id: BOT_ID,
        roles: { highest: { position: options.mePosition ?? 100 } },
        permissions: {
          has: (flag: bigint) => {
            if (flag === PermissionFlagsBits.ManageRoles) return options.canManageRoles ?? true;
            if (flag === PermissionFlagsBits.ManageChannels) return true;
            return false;
          },
        },
      },
    },
    roles: {
      cache: {
        get: (id: string) => (mutedRole && mutedRole.id === id ? mutedRole : undefined),
        find: (predicate: (role: Role) => boolean) =>
          mutedRole && predicate(mutedRole) ? mutedRole : undefined,
      },
      create: async () => {
        if (options.failMuteRoleCreate) throw new Error('missing permissions');
        return { id: '990000000000000002', name: 'Muted', managed: false } as Role;
      },
    },
    channels: { cache: new Map() },
    bans: {
      create: async () => undefined,
      remove: async () => undefined,
      fetch: async () => options.banned ?? null,
    },
  } as unknown as Guild;

  return { guild, guildId };
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

test('ban: отказывает себе, боту и отсутствующему пользователю', async () => {
  const own = makeGuild();
  assert.match((await bans.banUser(own.guild, MOD_ID, MOD_ID, 'test')).message, /самого себя/i);

  const bot = makeGuild({ user: makeUser(BOT_ID) });
  assert.match((await bans.banUser(bot.guild, MOD_ID, BOT_ID, 'test')).message, /бота/i);

  const missing = makeGuild({ user: null });
  assert.match(
    (await bans.banUser(missing.guild, MOD_ID, '223456789012345678', 'test')).message,
    /не найден/i,
  );
});

test('ban: проверяет иерархию и права бота', async () => {
  const higher = makeGuild({ member: makeMember('223456789012345678', { position: 500 }) });
  assert.match(
    (await bans.banUser(higher.guild, MOD_ID, '223456789012345678', 'test')).message,
    /не ниже роли бота/i,
  );

  const notBannable = makeGuild({
    member: makeMember('223456789012345678', { bannable: false }),
  });
  assert.match(
    (await bans.banUser(notBannable.guild, MOD_ID, '223456789012345678', 'test')).message,
    /нет прав забанить/i,
  );
});

test('ban: создаёт кейс и возвращает id', async () => {
  const target = makeGuild();
  const result = await bans.banUser(target.guild, MOD_ID, '223456789012345678', 'флуд', 120);

  assert.equal(result.ok, true);
  assert.ok(result.caseId);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'ban');
  assert.match(result.message, /забанен/);
});

test('tempban: валидирует длительность и создаёт временный кейс', async () => {
  const target = makeGuild();

  const invalid = await bans.tempbanUser(target.guild, MOD_ID, '223456789012345678', 0, 'test');
  assert.match(invalid.message, /длительность/i);

  const result = await bans.tempbanUser(
    target.guild,
    MOD_ID,
    '223456789012345678',
    60_000,
    'сутки',
  );
  assert.equal(result.ok, true);
  const modCase = getCase(target.guildId, result.caseId ?? 0);
  assert.equal(modCase?.type, 'tempban');
  assert.ok(modCase?.expiresAt);
});

test('softban: создаёт неактивный кейс', async () => {
  const target = makeGuild();
  const result = await bans.softbanUser(target.guild, MOD_ID, '223456789012345678', 'спам');

  assert.equal(result.ok, true);
  assert.match(result.message, /софтбанен/);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'softban');
});

test('massban: отсекает пустой и слишком большой список', async () => {
  const target = makeGuild();

  assert.match((await bans.massbanUsers(target.guild, MOD_ID, [], 'test')).message, /не указаны/i);

  const tooMany = Array.from({ length: 51 }, (_, index) => `223456789012345${index}`.slice(0, 18));
  assert.match(
    (await bans.massbanUsers(target.guild, MOD_ID, tooMany, 'test')).message,
    /не более 50/i,
  );
});

test('massban: считает успехи и пропускает битые ID', async () => {
  const target = makeGuild();
  const result = await bans.massbanUsers(
    target.guild,
    MOD_ID,
    ['223456789012345678', 'abc', '323456789012345679'],
    'чистка',
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /Забанено: \*\*2\*\*/);
  assert.match(result.message, /Не удалось: \*\*1\*\*/);
});

test('massban: без успехов возвращает ошибку', async () => {
  const target = makeGuild({ user: null });
  const result = await bans.massbanUsers(target.guild, MOD_ID, ['223456789012345678'], 'чистка');

  assert.equal(result.ok, false);
  assert.match(result.message, /ни одного/i);
});

test('kick: проверяет цель и создаёт кейс', async () => {
  const target = makeGuild();
  assert.match((await bans.kickUser(target.guild, MOD_ID, MOD_ID, 'test')).message, /самого себя/i);

  const missing = makeGuild({ member: null });
  assert.match(
    (await bans.kickUser(missing.guild, MOD_ID, '223456789012345678', 'test')).message,
    /не найден/i,
  );

  const notKickable = makeGuild({ member: makeMember('223456789012345678', { kickable: false }) });
  assert.match(
    (await bans.kickUser(notKickable.guild, MOD_ID, '223456789012345678', 'test')).message,
    /нет прав кикнуть/i,
  );

  const result = await bans.kickUser(target.guild, MOD_ID, '223456789012345678', 'уход');
  assert.equal(result.ok, true);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'kick');
});

test('unban: без бана отказывает, с баном создаёт кейс', async () => {
  const notBanned = makeGuild({ banned: null });
  assert.match(
    (await bans.unbanUser(notBanned.guild, MOD_ID, '223456789012345678', 'test')).message,
    /не забанен/i,
  );

  const target = makeGuild({ banned: { user: makeUser('223456789012345678') } });
  const result = await bans.unbanUser(target.guild, MOD_ID, '223456789012345678', 'ошибка');
  assert.equal(result.ok, true);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'unban');
});

test('timeout: валидирует длительность, права и создаёт кейс', async () => {
  const target = makeGuild();

  assert.match(
    (await timeouts.timeoutUser(target.guild, MOD_ID, '223456789012345678', 'завтра', 'test'))
      .message,
    /формат длительности/i,
  );
  assert.match(
    (await timeouts.timeoutUser(target.guild, MOD_ID, '223456789012345678', '8w', 'test')).message,
    /28 дней/i,
  );

  const missing = makeGuild({ member: null });
  assert.match(
    (await timeouts.timeoutUser(missing.guild, MOD_ID, '223456789012345678', '10m', 'test'))
      .message,
    /не найден/i,
  );

  const notModeratable = makeGuild({
    member: makeMember('223456789012345678', { moderatable: false }),
  });
  assert.match(
    (await timeouts.timeoutUser(notModeratable.guild, MOD_ID, '223456789012345678', '10m', 'test'))
      .message,
    /нет прав заглушить/i,
  );

  const result = await timeouts.timeoutUser(
    target.guild,
    MOD_ID,
    '223456789012345678',
    '10m',
    'флуд',
  );
  assert.equal(result.ok, true);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'timeout');
});

test('untimeout: требует активный таймаут и снимает его', async () => {
  const missing = makeGuild({ member: null });
  assert.match(
    (await timeouts.untimeoutUser(missing.guild, MOD_ID, '223456789012345678', 'test')).message,
    /не найден/i,
  );

  const inactive = makeGuild({ member: makeMember('223456789012345678', { timedOut: false }) });
  assert.match(
    (await timeouts.untimeoutUser(inactive.guild, MOD_ID, '223456789012345678', 'test')).message,
    /нет активного таймаута/i,
  );

  const target = makeGuild({ member: makeMember('223456789012345678', { timedOut: true }) });
  const result = await timeouts.untimeoutUser(target.guild, MOD_ID, '223456789012345678', 'прошло');
  assert.equal(result.ok, true);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'untimeout');
});

test('mute: проверяет длительность и права бота', async () => {
  const target = makeGuild();

  assert.match(
    (await timeouts.muteUser(target.guild, MOD_ID, '223456789012345678', 'завтра', 'test')).message,
    /формат длительности/i,
  );
  assert.match(
    (await timeouts.muteUser(target.guild, MOD_ID, '223456789012345678', '400d', 'test')).message,
    /365 дней/i,
  );

  const missing = makeGuild({ member: null });
  assert.match(
    (await timeouts.muteUser(missing.guild, MOD_ID, '223456789012345678', null, 'test')).message,
    /не найден/i,
  );

  const noPermissions = makeGuild({ canManageRoles: false });
  assert.match(
    (await timeouts.muteUser(noPermissions.guild, MOD_ID, '223456789012345678', null, 'test'))
      .message,
    /Управление ролями/i,
  );
});

test('mute: создаёт роль Muted и кейс с roleId', async () => {
  const target = makeGuild();
  const result = await timeouts.muteUser(
    target.guild,
    MOD_ID,
    '223456789012345678',
    60_000,
    'флуд',
  );

  assert.equal(result.ok, true);
  const modCase = getCase(target.guildId, result.caseId ?? 0);
  assert.equal(modCase?.type, 'mute');
  assert.equal(modCase?.extra.roleId, '990000000000000002');
});

test('mute: использует готовую роль и отклоняет уже заглушенного', async () => {
  const role = { id: '990000000000000005', name: 'Muted', managed: false } as Role;
  const target = makeGuild({ muteRole: role });

  const first = await timeouts.muteUser(target.guild, MOD_ID, '223456789012345678', null, 'раз');
  assert.equal(first.ok, true);

  const already = makeGuild({
    muteRole: role,
    member: makeMember('223456789012345678', { muteRoleId: role.id }),
  });
  assert.match(
    (await timeouts.muteUser(already.guild, MOD_ID, '223456789012345678', null, 'два')).message,
    /уже заглушен/i,
  );
});

test('mute: сообщает, если роль Muted создать не удалось', async () => {
  const target = makeGuild({ failMuteRoleCreate: true });
  const result = await timeouts.muteUser(target.guild, MOD_ID, '223456789012345678', null, 'test');

  assert.equal(result.ok, false);
  assert.match(result.message, /не удалось создать/i);
});

test('unmute: без мута отказывает, с мутом снимает роль', async () => {
  const noRole = makeGuild();
  assert.match(
    (await timeouts.unmuteUser(noRole.guild, MOD_ID, '223456789012345678', 'test')).message,
    /нет активного мута/i,
  );

  const role = { id: '990000000000000006', name: 'Muted', managed: false } as Role;
  const target = makeGuild({
    muteRole: role,
    member: makeMember('223456789012345678', { muteRoleId: role.id }),
  });
  const result = await timeouts.unmuteUser(target.guild, MOD_ID, '223456789012345678', 'прошло');

  assert.equal(result.ok, true);
  assert.equal(getCase(target.guildId, result.caseId ?? 0)?.type, 'unmute');
});
