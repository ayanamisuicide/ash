import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-analytics-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');
const cases = await import('../src/lib/cases.js');
const appeals = await import('../src/lib/appeals.js');
const { getModerationAnalytics } = await import('../src/lib/analytics.js');

const guildId = 'analytics-guild';

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('analytics: агрегирует кейсы, модераторов и апелляции', () => {
  cases.createCase({
    guildId,
    type: 'ban',
    userId: 'user-1',
    moderatorId: 'mod-1',
    reason: 'реклама',
  });
  cases.createCase({
    guildId,
    type: 'warn',
    userId: 'user-1',
    moderatorId: 'mod-1',
    reason: 'спам',
  });
  cases.createCase({
    guildId,
    type: 'timeout',
    userId: 'user-2',
    moderatorId: 'mod-2',
    reason: 'флуд',
  });

  appeals.createAppeal(guildId, 'user-1', 'разбаньте');
  const second = appeals.createAppeal(guildId, 'user-2', 'снимите мут');
  appeals.updateAppeal(guildId, second.id, { status: 'rejected' });

  const result = getModerationAnalytics(guildId, 30);

  assert.equal(result.totals.cases, 3);
  assert.equal(result.totals.bans, 1);
  assert.equal(result.totals.warnings, 1);
  assert.equal(result.totals.active, 3);

  assert.equal(result.byType.find((slice) => slice.type === 'ban')?.count, 1);
  assert.equal(result.byType.find((slice) => slice.type === 'warn')?.count, 1);
  assert.equal(result.topModerators[0]?.id, 'mod-1');
  assert.equal(result.topModerators[0]?.count, 2);
  assert.equal(result.topUsers[0]?.id, 'user-1');
  assert.equal(result.topUsers[0]?.count, 2);
  assert.equal(result.appeals.pending, 1);
  assert.equal(result.appeals.rejected, 1);
  assert.equal(result.daily.length, 30);
});
