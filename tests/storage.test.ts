import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dbFile = path.join(os.tmpdir(), `probot-test-${process.pid}.sqlite`);
const legacyFile = path.join(os.tmpdir(), `probot-no-legacy-${process.pid}.json`);

process.env.DB_FILE = dbFile;
process.env.DATA_FILE = legacyFile;

const storage = await import('../src/storage/sqlite.js');
const cases = await import('../src/lib/cases.js');
const warns = await import('../src/lib/warns.js');
const notes = await import('../src/lib/notes.js');
const appeals = await import('../src/lib/appeals.js');
const settings = await import('../src/lib/modSettings.js');
const logSettings = await import('../src/lib/logSettings.js');
const locks = await import('../src/lib/locks.js');

const guildId = 'test-guild';
const userId = 'user-1';
const moderatorId = 'mod-1';

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

test('cases: create, read, update, close', () => {
  const created = cases.createCase({
    guildId,
    type: 'warn',
    userId,
    moderatorId,
    reason: 'test warn',
    extra: { warnId: 'warn-1' },
  });

  assert.equal(created.id, 1);
  assert.equal(cases.getCase(guildId, created.id)?.reason, 'test warn');
  assert.equal(cases.listCases(guildId, userId).length, 1);

  cases.updateCase(guildId, created.id, { reason: 'updated' });
  assert.equal(cases.getCase(guildId, created.id)?.reason, 'updated');

  cases.closeCase(guildId, created.id, 'closed');
  const closed = cases.getCase(guildId, created.id);
  assert.equal(closed?.active, false);
  assert.equal(closed?.extra.closedReason, 'closed');
});

test('cases: sequence and warn lookup', () => {
  const warnCase = cases.createCase({
    guildId,
    type: 'warn',
    userId,
    moderatorId,
    reason: 'warn lookup',
    extra: { warnId: 'warn-2' },
  });
  const banCase = cases.createCase({
    guildId,
    type: 'ban',
    userId,
    moderatorId,
    reason: 'ban',
  });

  assert.equal(warnCase.id, 2);
  assert.equal(banCase.id, 3);
  assert.equal(cases.findCaseByWarnId(guildId, userId, 'warn-2')?.id, warnCase.id);
});

test('cases: close active by type', () => {
  const closeGuild = 'test-close-guild';
  const ban = cases.createCase({
    guildId: closeGuild,
    type: 'ban',
    userId,
    moderatorId,
    reason: 'ban',
  });
  const timeout = cases.createCase({
    guildId: closeGuild,
    type: 'timeout',
    userId,
    moderatorId,
    reason: 'timeout',
    expiresAt: Date.now() + 60_000,
  });

  const closed = cases.closeActiveCases(closeGuild, userId, ['ban', 'timeout']);
  assert.equal(closed, 2);
  assert.equal(cases.getCase(closeGuild, ban.id)?.active, false);
  assert.equal(cases.getCase(closeGuild, timeout.id)?.active, false);
  assert.equal(cases.listCases(closeGuild).length, 2);
});

test('cases: close warn cases', () => {
  const warnGuild = 'test-warn-case-guild';
  const first = cases.createCase({
    guildId: warnGuild,
    type: 'warn',
    userId,
    moderatorId,
    reason: 'one',
  });
  const second = cases.createCase({
    guildId: warnGuild,
    type: 'warn',
    userId,
    moderatorId,
    reason: 'two',
  });

  const closed = cases.closeWarnCases(warnGuild, userId);
  assert.equal(closed.length, 2);
  assert.equal(cases.getCase(warnGuild, first.id)?.active, false);
  assert.equal(cases.getCase(warnGuild, second.id)?.active, false);
  assert.equal(cases.getCase(warnGuild, first.id)?.extra.closedReason, 'Снятие предупреждений');
});

