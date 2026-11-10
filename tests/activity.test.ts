import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { Collection } from 'discord.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-activity-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');
// Кэш настроек мешает проверять смену ставок внутри одного процесса.
process.env.SETTINGS_CACHE_TTL_MS = '0';

const storage = await import('../src/storage/sqlite.js');
const community = await import('../src/lib/community.js');
const voice = await import('../src/lib/voiceStats.js');
const data = await import('../src/web/data.js');

const START = 1_700_000_000_000;

after(() => {
  voice.stopVoiceTicker();
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('messages: каждое сообщение даёт XP и увеличивает счётчик', () => {
  const guildId = 'g-messages';
  community.updateCommunitySettings(guildId, {
    levelingEnabled: true,
    messageXp: 7,
    messageCooldownSec: 0,
  });

  const first = community.recordMessage(guildId, 'u1', 7, 0);
  const second = community.recordMessage(guildId, 'u1', 7, 0);

  assert.equal(first.gained, true);
  assert.equal(second.gained, true);
  assert.equal(second.after.xp, 14);
  assert.equal(second.after.messages, 2);
  assert.equal(community.getLevelInfo(guildId, 'u1').messages, 2);
});

test('messages: кулдаун блокирует XP, но не счётчик сообщений', () => {
  const guildId = 'g-cooldown';
  community.updateCommunitySettings(guildId, { levelingEnabled: true, messageXp: 5 });

  const first = community.recordMessage(guildId, 'u1', 5, 60_000);
  const second = community.recordMessage(guildId, 'u1', 5, 60_000);

  assert.equal(first.gained, true);
  assert.equal(second.gained, false);
  assert.equal(second.after.xp, 5);
  assert.equal(second.after.messages, 2);
});

test('messages: нулевая ставка считает сообщения без очков', () => {
  const guildId = 'g-zero-xp';
  community.updateCommunitySettings(guildId, { levelingEnabled: true, messageXp: 0 });

  const result = community.recordMessage(guildId, 'u1', 0, 0);
  assert.equal(result.gained, false);
  assert.equal(result.after.messages, 1);
  assert.equal(result.after.xp, 0);
});

test('топы: XP, сообщения и голос сортируются независимо', () => {
  const guildId = 'g-boards';
  community.recordMessage(guildId, 'a', 5, 0);
  community.recordMessage(guildId, 'a', 5, 0);
  community.recordMessage(guildId, 'b', 5, 0);
  community.addVoiceSeconds(guildId, 'b', 7_200);

  const byXp = community.getLeaderboard(guildId, 10, 'xp');
  assert.equal(byXp[0]?.userId, 'a');
  assert.equal(byXp[0]?.xp, 10);

  const byMessages = community.getLeaderboard(guildId, 10, 'messages');
  assert.equal(byMessages[0]?.userId, 'a');
  assert.equal(byMessages[0]?.messages, 2);

  const byVoice = community.getLeaderboard(guildId, 10, 'voice');
  assert.equal(byVoice.length, 1);
  assert.equal(byVoice[0]?.userId, 'b');
  assert.equal(byVoice[0]?.voiceSeconds, 7_200);

  const ranks = community.getMemberRanks(guildId, 'b');
  assert.equal(ranks.xp, 2);
  assert.equal(ranks.messages, 2);
  assert.equal(ranks.voice, 1);
});

test('голос: XP начисляется ровно за каждые 5 минут, время копится', () => {
  const guildId = 'g-voice';
  community.updateCommunitySettings(guildId, {
    levelingEnabled: true,
    voiceXp: 10,
    voiceTrackingEnabled: true,
  });

  voice.openVoiceSession(guildId, 'u1', 'ch', START);
  assert.equal(voice.listOpenVoiceSessions(guildId).length, 1);

  voice.tickVoiceSessions(START + 4 * 60_000);
  assert.equal(community.getLevelInfo(guildId, 'u1').xp, 0);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 240);

  voice.tickVoiceSessions(START + 5 * 60_000);
  assert.equal(community.getLevelInfo(guildId, 'u1').xp, 10);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 300);

  // Полной пятиминутки не прошло — повторного начисления быть не должно.
  voice.tickVoiceSessions(START + 6 * 60_000);
  assert.equal(community.getLevelInfo(guildId, 'u1').xp, 10);

  voice.tickVoiceSessions(START + 12 * 60_000);
  assert.equal(community.getLevelInfo(guildId, 'u1').xp, 20);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 720);

  const closed = voice.closeVoiceSession(guildId, 'u1', START + 13 * 60_000);
  assert.equal(closed.seconds, 60);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 780);
  assert.equal(voice.listOpenVoiceSessions(guildId).length, 0);
});

test('голос: уровни выключены — время считается, XP нет', () => {
  const guildId = 'g-voice-noxp';
  community.updateCommunitySettings(guildId, {
    levelingEnabled: false,
    voiceXp: 10,
    voiceTrackingEnabled: true,
  });

  voice.openVoiceSession(guildId, 'u1', 'ch', START);
  voice.tickVoiceSessions(START + 10 * 60_000);

  const info = community.getLevelInfo(guildId, 'u1');
  assert.equal(info.xp, 0);
  assert.equal(info.voiceSeconds, 600);
});

