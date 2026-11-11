import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';

export interface LevelReward {
  level: number;
  roleId: string;
}

export interface CommunitySettings {
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  autoroleIds: string[];
  levelingEnabled: boolean;
  levelupChannelId: string | null;
  levelupMessage: string;
  /** XP за одно сообщение (0 — не начислять, статистика всё равно считается) */
  messageXp: number;
  /** Минимальная пауза между начислениями за сообщения, секунды (0 — за каждое) */
  messageCooldownSec: number;
  /** XP за каждые 5 минут в голосовом канале */
  voiceXp: number;
  /** Считать время в голосовых каналах */
  voiceTrackingEnabled: boolean;
  /** Роли за достижение уровня */
  levelRewards: LevelReward[];
  /** Снимать предыдущую награду при получении новой */
  levelRewardsReplacePrevious: boolean;
  tempVoiceChannelId: string | null;
  ticketCategoryId: string | null;
  ticketLogChannelId: string | null;
  ticketSupportRoleId: string | null;
}

export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = {
  welcomeChannelId: null,
  welcomeMessage: 'Добро пожаловать, {user}, на {guild}!',
  goodbyeChannelId: null,
  goodbyeMessage: '{user} покинул сервер {guild}.',
  autoroleIds: [],
  levelingEnabled: false,
  levelupChannelId: null,
  levelupMessage: '🎉 {user} достиг уровня {level}!',
  messageXp: 5,
  messageCooldownSec: 0,
  voiceXp: 10,
  voiceTrackingEnabled: true,
  levelRewards: [],
  levelRewardsReplacePrevious: true,
  tempVoiceChannelId: null,
  ticketCategoryId: null,
  ticketLogChannelId: null,
  ticketSupportRoleId: null,
};

interface CommunityRow {
  guild_id: string;
  welcome_channel_id: string | null;
  welcome_message: string;
  goodbye_channel_id: string | null;
  goodbye_message: string;
  autorole_ids: string;
  leveling_enabled: number;
  levelup_channel_id: string | null;
  levelup_message: string;
  message_xp: number | null;
  message_cooldown_sec: number | null;
  voice_xp: number | null;
  voice_tracking_enabled: number | null;
  level_rewards: string | null;
  level_rewards_replace_previous: number | null;
  temp_voice_channel_id: string | null;
  ticket_category_id: string | null;
  ticket_log_channel_id: string | null;
  ticket_support_role_id: string | null;
}

interface CacheEntry {
  at: number;
  value: CommunitySettings;
}

