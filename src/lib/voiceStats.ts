import type { Client } from 'discord.js';
import { db, ensureGuild } from '../storage/sqlite.js';
import { addVoiceSeconds, getCommunitySettings, recordVoiceXp } from './community.js';
import { announceLevelUps } from './communityMessages.js';

/**
 * Учёт голосовой активности.
 *
 * Сессия открывается при входе в голосовой канал и закрывается при выходе,
 * переходе в другой канал или пропаже канала. Долгие сессии «оплачиваются»
 * таймером: каждые 5 минут участник получает XP, а накопленные секунды
 * сбрасываются в агрегат `levels.voice_seconds`.
 */

/** Интервал начисления XP за голос */
export const VOICE_XP_INTERVAL_MS = 5 * 60_000;

/** Как часто проверяются открытые сессии */
export const VOICE_TICK_MS = 60_000;

export interface VoiceSession {
  id: number;
  guildId: string;
  userId: string;
  channelId: string;
  joinedAt: number;
  lastTickAt: number;
  awardedIntervals: number;
}

interface VoiceSessionRow {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string;
  joined_at: number;
  last_tick_at: number;
  awarded_intervals: number;
}

function rowToSession(row: VoiceSessionRow): VoiceSession {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    userId: row.user_id,
    channelId: row.channel_id,
    joinedAt: Number(row.joined_at),
    lastTickAt: Number(row.last_tick_at),
    awardedIntervals: Number(row.awarded_intervals),
  };
}

/** Открытая сессия участника, если она есть */
export function getOpenVoiceSession(guildId: string, userId: string): VoiceSession | null {
  const row = db
    .prepare(
      `
      SELECT * FROM voice_sessions
      WHERE guild_id = ? AND user_id = ? AND left_at IS NULL
      ORDER BY id DESC LIMIT 1
    `,
    )
    .get(guildId, userId) as VoiceSessionRow | undefined;
  return row ? rowToSession(row) : null;
}

/** Все открытые сессии (для тикера и «сейчас в голосе») */
export function listOpenVoiceSessions(guildId?: string): VoiceSession[] {
  const rows = (guildId
    ? db.prepare('SELECT * FROM voice_sessions WHERE left_at IS NULL AND guild_id = ?').all(guildId)
    : db
        .prepare('SELECT * FROM voice_sessions WHERE left_at IS NULL')
        .all()) as unknown as VoiceSessionRow[];
  return rows.map(rowToSession);
}

interface SettleResult {
  seconds: number;
  xp: number;
  /** Новый уровень, если голосовой XP его поднял */
  levelUp: { level: number; xp: number } | null;
}

/**
 * Списывает накопленное время и начисляет XP за прошедшие пятиминутки.
 * При close=true сессия закрывается.
 */
function settleSession(session: VoiceSession, now: number, close: boolean): SettleResult {
  const settings = getCommunitySettings(session.guildId);
  const seconds = Math.max(0, Math.floor((now - session.lastTickAt) / 1_000));
  const dueIntervals = Math.floor(Math.max(0, now - session.joinedAt) / VOICE_XP_INTERVAL_MS);
  const intervals = Math.max(0, dueIntervals - session.awardedIntervals);
  const xpPerInterval = settings.levelingEnabled ? Math.max(0, settings.voiceXp) : 0;
  const gained = intervals * xpPerInterval;
  const awarded = session.awardedIntervals + intervals;
  let levelUp: SettleResult['levelUp'] = null;

  if (seconds > 0) addVoiceSeconds(session.guildId, session.userId, seconds);
  if (gained > 0) {
    const result = recordVoiceXp(session.guildId, session.userId, gained);
    if (result.after.level > result.before.level) {
      levelUp = { level: result.after.level, xp: result.after.xp };
    }
  }

  if (close) {
    db.prepare(
      `
      UPDATE voice_sessions
      SET last_tick_at = ?, awarded_intervals = ?, left_at = ?
      WHERE id = ?
    `,
    ).run(now, awarded, now, session.id);
  } else {
    db.prepare(
      `
      UPDATE voice_sessions
      SET last_tick_at = ?, awarded_intervals = ?
      WHERE id = ?
    `,
    ).run(now, awarded, session.id);
  }

  return { seconds, xp: gained, levelUp };
}

/** Открывает сессию; предыдущая открытая сессия участника закрывается */
export function openVoiceSession(
  guildId: string,
  userId: string,
  channelId: string,
  now = Date.now(),
): void {
  ensureGuild(guildId);
  closeVoiceSession(guildId, userId, now);

  db.prepare(
    `
    INSERT INTO voice_sessions
      (guild_id, user_id, channel_id, joined_at, last_tick_at, awarded_intervals)
    VALUES (?, ?, ?, ?, ?, 0)
  `,
  ).run(guildId, userId, channelId, now, now);
}