test('warns: expiry filters old warnings', () => {
  const expiryGuild = 'test-expiry-guild';
  storage.ensureGuild(expiryGuild);
  settings.setWarnExpiry(expiryGuild, 1);

  storage.db
    .prepare(
      `
    INSERT INTO warns (guild_id, user_id, id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(expiryGuild, userId, 'old-warn', moderatorId, 'old', Date.now() - 2 * 86_400_000);

  assert.equal(warns.getWarns(expiryGuild, userId).length, 0);
  const added = warns.addWarn(expiryGuild, userId, moderatorId, 'new');
  assert.equal(added.total, 1);
});

test('warns: add, remove, clear', () => {
  const first = warns.addWarn(guildId, userId, moderatorId, 'first');
  assert.equal(first.total, 1);
  assert.equal(warns.getWarns(guildId, userId).length, 1);

  const second = warns.addWarn(guildId, userId, moderatorId, 'second');
  assert.equal(second.total, 2);
  assert.equal(warns.removeWarn(guildId, userId, first.warn.id)?.reason, 'first');
  assert.equal(warns.getWarns(guildId, userId).length, 1);

  const cleared = warns.clearWarns(guildId, userId);
  assert.equal(cleared.length, 1);
  assert.equal(warns.getWarns(guildId, userId).length, 0);
});

test('notes: add, remove, clear', () => {
  const note = notes.addNote(guildId, userId, moderatorId, 'note');
  assert.equal(notes.getNotes(guildId, userId).length, 1);
  assert.equal(notes.removeNote(guildId, userId, note.id)?.text, 'note');

  notes.addNote(guildId, userId, moderatorId, 'a');
  notes.addNote(guildId, userId, moderatorId, 'b');
  assert.equal(notes.clearNotes(guildId, userId).length, 2);
  assert.equal(notes.getNotes(guildId, userId).length, 0);
});

test('appeals: create, update, pending lookup', () => {
  const appeal = appeals.createAppeal(guildId, userId, 'please unban');
  assert.equal(appeal.id, 1);
  assert.equal(appeals.findPendingAppeal(guildId, userId)?.id, appeal.id);

  appeals.updateAppeal(guildId, appeal.id, {
    status: 'approved',
    reviewedBy: moderatorId,
    reviewComment: 'разбан по апелляции',
  });
  const updated = appeals.getAppeal(guildId, appeal.id);
  assert.equal(updated?.status, 'approved');
  assert.equal(updated?.reviewedBy, moderatorId);
  assert.equal(updated?.reviewComment, 'разбан по апелляции');
  assert.equal(appeals.findPendingAppeal(guildId, userId), null);

  const second = appeals.createAppeal(guildId, 'another-user', 'second appeal', 42);
  assert.equal(second.caseId, 42);
  assert.equal(appeals.findPendingAppealForCase(guildId, 42)?.id, second.id);
  assert.equal(appeals.deleteAppeal(guildId, second.id), true);
  assert.equal(appeals.getAppeal(guildId, second.id), null);
  assert.equal(appeals.findPendingAppealForCase(guildId, 42), null);
  assert.equal(appeals.deleteAppeal(guildId, second.id), false);
});

test('moderation settings: immunity, warn actions, automod', () => {
  assert.equal(settings.addImmunityRole(guildId, 'role-1'), true);
  assert.equal(settings.addImmunityRole(guildId, 'role-1'), false);
  assert.deepEqual(settings.getModerationSettings(guildId).immunityRoles, ['role-1']);

  const action = settings.addWarnAction(guildId, {
    count: 3,
    windowDays: 7,
    action: 'timeout',
    durationMs: 600_000,
  });
  assert.equal(settings.getModerationSettings(guildId).warnActions.length, 1);
  assert.equal(settings.removeWarnAction(guildId, action.id), true);

  settings.updateAutomod(guildId, { enabled: true });
  assert.equal(settings.addAutomodWord(guildId, 'badword'), true);
  assert.equal(settings.addAutomodWord(guildId, 'BADWORD'), false);
  assert.equal(settings.getModerationSettings(guildId).automod.words.length, 1);
  assert.equal(settings.removeAutomodWord(guildId, 'badword'), true);
});

test('log settings: channel, categories, events, reset', () => {
  logSettings.setLogChannel(guildId, 'channel-1');
  logSettings.setLogCategory(guildId, 'messages', false);
  logSettings.setLogEvent(guildId, 'messageCreate', false);

  const config = logSettings.getLogConfig(guildId);
  assert.equal(config.channelId, 'channel-1');
  assert.equal(config.categories.messages, false);
  assert.equal(config.events.messageCreate, false);

  logSettings.resetLogFilters(guildId);
  const reset = logSettings.getLogConfig(guildId);
  assert.equal(reset.channelId, 'channel-1');
  assert.equal(reset.categories.messages, true);
  assert.equal(reset.events.messageCreate, false);
});

test('locks: set, get, list, clear', () => {
  locks.setLock(guildId, 'channel-1', { allow: '0', deny: '2048' });
  assert.deepEqual(locks.getLock(guildId, 'channel-1'), { allow: '0', deny: '2048' });
  assert.deepEqual(Object.keys(locks.listLocks(guildId)), ['channel-1']);

  locks.clearLock(guildId, 'channel-1');
  assert.equal(locks.getLock(guildId, 'channel-1'), null);
  assert.equal(Object.keys(locks.listLocks(guildId)).length, 0);
});
