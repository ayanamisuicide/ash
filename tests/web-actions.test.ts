import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild } from 'discord.js';

const dbFile = path.join(os.tmpdir(), `probot-web-actions-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-web-actions-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const actions = await import('../src/web/actions.js');

const guild = {} as unknown as Guild;
const moderatorId = '123456789012345678';
const userId = '223456789012345678';
const roleId = '323456789012345678';

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

test('panel actions: requireUserId rejects malformed ids', () => {
  assert.equal(actions.requireUserId(' 123456789012345678 '), '123456789012345678');
  assert.throws(() => actions.requireUserId('abc'), /ID/);
  assert.throws(() => actions.requireUserId(123), /ID/);
  assert.throws(() => actions.requireUserId('123'), /ID/);
});

test('panel actions: optionalDuration accepts formats and rejects garbage', () => {
  assert.equal(actions.optionalDuration(''), null);
  assert.equal(actions.optionalDuration(undefined), null);
  assert.equal(actions.optionalDuration(' 1h '), '1h');
  assert.throws(() => actions.optionalDuration('завтра'), /длительности/i);
});

test('panel actions: role action validates before touching Discord', async () => {
  await assert.rejects(
    actions.roleFromPanel(guild, moderatorId, { userId, roleId, action: 'set', reason: 'test' }),
    /действие/i,
  );
  await assert.rejects(
    actions.roleFromPanel(guild, moderatorId, {
      userId,
      roleId: 'abc',
      action: 'add',
      reason: 'test',
    }),
    /ID роли/i,
  );
  await assert.rejects(
    actions.roleFromPanel(guild, moderatorId, {
      userId: 'abc',
      roleId,
      action: 'add',
      reason: 'test',
    }),
    /ID/,
  );
});

test('panel actions: member actions validate the target id first', async () => {
  await assert.rejects(actions.muteFromPanel(guild, moderatorId, { userId: 'abc', reason: 'x' }));
  await assert.rejects(actions.unmuteFromPanel(guild, moderatorId, { userId: 'abc' }));
  await assert.rejects(actions.clearWarnsFromPanel(guild, moderatorId, { userId: 'abc' }));
});

test('panel actions: mute requires a valid duration when provided', async () => {
  await assert.rejects(
    actions.muteFromPanel(guild, moderatorId, { userId, duration: 'завтра', reason: 'x' }),
    /длительности/i,
  );
});