/** Закрывает сессию участника, начисляя оставшееся время и XP */
export function closeVoiceSession(guildId: string, userId: string, now = Date.now()): SettleResult {
  const session = getOpenVoiceSession(guildId, userId);
  if (!session) return { seconds: 0, xp: 0, levelUp: null };

  const settings = getCommunitySettings(guildId);
  if (!settings.voiceTrackingEnabled) {
    db.prepare('UPDATE voice_sessions SET left_at = ?, last_tick_at = ? WHERE id = ?').run(
      now,
      now,
      session.id,
    );
    return { seconds: 0, xp: 0, levelUp: null };
  }

  return settleSession(session, now, true);
}

export interface VoiceLevelUp {
  guildId: string;
  userId: string;
  level: number;
  xp: number;
}

export interface VoiceTickResult {
  sessions: number;
  seconds: number;
  xp: number;
  /** Повышения уровня, о которых нужно уведомить канал */
  levelUps: VoiceLevelUp[];
}

/**
 * Проходит по всем открытым сессиям: копит секунды и выдаёт XP за пятиминутки.
 * Возвращает суммарные показатели и повышения уровня для уведомлений.
 */
export function tickVoiceSessions(now = Date.now()): VoiceTickResult {
  let seconds = 0;
  let xp = 0;
  const levelUps: VoiceLevelUp[] = [];
  const sessions = listOpenVoiceSessions();

  for (const session of sessions) {
    const settings = getCommunitySettings(session.guildId);
    if (!settings.voiceTrackingEnabled) {
      db.prepare('UPDATE voice_sessions SET left_at = ?, last_tick_at = ? WHERE id = ?').run(
        now,
        now,
        session.id,
      );
      continue;
    }

    const result = settleSession(session, now, false);
    seconds += result.seconds;
    xp += result.xp;
    if (result.levelUp) {
      levelUps.push({
        guildId: session.guildId,
        userId: session.userId,
        level: result.levelUp.level,
        xp: result.levelUp.xp,
      });
    }
  }

  return { sessions: sessions.length, seconds, xp, levelUps };
}

/**
 * Закрывает «висящие» сессии после падения или рестарта: время простоя,
 * пока бот был выключен, не начисляется.
 */
export function closeStaleVoiceSessions(): number {
  const rows = db
    .prepare('SELECT id FROM voice_sessions WHERE left_at IS NULL')
    .all() as unknown as Array<{ id: number }>;

  for (const row of rows) {
    db.prepare(
      'UPDATE voice_sessions SET left_at = last_tick_at WHERE id = ? AND left_at IS NULL',
    ).run(row.id);
  }
  return rows.length;
}

export interface VoiceClientLike {
  guilds: {
    cache: Iterable<
      [
        string,
        {
          id: string;
          afkChannelId: string | null;
          voiceStates: {
            cache: Iterable<[string, { id: string; channelId: string | null }]>;
          };
        },
      ]
    >;
  };
}

/**
 * На старте открывает сессии для тех, кто уже сидит в голосовых каналах:
 * иначе время до первого события голоса терялось бы.
 */
export function bootstrapVoiceSessions(client: VoiceClientLike, now = Date.now()): number {
  let opened = 0;

  for (const [, guild] of client.guilds.cache) {
    if (!getCommunitySettings(guild.id).voiceTrackingEnabled) continue;

    for (const [, state] of guild.voiceStates.cache) {
      if (!state.channelId) continue;
      if (guild.afkChannelId && state.channelId === guild.afkChannelId) continue;
      openVoiceSession(guild.id, state.id, state.channelId, now);
      opened++;
    }
  }

  return opened;
}

/** Отправляет уведомления о новых уровнях, заработанных в голосе */
async function announceVoiceLevelUps(client: Client, levelUps: VoiceLevelUp[]): Promise<void> {
  for (const item of levelUps) {
    const guild = client.guilds.cache.get(item.guildId);
    if (!guild) continue;
    await announceLevelUps(guild, [{ userId: item.userId, level: item.level, xp: item.xp }]);
  }
}

let timer: NodeJS.Timeout | null = null;

/** Запускает минутный тикер учёта голоса */
export function startVoiceTicker(client?: VoiceClientLike): void {
  if (timer) return;

  const stale = closeStaleVoiceSessions();
  if (stale > 0) {
    console.log(`[activity] закрыто зависших голосовых сессий: ${stale}`);
  }

  if (client) {
    const opened = bootstrapVoiceSessions(client);
    if (opened > 0) console.log(`[activity] восстановлено голосовых сессий: ${opened}`);
  }

  const discordClient = client as unknown as Client | undefined;

  timer = setInterval(() => {
    try {
      const result = tickVoiceSessions();
      if (discordClient && result.levelUps.length > 0) {
        void announceVoiceLevelUps(discordClient, result.levelUps).catch((error: unknown) => {
          console.error('[activity] не удалось отправить уведомление об уровне:', error);
        });
      }
    } catch (error) {
      console.error('[activity] ошибка учёта голоса:', error);
    }
  }, VOICE_TICK_MS);

  console.log('[activity] учёт сообщений и времени в голосе запущен');
}

export function stopVoiceTicker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function isVoiceTickerRunning(): boolean {
  return timer !== null;
}
