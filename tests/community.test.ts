import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-community-'));
const dbFile = path.join(tempDir, 'bot.sqlite');
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');
const community = await import('../src/lib/community.js');
const rolepersist = await import('../src/lib/rolepersist.js');
const confirmations = await import('../src/lib/confirmations.js');

const guildId = 'community-guild';
const userId = 'user-1';

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('community settings: defaults and updates', () => {
  const defaults = community.getCommunitySettings(guildId);
  assert.equal(defaults.levelingEnabled, false);
  assert.deepEqual(defaults.autoroleIds, []);
  assert.equal(defaults.messageXp, 5);
  assert.equal(defaults.messageCooldownSec, 0);
  assert.equal(defaults.voiceXp, 10);
  assert.equal(defaults.voiceTrackingEnabled, true);

  community.updateCommunitySettings(guildId, {
    welcomeChannelId: 'welcome-channel',
    autoroleIds: ['role-1', 'role-2'],
    levelingEnabled: true,
    levelupMessage: 'Level {level} for {user}',
  });

  const updated = community.getCommunitySettings(guildId);
  assert.equal(updated.welcomeChannelId, 'welcome-channel');
  assert.deepEqual(updated.autoroleIds, ['role-1', 'role-2']);
  assert.equal(updated.levelingEnabled, true);
});

test('levels: xp, level and leaderboard', () => {
  const first = community.addXp(guildId, userId, 100, 0);
  assert.equal(first.gained, true);
  assert.equal(first.after.level, 1);

  const second = community.addXp(guildId, userId, 50, 0);
  assert.equal(second.after.xp, 150);
  assert.equal(second.after.level, 1);

  const board = community.getLeaderboard(guildId);
  assert.equal(board[0]?.userId, userId);
  assert.equal(board[0]?.xp, 150);
});

test('tags: set, get, list, delete', () => {
  community.setTag(guildId, 'Rules', 'Be nice', userId);
  const tag = community.getTag(guildId, 'rules');
  assert.equal(tag?.content, 'Be nice');
  assert.equal(community.listTags(guildId).length, 1);
  assert.equal(community.deleteTag(guildId, 'RULES'), true);
  assert.equal(community.getTag(guildId, 'rules'), null);
});

test('reaction roles: add, get, list, remove', () => {
  community.addReactionRole(guildId, 'message-1', '👍', 'role-1');
  assert.equal(community.getReactionRole(guildId, 'message-1', '👍')?.roleId, 'role-1');
  assert.equal(community.listReactionRoles(guildId).length, 1);
  assert.equal(community.removeReactionRole(guildId, 'message-1', '👍'), true);
  assert.equal(community.listReactionRoles(guildId).length, 0);
});

test('tickets: create, find, close', () => {
  const ticket = community.createTicket(guildId, 'channel-1', userId);
  assert.equal(ticket.status, 'open');
  assert.equal(community.findOpenTicket(guildId, userId)?.channelId, 'channel-1');

  community.closeTicket(guildId, 'channel-1');
  assert.equal(community.findOpenTicket(guildId, userId), null);
  assert.equal(community.getTicket(guildId, 'channel-1')?.status, 'closed');
});

test('temp voice: add, get, list, remove', () => {
  const voice = community.addTempVoice(guildId, 'voice-1', userId);
  assert.equal(voice.ownerId, userId);
  assert.equal(community.getTempVoice('voice-1')?.guildId, guildId);
  assert.equal(community.listTempVoices(guildId).length, 1);
  community.removeTempVoice('voice-1');
  assert.equal(community.getTempVoice('voice-1'), null);
});

test('rolepersist: storage operations', () => {
  rolepersist.setPersistedRoles(guildId, userId, ['role-1', 'role-2', 'role-1']);
  assert.deepEqual(rolepersist.getPersistedRoles(guildId, userId), ['role-1', 'role-2']);
  assert.equal(rolepersist.removePersistedRole(guildId, userId, 'role-1'), true);
  assert.deepEqual(rolepersist.getPersistedRoles(guildId, userId), ['role-2']);
  rolepersist.clearPersistedRoles(guildId, userId);
  assert.deepEqual(rolepersist.getPersistedRoles(guildId, userId), []);
});

test('confirmations: scoped take', () => {
  const id = confirmations.createConfirmation({
    guildId,
    userId,
    kind: 'lockdown',
    permission: 0n,
    payload: { enabled: true },
  });

  assert.equal(confirmations.takeConfirmation(id, guildId, 'other'), null);
  const pending = confirmations.takeConfirmation(id, guildId, userId);
  assert.equal(pending?.kind, 'lockdown');
  assert.equal(confirmations.takeConfirmation(id, guildId, userId), null);
});
