import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild, GuildMember, Role } from 'discord.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-rewards-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');
const community = await import('../src/lib/community.js');
const { applyLevelRewards } = await import('../src/lib/levelRewards.js');

const guildId = 'rewards-guild';

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function makeRole(id: string): Role {
  return { id, managed: false } as unknown as Role;
}

function makeMember(roleIds: string[] = []) {
  const cache = new Map(roleIds.map((id) => [id, makeRole(id)]));
  const member = {
    roles: {
      cache,
      add: async (role: Role) => {
        cache.set(role.id, role);
      },
      remove: async (role: Role) => {
        cache.delete(role.id);
      },
    },
  } as unknown as GuildMember;
  return { member, cache };
}

function makeGuild() {
  const roles = new Map(['role-5', 'role-10', 'role-15'].map((id) => [id, makeRole(id)] as const));
  const guild = {
    id: guildId,
    roles: {
      cache: roles,
      fetch: async (id: string) => roles.get(id) ?? null,
    },
  } as unknown as Guild;
  return guild;
}

test('applyLevelRewards: выдаёт роль и заменяет прошлую награду', async () => {
  community.updateCommunitySettings(guildId, {
    levelRewards: [
      { level: 5, roleId: 'role-5' },
      { level: 10, roleId: 'role-10' },
      { level: 15, roleId: 'role-15' },
    ],
    levelRewardsReplacePrevious: true,
  });

  const guild = makeGuild();
  const { member, cache } = makeMember();

  assert.deepEqual(await applyLevelRewards(guild, member, 4, 5), ['role-5']);
  assert.equal(cache.has('role-5'), true);

  assert.deepEqual(await applyLevelRewards(guild, member, 5, 10), ['role-10']);
  assert.equal(cache.has('role-5'), false);
  assert.equal(cache.has('role-10'), true);

  assert.deepEqual(await applyLevelRewards(guild, member, 10, 12), []);
  assert.equal(cache.has('role-10'), true);
});

test('applyLevelRewards: прыжок через несколько уровней', async () => {
  const guild = makeGuild();
  const { member, cache } = makeMember();

  assert.deepEqual(await applyLevelRewards(guild, member, 4, 12), ['role-5', 'role-10']);
  assert.equal(cache.has('role-5'), false);
  assert.equal(cache.has('role-10'), true);
});

test('applyLevelRewards: без замены роли накапливаются', async () => {
  community.updateCommunitySettings(guildId, { levelRewardsReplacePrevious: false });

  const guild = makeGuild();
  const { member, cache } = makeMember();

  await applyLevelRewards(guild, member, 4, 5);
  await applyLevelRewards(guild, member, 5, 10);
  await applyLevelRewards(guild, member, 10, 15);

  assert.equal(cache.has('role-5'), true);
  assert.equal(cache.has('role-10'), true);
  assert.equal(cache.has('role-15'), true);
});