test('голос: выключенный учёт закрывает сессию без начислений', () => {
  const guildId = 'g-voice-off';
  community.updateCommunitySettings(guildId, {
    levelingEnabled: true,
    voiceTrackingEnabled: false,
  });

  voice.openVoiceSession(guildId, 'u1', 'ch', START);
  voice.tickVoiceSessions(START + 15 * 60_000);

  assert.equal(voice.listOpenVoiceSessions(guildId).length, 0);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 0);
  assert.equal(community.getLevelInfo(guildId, 'u1').xp, 0);
});

test('голос: зависшие сессии закрываются без времени простоя', () => {
  const guildId = 'g-voice-stale';
  community.updateCommunitySettings(guildId, { voiceTrackingEnabled: true });

  voice.openVoiceSession(guildId, 'u1', 'ch', START);
  assert.ok(voice.closeStaleVoiceSessions() >= 1);

  assert.equal(voice.listOpenVoiceSessions(guildId).length, 0);
  assert.equal(community.getLevelInfo(guildId, 'u1').voiceSeconds, 0);
});

test('голос: bootstrap берёт только небоевые каналы', () => {
  const guildId = 'g-bootstrap';
  community.updateCommunitySettings(guildId, { voiceTrackingEnabled: true });

  const client = {
    guilds: {
      cache: new Map([
        [
          guildId,
          {
            id: guildId,
            afkChannelId: 'afk',
            voiceStates: {
              cache: new Map([
                ['u1', { id: 'u1', channelId: 'ch' }],
                ['u2', { id: 'u2', channelId: 'afk' }],
                ['u3', { id: 'u3', channelId: null }],
              ]),
            },
          },
        ],
      ]),
    },
  };

  const opened = voice.bootstrapVoiceSessions(client, START);
  assert.equal(opened, 1);

  const sessions = voice.listOpenVoiceSessions(guildId);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.userId, 'u1');
  assert.equal(sessions[0]?.channelId, 'ch');
});

test('тикер: запускается и останавливается', () => {
  voice.startVoiceTicker();
  assert.equal(voice.isVoiceTickerRunning(), true);
  voice.stopVoiceTicker();
  assert.equal(voice.isVoiceTickerRunning(), false);
});

test('панель: сводка активности отдаёт топы и живые сессии', () => {
  const guildId = '100000000000000777';
  community.updateCommunitySettings(guildId, {
    levelingEnabled: true,
    messageXp: 5,
    voiceXp: 10,
  });
  community.recordMessage(guildId, '100000000000000778', 5, 0);
  community.recordMessage(guildId, '100000000000000778', 5, 0);

  const alice = {
    displayName: 'Алиса',
    user: { id: '100000000000000778', username: 'alice', globalName: null, avatar: null },
  };
  const guild = {
    id: guildId,
    memberCount: 1,
    members: { cache: new Map([[alice.user.id, alice]]) },
    client: { users: { cache: new Map() } },
  };

  const overview = data.getActivityOverview(guild as never, START);
  assert.equal(overview.totals.messages, 2);
  assert.equal(overview.totals.xp, 10);
  assert.equal(overview.top.xp[0]?.userId, alice.user.id);
  assert.equal(overview.top.xp[0]?.name, 'Алиса');
  assert.equal(overview.settings.messageXp, 5);
  assert.equal(overview.voiceIntervalMinutes, 5);
  assert.deepEqual(overview.live, []);
});

test('панель: профиль участника содержит активность и места в топах', async () => {
  const guildId = '100000000000000880';
  const userId = '100000000000000881';
  community.recordMessage(guildId, userId, 5, 0);
  community.addVoiceSeconds(guildId, userId, 900);

  const user = {
    id: userId,
    username: 'bob',
    globalName: 'Bob',
    bot: false,
    avatar: null,
    createdTimestamp: START,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
  };
  const member = {
    id: userId,
    user,
    displayName: 'Bob',
    joinedTimestamp: START,
    communicationDisabledUntilTimestamp: null,
    roles: { cache: new Collection(), highest: { name: '@everyone' } },
    kickable: true,
    bannable: true,
    moderatable: true,
  };
  const guild = {
    id: guildId,
    memberCount: 1,
    roles: { cache: new Collection() },
    members: {
      cache: new Collection([[userId, member]]),
      fetch: async () => member,
    },
    bans: {
      fetch: async () => {
        throw new Error('not banned');
      },
    },
    client: { users: { cache: new Collection() } },
  };

  const profile = await data.getMemberProfile(guild as never, userId);
  assert.equal(profile.activity.messages, 1);
  assert.equal(profile.activity.voiceSeconds, 900);
  assert.equal(profile.activity.ranks.voice, 1);
  assert.equal(profile.activity.xp, 5);
});
