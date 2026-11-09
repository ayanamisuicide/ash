import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dbFile = path.join(os.tmpdir(), `probot-automod-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-automod-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const settings = await import('../src/lib/modSettings.js');
const panelSettings = await import('../src/web/settings.js');
const automod = await import('../src/events/automod.js');

const guildId = '123456789012345678';
const channelId = '323456789012345678';
const roleId = '423456789012345678';

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

test('automod: новые поля имеют безопасные значения по умолчанию', () => {
  const config = settings.getModerationSettings(guildId).automod;
  assert.equal(config.action, 'warn');
  assert.equal(config.durationMs, null);
  assert.equal(config.deleteMessage, true);
  assert.equal(config.capsPercent, 70);
  assert.equal(config.capsMinLength, 10);
  assert.equal(config.spamCount, 8);
  assert.equal(config.spamWindowSec, 10);
  assert.equal(config.spamDuplicateCount, 5);
  assert.deepEqual(config.ignoredChannels, []);
  assert.deepEqual(config.ignoredRoles, []);
});

test('automod: настройки сохраняются и нормализуются', () => {
  settings.updateAutomod(guildId, {
    action: 'timeout',
    durationMs: 3_600_000,
    deleteMessage: false,
    capsPercent: 85,
    capsMinLength: 20,
    spamCount: 5,
    spamWindowSec: 15,
    spamDuplicateCount: 3,
    ignoredChannels: ['123456789012345678', '123456789012345678'],
    ignoredRoles: ['223456789012345678'],
  });

  const config = settings.getModerationSettings(guildId).automod;
  assert.equal(config.action, 'timeout');
  assert.equal(config.durationMs, 3_600_000);
  assert.equal(config.deleteMessage, false);
  assert.equal(config.capsPercent, 85);
  assert.equal(config.capsMinLength, 20);
  assert.equal(config.spamCount, 5);
  assert.equal(config.spamWindowSec, 15);
  assert.equal(config.spamDuplicateCount, 3);
  assert.deepEqual(config.ignoredChannels, ['123456789012345678']);
  assert.deepEqual(config.ignoredRoles, ['223456789012345678']);

  settings.updateAutomod(guildId, { capsPercent: 1, spamCount: 10_000, durationMs: 0 });
  const clamped = settings.getModerationSettings(guildId).automod;
  assert.equal(clamped.capsPercent, 10);
  assert.equal(clamped.spamCount, 100);
  assert.equal(clamped.durationMs, null);
});

test('automod: панель валидирует действие, длительность и исключения', () => {
  const guild = {
    id: guildId,
    channels: { cache: new Map([[channelId, { id: channelId }]]) },
    roles: { cache: new Map([[roleId, { id: roleId, managed: false }]]) },
  } as unknown as import('discord.js').Guild;

  const updated = panelSettings.updateModerationSettings(guild, {
    automod: {
      action: 'timeout',
      duration: '1h',
      capsPercent: 80,
      capsMinLength: 12,
      spamCount: 6,
      spamWindowSec: 20,
      spamDuplicateCount: 4,
      ignoredChannels: [channelId],
      ignoredRoles: [roleId],
    },
  });

  assert.equal(updated.automod.action, 'timeout');
  assert.equal(updated.automod.durationMs, 3_600_000);
  assert.equal(updated.automod.capsPercent, 80);
  assert.equal(updated.automod.capsMinLength, 12);
  assert.equal(updated.automod.spamCount, 6);
  assert.equal(updated.automod.spamWindowSec, 20);
  assert.equal(updated.automod.spamDuplicateCount, 4);
  assert.deepEqual(updated.automod.ignoredChannels, [channelId]);
  assert.deepEqual(updated.automod.ignoredRoles, [roleId]);

  assert.throws(
    () => panelSettings.updateModerationSettings(guild, { automod: { action: 'nuke' } }),
    /неверное действие/,
  );
  assert.throws(
    () =>
      panelSettings.updateModerationSettings(guild, {
        automod: { action: 'timeout', duration: '30d' },
      }),
    /28 дней/,
  );
});

test('automod: CAPS учитывает настраиваемые пороги', () => {
  assert.equal(automod.capsViolation('HELLO WORLD', 5, 70), true);
  assert.equal(automod.capsViolation('Hello World', 5, 70), false);
  assert.equal(automod.capsViolation('HELLO', 10, 70), false);
  assert.equal(automod.capsViolation('HELLO', 5, 100), true);
});

test('automod: спам учитывает настраиваемые пороги', () => {
  automod.resetSpamState();
  assert.equal(automod.checkSpam('g1', 'u1', 'a', { messageLimit: 3 }), false);
  assert.equal(automod.checkSpam('g1', 'u1', 'b', { messageLimit: 3 }), false);
  assert.equal(automod.checkSpam('g1', 'u1', 'c', { messageLimit: 3 }), true);

  automod.resetSpamState();
  assert.equal(automod.checkSpam('g2', 'u2', 'same', { duplicateLimit: 2 }), false);
  assert.equal(automod.checkSpam('g2', 'u2', 'same', { duplicateLimit: 2 }), true);
});
