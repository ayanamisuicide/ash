import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dbFile = path.join(os.tmpdir(), `probot-member-leave-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-member-leave-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const cases = await import('../src/lib/cases.js');
const warns = await import('../src/lib/warns.js');
const cleanup = await import('../src/lib/punishmentCleanup.js');

const guildId = '123456789012345678';
const userId = '223456789012345678';
const otherUserId = '323456789012345678';
const moderatorId = '423456789012345678';
const muteRoleId = '523456789012345678';
const tempRoleId = '623456789012345678';

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

test('выход участника: варны и активные наказания сбрасываются, бан остаётся', () => {
  warns.addWarn(guildId, userId, moderatorId, 'Первый варн');
  warns.addWarn(guildId, otherUserId, moderatorId, 'Чужой варн');

  const warnCase = cases.createCase({
    guildId,
    type: 'warn',
    userId,
    moderatorId,
    reason: 'Первый варн',
    extra: { warnId: 'warn-1' },
  });
  const muteCase = cases.createCase({
    guildId,
    type: 'mute',
    userId,
    moderatorId,
    reason: 'Мут',
    extra: { roleId: muteRoleId },
  });
  const timeoutCase = cases.createCase({
    guildId,
    type: 'timeout',
    userId,
    moderatorId,
    reason: 'Таймаут',
  });
  const tempRoleCase = cases.createCase({
    guildId,
    type: 'temprole',
    userId,
    moderatorId,
    reason: 'Временная роль',
    extra: { roleId: tempRoleId },
  });
  const banCase = cases.createCase({
    guildId,
    type: 'ban',
    userId,
    moderatorId,
    reason: 'Бан',
  });
  const otherWarnCase = cases.createCase({
    guildId,
    type: 'warn',
    userId: otherUserId,
    moderatorId,
    reason: 'Чужой варн',
  });

  assert.deepEqual(cases.activePunishmentRoleIds(guildId, userId).sort(), [muteRoleId, tempRoleId]);

  const removedWarns = cleanup.clearMemberPunishments(guildId, userId);
  assert.equal(removedWarns, 1);
  assert.deepEqual(warns.getWarns(guildId, userId), []);
  assert.equal(warns.getWarns(guildId, otherUserId).length, 1);

  const byId = new Map(
    cases.searchCases(guildId, { pageSize: 100 }).items.map((item) => [item.id, item]),
  );
  assert.equal(byId.get(warnCase.id)?.active, false);
  assert.equal(byId.get(warnCase.id)?.extra.closedReason, cleanup.MEMBER_LEFT_REASON);
  assert.equal(byId.get(muteCase.id)?.active, false);
  assert.equal(byId.get(timeoutCase.id)?.active, false);
  assert.equal(byId.get(tempRoleCase.id)?.active, false);
  assert.equal(byId.get(banCase.id)?.active, true);
  assert.equal(byId.get(otherWarnCase.id)?.active, true);

  assert.deepEqual(cases.activePunishmentRoleIds(guildId, userId), []);
});
