import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-case-events-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');
const cases = await import('../src/lib/cases.js');
const { addCaseEvent, listCaseEvents } = await import('../src/lib/caseEvents.js');

const guildId = 'case-events-guild';

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('case events: создание и ручные изменения', () => {
  const item = cases.createCase({
    guildId,
    type: 'warn',
    userId: 'user-1',
    moderatorId: 'mod-1',
    reason: 'спам',
  });

  const created = listCaseEvents(guildId, item.id);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.kind, 'created');
  assert.deepEqual(created[0]?.details.reason, 'спам');

  addCaseEvent(guildId, item.id, 'mod-2', 'reason', { from: 'спам', to: 'флуд' });

  const events = listCaseEvents(guildId, item.id);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.kind, 'reason');
  assert.equal(events[0]?.actorId, 'mod-2');
  assert.equal(events[0]?.details.to, 'флуд');
});
