import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild, GuildMember } from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-security-${process.pid}.sqlite`);
const legacyFile = path.join(os.tmpdir(), `probot-security-legacy-${process.pid}.json`);

process.env.DB_FILE = dbFile;
process.env.DATA_FILE = legacyFile;

const storage = await import('../src/storage/sqlite.js');
const settings = await import('../src/lib/modSettings.js');
const raid = await import('../src/lib/raid.js');
const nuke = await import('../src/lib/nuke.js');
const logSettings = await import('../src/lib/logSettings.js');

const guildId = 'test-security-guild';

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

test('security settings: defaults', () => {
  const current = settings.getSecuritySettings(guildId);
  assert.equal(current.raid.enabled, false);
  assert.equal(current.raid.joinThreshold, 10);
  assert.equal(current.raid.action, 'alert');
  assert.equal(current.nuke.enabled, false);
  assert.equal(current.nuke.threshold, 3);
  assert.equal(current.nuke.action, 'alert');
});

test('security settings: raid and nuke updates', () => {
  const raidConfig = settings.updateRaidConfig(guildId, {
    enabled: true,
    joinThreshold: 5,
    joinWindowSec: 30,
    accountAgeDays: 7,
    action: 'kick',
    durationSec: 600,
    ignoreBots: false,
  });
  assert.equal(raidConfig.enabled, true);
  assert.equal(raidConfig.joinThreshold, 5);
  assert.equal(raidConfig.action, 'kick');

  const nukeConfig = settings.updateNukeConfig(guildId, {
    enabled: true,
    threshold: 2,
    windowSec: 120,
    action: 'ban',
    ignoreAdmins: false,
  });
  assert.equal(nukeConfig.enabled, true);
  assert.equal(nukeConfig.threshold, 2);
  assert.equal(nukeConfig.action, 'ban');

  const stored = settings.getSecuritySettings(guildId);
  assert.equal(stored.raid.joinThreshold, 5);
  assert.equal(stored.nuke.threshold, 2);
});

test('security settings: values are clamped and normalized', () => {
  const raidConfig = settings.updateRaidConfig(guildId, {
    joinThreshold: 0,
    joinWindowSec: 1,
    accountAgeDays: 999,
    durationSec: 1,
    action: 'bad' as never,
  });
  assert.equal(raidConfig.joinThreshold, 1);
  assert.equal(raidConfig.joinWindowSec, 5);
  assert.equal(raidConfig.accountAgeDays, 365);
  assert.equal(raidConfig.durationSec, 30);
  assert.equal(raidConfig.action, 'alert');

  const nukeConfig = settings.updateNukeConfig(guildId, {
    threshold: 0,
    windowSec: 1,
    action: 'bad' as never,
  });
  assert.equal(nukeConfig.threshold, 1);
  assert.equal(nukeConfig.windowSec, 5);
  assert.equal(nukeConfig.action, 'alert');
});

test('raid runtime: manual mode and reset', () => {
  raid.resetRaidRuntime(guildId);
  assert.equal(raid.getRaidRuntime(guildId).active, false);
  assert.equal(raid.getRaidRuntime(guildId).joins, 0);

  raid.setRaidMode(guildId, 60_000);
  assert.equal(raid.getRaidRuntime(guildId).active, true);
  assert.ok(raid.getRaidRuntime(guildId).raidUntil);

  const persisted = storage.db
    .prepare('SELECT raid_until, raid_joins FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { raid_until: number; raid_joins: string } | undefined;
  assert.ok(persisted);
  assert.ok(Number(persisted.raid_until) > Date.now());

  raid.clearRaidMode(guildId);
  assert.equal(raid.getRaidRuntime(guildId).active, false);

  raid.resetRaidRuntime(guildId);
  assert.equal(raid.getRaidRuntime(guildId).joins, 0);

  const cleared = storage.db
    .prepare('SELECT raid_until, raid_joins FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { raid_until: number; raid_joins: string } | undefined;
  assert.equal(Number(cleared?.raid_until ?? -1), 0);
  assert.equal(cleared?.raid_joins, '[]');
});

test('nuke runtime: counters and reset', () => {
  nuke.resetNukeRuntime(guildId);
  assert.deepEqual(nuke.getNukeCounters(guildId), []);
  nuke.resetNukeRuntime();
  assert.deepEqual(nuke.getNukeCounters(guildId), []);
});

test('antiraid: threshold activates raid mode and sends alert', async () => {
  const raidGuildId = 'test-raid-guild';
  const sent: unknown[] = [];
  const logChannel = {
    id: 'log-1',
    isTextBased: () => true,
    send: async (payload: unknown) => {
      sent.push(payload);
      return { id: `message-${sent.length}` };
    },
  };

  const fakeGuild = {
    id: raidGuildId,
    name: 'Raid Guild',
    channels: { cache: new Map([['log-1', logChannel]]) },
  } as unknown as Guild;

  const fakeMember = {
    id: 'member-1',
    user: {
      tag: 'User#0001',
      bot: false,
      createdTimestamp: Date.now(),
      displayAvatarURL: () => '',
    },
    toString: () => '<@member-1>',
  } as unknown as GuildMember;

  logSettings.setLogChannel(raidGuildId, 'log-1');
  settings.updateRaidConfig(raidGuildId, {
    enabled: true,
    joinThreshold: 2,
    joinWindowSec: 60,
    accountAgeDays: 0,
    action: 'alert',
    durationSec: 60,
    ignoreBots: true,
  });
  raid.resetRaidRuntime(raidGuildId);

  await raid.handleRaidJoin(fakeGuild, fakeMember);
  assert.equal(sent.length, 0);

  await raid.handleRaidJoin(fakeGuild, fakeMember);
  assert.equal(sent.length, 1);
  assert.equal(raid.getRaidRuntime(raidGuildId).active, true);

  raid.resetRaidRuntime(raidGuildId);
});
