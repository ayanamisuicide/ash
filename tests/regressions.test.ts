import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild, GuildMember } from 'discord.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-regressions-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');
process.env.SETTINGS_CACHE_TTL_MS = '0';

const storage = await import('../src/storage/sqlite.js');
const cases = await import('../src/lib/cases.js');
const warns = await import('../src/lib/warns.js');
const moderation = await import('../src/lib/moderation.js');
const rolepersist = await import('../src/lib/rolepersist.js');
const automod = await import('../src/events/automod.js');
const { fitFields } = await import('../src/lib/logging.js');

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('storage: вложенная транзакция не открывает второй BEGIN', () => {
  const created = storage.transaction(() =>
    storage.transaction(() =>
      cases.createCase({
        guildId: 'nested-guild',
        type: 'warn',
        userId: 'user-1',
        moderatorId: 'mod-1',
        reason: 'nested',
      }),
    ),
  );

  assert.equal(created.guildId, 'nested-guild');
  assert.equal(cases.getCase('nested-guild', created.id)?.reason, 'nested');
});

test('storage: откат транзакции не оставляет частичных данных', () => {
  assert.throws(() =>
    storage.transaction(() => {
      storage.ensureGuild('rollback-guild');
      throw new Error('boom');
    }),
  );

  const row = storage.db
    .prepare('SELECT COUNT(*) AS count FROM guilds WHERE id = ?')
    .get('rollback-guild') as { count: number };
  assert.equal(Number(row.count), 0);
});

test('cases: поиск экранирует спецсимволы LIKE', () => {
  const guildId = 'like-guild';
  cases.createCase({
    guildId,
    type: 'warn',
    userId: 'user-1',
    moderatorId: 'mod-1',
    reason: '100% бан',
  });
  cases.createCase({
    guildId,
    type: 'warn',
    userId: 'user-2',
    moderatorId: 'mod-1',
    reason: 'обычная причина',
  });

  assert.equal(cases.searchCases(guildId, { query: '%' }).total, 1);
  assert.equal(cases.searchCases(guildId, { query: '_' }).total, 0);
  assert.equal(cases.searchCases(guildId, { query: 'обычная' }).total, 1);
  assert.equal(cases.searchCases(guildId, { query: 'бан' }).total, 1);
});

test('cases: статистика по типам считается в SQL', () => {
  const guildId = 'stats-guild';
  cases.createCase({ guildId, type: 'ban', userId: 'u1', moderatorId: 'mod-1', reason: 'a' });
  cases.createCase({ guildId, type: 'ban', userId: 'u2', moderatorId: 'mod-1', reason: 'b' });
  cases.createCase({ guildId, type: 'warn', userId: 'u1', moderatorId: 'mod-2', reason: 'c' });

  assert.deepEqual(
    cases.countCasesByType(guildId).map((item) => [item.type, item.count]),
    [
      ['ban', 2],
      ['warn', 1],
    ],
  );
  assert.deepEqual(
    cases
      .countCasesByType(guildId, { moderatorId: 'mod-2' })
      .map((item) => [item.type, item.count]),
    [['warn', 1]],
  );
});

test('warn rules: срабатывает наибольший достигнутый порог', () => {
  const rules = [
    { id: 'a', count: 3, windowDays: 7, action: 'timeout' as const, durationMs: 60_000 },
    { id: 'b', count: 5, windowDays: 30, action: 'ban' as const, durationMs: null },
  ];

  assert.equal(
    moderation.pickWarnRule(rules, () => 2),
    null,
  );
  assert.equal(moderation.pickWarnRule(rules, () => 4)?.count, 3);
  assert.equal(moderation.pickWarnRule(rules, () => 5)?.count, 5);
  assert.equal(moderation.pickWarnRule(rules, () => 12)?.count, 5);
  // окно учитывается: у правила «3» свежих варнов нет, у «5» — три
  assert.equal(
    moderation.pickWarnRule(rules, (rule) => (rule.count === 3 ? 0 : 3)),
    null,
  );
});

test('automod: флуд разными сообщениями ловится', () => {
  automod.resetSpamState();
  for (let index = 0; index < 7; index++) {
    assert.equal(automod.checkSpam('spam-guild', 'spam-user', `msg-${index}`), false);
  }
  assert.equal(automod.checkSpam('spam-guild', 'spam-user', 'msg-7'), true);
});

test('automod: повтор одного текста ловится', () => {
  automod.resetSpamState();
  for (let index = 0; index < 4; index++) {
    assert.equal(automod.checkSpam('dup-guild', 'dup-user', 'одно и то же'), false);
  }
  assert.equal(automod.checkSpam('dup-guild', 'dup-user', 'одно и то же'), true);
});

test('warns: идентификаторы случайные, длинные и уникальные', () => {
  const guildId = 'ids-guild';
  const first = warns.addWarn(guildId, 'user-1', 'mod-1', 'one');
  const second = warns.addWarn(guildId, 'user-1', 'mod-1', 'two');

  assert.notEqual(first.warn.id, second.warn.id);
  assert.ok(first.warn.id.length >= 8);
  assert.match(first.warn.id, /^[A-Za-z0-9_-]+$/);
});

test('logging: fitFields укладывает длинный список в бюджет текста', () => {
  const fields = Array.from({ length: 10 }, (_, index) => ({
    label: `#${index} · кейс · <t:1700000000:d>`,
    value: 'x'.repeat(900),
  }));

  const fitted = fitFields(fields);
  const total = fitted.reduce((sum, item) => sum + item.label.length + item.value.length, 0);

  assert.equal(fitted.length, 10);
  assert.ok(total <= 3_450, `суммарный текст ${total} больше бюджета`);
  assert.ok(fitted[0]!.value.length < 900);

  const short = [{ label: 'a', value: 'b' }];
  assert.deepEqual(fitFields(short), short);
});

test('rolepersist: кик/бан не запоминает роли', () => {
  const guildId = 'rp-guild';
  const member = {
    id: 'rp-user',
    user: { bot: false },
    roles: {
      cache: new Map([['role-1', { id: 'role-1', position: 1, managed: false }]]),
    },
  } as unknown as GuildMember;
  const guild = {
    id: guildId,
    members: { me: { roles: { highest: { position: 10 } } } },
  } as unknown as Guild;

  rolepersist.saveMemberRoles(guild, member);
  assert.deepEqual(rolepersist.getPersistedRoles(guildId, 'rp-user'), ['role-1']);

  rolepersist.clearPersistedRoles(guildId, 'rp-user');
  rolepersist.markModerationRemoval(guildId, 'rp-user');
  rolepersist.saveMemberRoles(guild, member);
  assert.deepEqual(rolepersist.getPersistedRoles(guildId, 'rp-user'), []);
});