const CACHE_TTL_MS = (() => {
  const raw = Number(process.env.SETTINGS_CACHE_TTL_MS ?? 5_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5_000;
})();
const cache = new Map<string, CacheEntry>();

function invalidate(guildId: string): void {
  cache.delete(guildId);
}

function ensureRow(guildId: string): void {
  ensureGuild(guildId);
  db.prepare('INSERT OR IGNORE INTO community_settings (guild_id) VALUES (?)').run(guildId);
}

function parseLevelRewards(raw: string | null | undefined): LevelReward[] {
  if (!raw) return [];
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const levels = new Set<number>();
  const roles = new Set<string>();
  const rewards: LevelReward[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const level = Number((item as { level?: unknown }).level);
    const roleId = (item as { roleId?: unknown }).roleId;
    if (!Number.isInteger(level) || level < 1 || level > 1_000) continue;
    if (typeof roleId !== 'string' || !roleId) continue;
    if (levels.has(level) || roles.has(roleId)) continue;
    levels.add(level);
    roles.add(roleId);
    rewards.push({ level, roleId });
  }

  return rewards.sort((a, b) => a.level - b.level);
}

export function getCommunitySettings(guildId: string): CommunitySettings {
  if (CACHE_TTL_MS > 0) {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at <= CACHE_TTL_MS) return hit.value;
  }

  const row = db.prepare('SELECT * FROM community_settings WHERE guild_id = ?').get(guildId) as
    CommunityRow | undefined;

  const autoroles = row ? parseJson<unknown>(row.autorole_ids, []) : [];
  const value: CommunitySettings = {
    welcomeChannelId: row?.welcome_channel_id ?? null,
    welcomeMessage: row?.welcome_message ?? DEFAULT_COMMUNITY_SETTINGS.welcomeMessage,
    goodbyeChannelId: row?.goodbye_channel_id ?? null,
    goodbyeMessage: row?.goodbye_message ?? DEFAULT_COMMUNITY_SETTINGS.goodbyeMessage,
    autoroleIds: Array.isArray(autoroles)
      ? autoroles.filter((item): item is string => typeof item === 'string')
      : [],
    levelingEnabled: Number(row?.leveling_enabled ?? 0) === 1,
    levelupChannelId: row?.levelup_channel_id ?? null,
    levelupMessage: row?.levelup_message ?? DEFAULT_COMMUNITY_SETTINGS.levelupMessage,
    messageXp: Math.max(0, Number(row?.message_xp ?? DEFAULT_COMMUNITY_SETTINGS.messageXp)),
    messageCooldownSec: Math.max(
      0,
      Number(row?.message_cooldown_sec ?? DEFAULT_COMMUNITY_SETTINGS.messageCooldownSec),
    ),
    voiceXp: Math.max(0, Number(row?.voice_xp ?? DEFAULT_COMMUNITY_SETTINGS.voiceXp)),
    voiceTrackingEnabled:
      Number(
        row?.voice_tracking_enabled ?? (DEFAULT_COMMUNITY_SETTINGS.voiceTrackingEnabled ? 1 : 0),
      ) === 1,
    levelRewards: parseLevelRewards(row?.level_rewards),
    levelRewardsReplacePrevious: Number(row?.level_rewards_replace_previous ?? 1) === 1,
    tempVoiceChannelId: row?.temp_voice_channel_id ?? null,
    ticketCategoryId: row?.ticket_category_id ?? null,
    ticketLogChannelId: row?.ticket_log_channel_id ?? null,
    ticketSupportRoleId: row?.ticket_support_role_id ?? null,
  };

  if (CACHE_TTL_MS > 0) cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function updateCommunitySettings(
  guildId: string,
  patch: Partial<CommunitySettings>,
): CommunitySettings {
  ensureRow(guildId);
  const current = getCommunitySettings(guildId);
  const next = { ...current, ...patch };
  next.levelRewards = parseLevelRewards(JSON.stringify(next.levelRewards ?? []));

  db.prepare(
    `
    UPDATE community_settings SET
      welcome_channel_id = ?,
      welcome_message = ?,
      goodbye_channel_id = ?,
      goodbye_message = ?,
      autorole_ids = ?,
      leveling_enabled = ?,
      levelup_channel_id = ?,
      levelup_message = ?,
      message_xp = ?,
      message_cooldown_sec = ?,
      voice_xp = ?,
      voice_tracking_enabled = ?,
      level_rewards = ?,
      level_rewards_replace_previous = ?,
      temp_voice_channel_id = ?,
      ticket_category_id = ?,
      ticket_log_channel_id = ?,
      ticket_support_role_id = ?
    WHERE guild_id = ?
  `,
  ).run(
    next.welcomeChannelId,
    next.welcomeMessage,
    next.goodbyeChannelId,
    next.goodbyeMessage,
    toJson(next.autoroleIds),
    next.levelingEnabled ? 1 : 0,
    next.levelupChannelId,
    next.levelupMessage,
    Math.max(0, Math.floor(next.messageXp)),
    Math.max(0, Math.floor(next.messageCooldownSec)),
    Math.max(0, Math.floor(next.voiceXp)),
    next.voiceTrackingEnabled ? 1 : 0,
    toJson(next.levelRewards),
    next.levelRewardsReplacePrevious ? 1 : 0,
    next.tempVoiceChannelId,
    next.ticketCategoryId,
    next.ticketLogChannelId,
    next.ticketSupportRoleId,
    guildId,
  );

  invalidate(guildId);
  return next;
}

export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

// ---------------------------------------------------------------------------
// Уровни
// ---------------------------------------------------------------------------

export function xpNeeded(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(xp: number): { level: number; rest: number } {
  let level = 0;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpNeeded(level)) {
    rest -= xpNeeded(level);
    level++;
  }
  return { level, rest };
}

export interface LevelInfo {
  xp: number;
  level: number;
  rest: number;
  needed: number;
  lastXpAt: number;
  lastMessageAt: number;
  /** Сколько сообщений написал участник */
  messages: number;
  /** Сколько секунд провёл в голосовых каналах */
  voiceSeconds: number;
}

interface LevelRow {
  xp: number;
  last_xp_at: number;
  messages: number | null;
  voice_seconds: number | null;
  last_message_at: number | null;
}

function levelInfoFromRow(row: LevelRow | undefined): LevelInfo {
  const xp = Number(row?.xp ?? 0);
  const info = levelFromXp(xp);
  return {
    xp,
    level: info.level,
    rest: info.rest,
    needed: xpNeeded(info.level),
    lastXpAt: Number(row?.last_xp_at ?? 0),
    lastMessageAt: Number(row?.last_message_at ?? 0),
    messages: Number(row?.messages ?? 0),
    voiceSeconds: Number(row?.voice_seconds ?? 0),
  };
}

export function getLevelInfo(guildId: string, userId: string): LevelInfo {
  const row = db
    .prepare(
      `SELECT xp, last_xp_at, messages, voice_seconds, last_message_at
       FROM levels WHERE guild_id = ? AND user_id = ?`,
    )
    .get(guildId, userId) as LevelRow | undefined;
  return levelInfoFromRow(row);
}

export interface ActivityResult {
  /** Начислены ли очки: кулдаун или нулевая ставка могут отменить начисление */
  gained: boolean;
  before: LevelInfo;
  after: LevelInfo;
}

function ensureLevelRow(guildId: string, userId: string): void {
  ensureGuild(guildId);
  db.prepare('INSERT OR IGNORE INTO levels (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
}

/**
 * Начисляет XP и при необходимости увеличивает счётчик сообщений.
 * Счётчик растёт всегда, даже когда очки не начисляются из-за кулдауна:
 * статистика активности не должна зависеть от антиспам-настроек.
 */
function grantXp(
  guildId: string,
  userId: string,
  amount: number,
  cooldownMs: number,
  countMessage: boolean,
): ActivityResult {
  ensureLevelRow(guildId, userId);
  const before = getLevelInfo(guildId, userId);
  const now = Date.now();
  const value = Math.max(0, Math.floor(amount));
  const gained = value > 0 && (cooldownMs <= 0 || now - before.lastXpAt >= cooldownMs);
  const xp = before.xp + (gained ? value : 0);
  const lastXpAt = gained ? now : before.lastXpAt;
  const lastMessageAt = countMessage ? now : before.lastMessageAt;

  db.prepare(
    `
    UPDATE levels SET
      xp = ?,
      last_xp_at = ?,
      messages = messages + ?,
      last_message_at = ?
    WHERE guild_id = ? AND user_id = ?
  `,
  ).run(xp, lastXpAt, countMessage ? 1 : 0, lastMessageAt, guildId, userId);

  const info = levelFromXp(xp);
  return {
    gained,
    before,
    after: {
      xp,
      level: info.level,
      rest: info.rest,
      needed: xpNeeded(info.level),
      lastXpAt,
      lastMessageAt,
      messages: before.messages + (countMessage ? 1 : 0),
      voiceSeconds: before.voiceSeconds,
    },
  };
}

export function addXp(
  guildId: string,
  userId: string,
  amount: number,
  cooldownMs: number,
): ActivityResult {
  return grantXp(guildId, userId, amount, cooldownMs, false);
}

/** Учитывает сообщение: счётчик растёт всегда, XP — по ставке и кулдауну из настроек */
export function recordMessage(
  guildId: string,
  userId: string,
  xpAmount: number,
  cooldownMs: number,
): ActivityResult {
  return grantXp(guildId, userId, xpAmount, cooldownMs, true);
}

/** Начисляет XP за голос без счётчика сообщений */
export function recordVoiceXp(guildId: string, userId: string, amount: number): ActivityResult {
  return grantXp(guildId, userId, amount, 0, false);
}

/** Прибавляет секунды в голосовых каналах */
export function addVoiceSeconds(guildId: string, userId: string, seconds: number): void {
  const value = Math.floor(seconds);
  if (!Number.isFinite(value) || value <= 0) return;

  ensureGuild(guildId);
  db.prepare(
    `
    INSERT INTO levels (guild_id, user_id, voice_seconds)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      voice_seconds = levels.voice_seconds + excluded.voice_seconds
  `,
  ).run(guildId, userId, value);
}

export type LeaderboardMetric = 'xp' | 'messages' | 'voice';

export interface LeaderboardRow {
  userId: string;
  xp: number;
  level: number;
  messages: number;
  voiceSeconds: number;
}

export interface ActivityEntry extends LeaderboardRow {
  lastMessageAt: number;
  lastXpAt: number;
}

/** Все участники с активностью — для выгрузки и полной статистики. */
export function listActivity(guildId: string, limit = 5_000): ActivityEntry[] {
  const rows = db
    .prepare(
      `
      SELECT user_id, xp, messages, voice_seconds, last_message_at, last_xp_at
      FROM levels
      WHERE guild_id = ?
      ORDER BY xp DESC, messages DESC, voice_seconds DESC
      LIMIT ?
    `,
    )
    .all(guildId, limit) as unknown as Array<{
    user_id: string;
    xp: number;
    messages: number;
    voice_seconds: number;
    last_message_at: number;
    last_xp_at: number;
  }>;

  return rows.map((row) => ({
    userId: row.user_id,
    xp: Number(row.xp),
    level: levelFromXp(Number(row.xp)).level,
    messages: Number(row.messages),
    voiceSeconds: Number(row.voice_seconds),
    lastMessageAt: Number(row.last_message_at),
    lastXpAt: Number(row.last_xp_at),
  }));
}

const LEADERBOARD_COLUMNS: Record<LeaderboardMetric, string> = {
  xp: 'xp',
  messages: 'messages',
  voice: 'voice_seconds',
};

/** Топ участников по XP, сообщениям или времени в голосе */
export function getLeaderboard(
  guildId: string,
  limit = 10,
  metric: LeaderboardMetric = 'xp',
): LeaderboardRow[] {
  const column = LEADERBOARD_COLUMNS[metric] ?? 'xp';
  const rows = db
    .prepare(
      `
      SELECT user_id, xp, messages, voice_seconds FROM levels
      WHERE guild_id = ? AND ${column} > 0
      ORDER BY ${column} DESC, xp DESC, user_id ASC
      LIMIT ?
    `,
    )
    .all(guildId, limit) as unknown as Array<{
    user_id: string;
    xp: number;
    messages: number;
    voice_seconds: number;
  }>;

  return rows.map((row) => ({
    userId: row.user_id,
    xp: Number(row.xp),
    level: levelFromXp(Number(row.xp)).level,
    messages: Number(row.messages),
    voiceSeconds: Number(row.voice_seconds),
  }));
}

export interface MemberRanks {
  /** Место в топе по XP (0 — активности ещё нет) */
  xp: number;
  messages: number;
  voice: number;
}

/** Места участника в топах по каждой метрике */
export function getMemberRanks(guildId: string, userId: string): MemberRanks {
  const stats = getLevelInfo(guildId, userId);

  const rankOf = (column: 'xp' | 'messages' | 'voice_seconds', value: number): number => {
    if (value <= 0) return 0;
    const row = db
      .prepare(
        `
        SELECT COUNT(*) AS count FROM levels
        WHERE guild_id = ? AND (${column} > ? OR (${column} = ? AND user_id < ?))
      `,
      )
      .get(guildId, value, value, userId) as { count: number } | undefined;
    return 1 + Number(row?.count ?? 0);
  };

  return {
    xp: rankOf('xp', stats.xp),
    messages: rankOf('messages', stats.messages),
    voice: rankOf('voice_seconds', stats.voiceSeconds),
  };
}

// ---------------------------------------------------------------------------
// Теги
// ---------------------------------------------------------------------------

export interface Tag {
  name: string;
  content: string;
  authorId: string;
  createdAt: number;
}

export function getTag(guildId: string, name: string): Tag | null {
  const row = db
    .prepare('SELECT * FROM tags WHERE guild_id = ? AND name = ?')
    .get(guildId, name.toLowerCase()) as
    { name: string; content: string; author_id: string; created_at: number } | undefined;
  if (!row) return null;
  return {
    name: row.name,
    content: row.content,
    authorId: row.author_id,
    createdAt: Number(row.created_at),
  };
}

export function setTag(guildId: string, name: string, content: string, authorId: string): Tag {
  ensureGuild(guildId);
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO tags (guild_id, name, content, author_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, name) DO UPDATE SET
      content = excluded.content,
      author_id = excluded.author_id,
      created_at = excluded.created_at
  `,
  ).run(guildId, name.toLowerCase(), content, authorId, now);
  return { name: name.toLowerCase(), content, authorId, createdAt: now };
}

export function deleteTag(guildId: string, name: string): boolean {
  const result = db
    .prepare('DELETE FROM tags WHERE guild_id = ? AND name = ?')
    .run(guildId, name.toLowerCase());
  return Number(result.changes) > 0;
}

export function listTags(guildId: string): Tag[] {
  const rows = db
    .prepare('SELECT * FROM tags WHERE guild_id = ? ORDER BY name')
    .all(guildId) as unknown as Array<{
    name: string;
    content: string;
    author_id: string;
    created_at: number;
  }>;
  return rows.map((row) => ({
    name: row.name,
    content: row.content,
    authorId: row.author_id,
    createdAt: Number(row.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Реакционные роли
// ---------------------------------------------------------------------------

export interface ReactionRole {
  messageId: string;
  emoji: string;
  roleId: string;
}

export function addReactionRole(
  guildId: string,
  messageId: string,
  emoji: string,
  roleId: string,
): void {
  ensureGuild(guildId);
  db.prepare(
    `
    INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, message_id, emoji) DO UPDATE SET role_id = excluded.role_id
  `,
  ).run(guildId, messageId, emoji, roleId);
}

export function removeReactionRole(guildId: string, messageId: string, emoji: string): boolean {
  const result = db
    .prepare(
      `
      DELETE FROM reaction_roles
      WHERE guild_id = ? AND message_id = ? AND emoji = ?
    `,
    )
    .run(guildId, messageId, emoji);
  return Number(result.changes) > 0;
}

export function getReactionRole(
  guildId: string,
  messageId: string,
  emoji: string,
): ReactionRole | null {
  const row = db
    .prepare(
      `
      SELECT message_id, emoji, role_id FROM reaction_roles
      WHERE guild_id = ? AND message_id = ? AND emoji = ?
    `,
    )
    .get(guildId, messageId, emoji) as
    { message_id: string; emoji: string; role_id: string } | undefined;
  return row ? { messageId: row.message_id, emoji: row.emoji, roleId: row.role_id } : null;
}

export function listReactionRoles(guildId: string): ReactionRole[] {
  const rows = db
    .prepare(
      `
      SELECT message_id, emoji, role_id FROM reaction_roles
      WHERE guild_id = ? ORDER BY message_id, emoji
    `,
    )
    .all(guildId) as unknown as Array<{
    message_id: string;
    emoji: string;
    role_id: string;
  }>;
  return rows.map((row) => ({
    messageId: row.message_id,
    emoji: row.emoji,
    roleId: row.role_id,
  }));
}

// ---------------------------------------------------------------------------
// Тикеты
// ---------------------------------------------------------------------------

export interface Ticket {
  channelId: string;
  userId: string;
  status: 'open' | 'closed';
  createdAt: number;
  closedAt: number | null;
}

export function createTicket(guildId: string, channelId: string, userId: string): Ticket {
  ensureGuild(guildId);
  const ticket: Ticket = {
    channelId,
    userId,
    status: 'open',
    createdAt: Date.now(),
    closedAt: null,
  };
  db.prepare(
    `
    INSERT INTO tickets (guild_id, channel_id, user_id, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(guildId, channelId, userId, ticket.status, ticket.createdAt);
  return ticket;
}

export function getTicket(guildId: string, channelId: string): Ticket | null {
  const row = db
    .prepare('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId) as
    | {
        channel_id: string;
        user_id: string;
        status: string;
        created_at: number;
        closed_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    channelId: row.channel_id,
    userId: row.user_id,
    status: row.status === 'closed' ? 'closed' : 'open',
    createdAt: Number(row.created_at),
    closedAt: row.closed_at === null ? null : Number(row.closed_at),
  };
}

export function closeTicket(guildId: string, channelId: string): void {
  db.prepare(
    `
    UPDATE tickets SET status = 'closed', closed_at = ?
    WHERE guild_id = ? AND channel_id = ? AND status = 'open'
  `,
  ).run(Date.now(), guildId, channelId);
}

export function listTickets(guildId: string, status?: 'open' | 'closed'): Ticket[] {
  const rows = (status
    ? db
        .prepare('SELECT * FROM tickets WHERE guild_id = ? AND status = ? ORDER BY created_at DESC')
        .all(guildId, status)
    : db
        .prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC')
        .all(guildId)) as unknown as Array<{
    channel_id: string;
    user_id: string;
    status: string;
    created_at: number;
    closed_at: number | null;
  }>;

  return rows.map((row) => ({
    channelId: row.channel_id,
    userId: row.user_id,
    status: row.status === 'closed' ? 'closed' : 'open',
    createdAt: Number(row.created_at),
    closedAt: row.closed_at === null ? null : Number(row.closed_at),
  }));
}

export function findOpenTicket(guildId: string, userId: string): Ticket | null {
  const row = db
    .prepare(
      `
      SELECT * FROM tickets
      WHERE guild_id = ? AND user_id = ? AND status = 'open'
      ORDER BY created_at DESC LIMIT 1
    `,
    )
    .get(guildId, userId) as
    | {
        channel_id: string;
        user_id: string;
        status: string;
        created_at: number;
        closed_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    channelId: row.channel_id,
    userId: row.user_id,
    status: 'open',
    createdAt: Number(row.created_at),
    closedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Временные голосовые каналы
// ---------------------------------------------------------------------------

export interface TempVoice {
  channelId: string;
  guildId: string;
  ownerId: string;
  createdAt: number;
}

export function addTempVoice(guildId: string, channelId: string, ownerId: string): TempVoice {
  ensureGuild(guildId);
  const voice: TempVoice = {
    channelId,
    guildId,
    ownerId,
    createdAt: Date.now(),
  };
  db.prepare(
    `
    INSERT OR REPLACE INTO temp_voice_channels
      (channel_id, guild_id, owner_id, created_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(channelId, guildId, ownerId, voice.createdAt);
  return voice;
}

export function getTempVoice(channelId: string): TempVoice | null {
  const row = db
    .prepare('SELECT * FROM temp_voice_channels WHERE channel_id = ?')
    .get(channelId) as
    | {
        channel_id: string;
        guild_id: string;
        owner_id: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
  };
}

export function removeTempVoice(channelId: string): void {
  db.prepare('DELETE FROM temp_voice_channels WHERE channel_id = ?').run(channelId);
}

export function listTempVoices(guildId: string): TempVoice[] {
  const rows = db
    .prepare('SELECT * FROM temp_voice_channels WHERE guild_id = ?')
    .all(guildId) as unknown as Array<{
    channel_id: string;
    guild_id: string;
    owner_id: string;
    created_at: number;
  }>;
  return rows.map((row) => ({
    channelId: row.channel_id,
    guildId: row.guild_id,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
  }));
}
