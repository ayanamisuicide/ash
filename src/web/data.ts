import type { Guild, GuildMember, User } from 'discord.js';
import { searchCases, type ModCase, type CaseType } from '../lib/cases.js';
import {
  getCommunitySettings,
  getLeaderboard,
  getLevelInfo,
  getMemberRanks,
  type LeaderboardMetric,
  type LeaderboardRow,
} from '../lib/community.js';
import { findMuteRole } from '../lib/moderation.js';
import { getNotes } from '../lib/notes.js';
import { getSecuritySettings } from '../lib/modSettings.js';
import { getWarns } from '../lib/warns.js';
import { listOpenVoiceSessions, VOICE_XP_INTERVAL_MS } from '../lib/voiceStats.js';
import { db } from '../storage/sqlite.js';
import { avatarUrl } from './discord.js';
import { HttpError } from './http.js';

export interface BotInfo {
  tag: string | null;
  id: string | null;
  ping: number;
  uptime: number;
  guilds: number;
}

export function getBotInfo(client: {
  user: { tag?: string; id?: string } | null;
  ws: { ping: number };
  guilds: { cache: { size: number } };
}): BotInfo {
  return {
    tag: client.user?.tag ?? null,
    id: client.user?.id ?? null,
    ping: Math.round(client.ws.ping),
    uptime: Math.floor(process.uptime()),
    guilds: client.guilds.cache.size,
  };
}

function scalar(sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export interface Overview {
  stats: {
    members: number;
    totalCases: number;
    todayCases: number;
    activeCases: number;
    warns: number;
    notes: number;
    pendingAppeals: number;
    totalAppeals: number;
  };
  activeByType: Array<{ type: CaseType; count: number }>;
  recentCases: ModCase[];
  security: ReturnType<typeof getSecuritySettings>;
  bot: BotInfo;
}

export function getOverview(guild: Guild, client: Parameters<typeof getBotInfo>[0]): Overview {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const activeRows = db
    .prepare(
      `
      SELECT type, COUNT(*) AS count
      FROM cases
      WHERE guild_id = ? AND active = 1
      GROUP BY type
      ORDER BY count DESC
    `,
    )
    .all(guild.id) as unknown as Array<{ type: string; count: number }>;

  return {
    stats: {
      members: guild.memberCount,
      totalCases: scalar('SELECT COUNT(*) AS count FROM cases WHERE guild_id = ?', guild.id),
      todayCases: scalar(
        'SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND created_at >= ?',
        guild.id,
        startOfDay.getTime(),
      ),
      activeCases: scalar(
        'SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND active = 1',
        guild.id,
      ),
      warns: scalar('SELECT COUNT(*) AS count FROM warns WHERE guild_id = ?', guild.id),
      notes: scalar('SELECT COUNT(*) AS count FROM notes WHERE guild_id = ?', guild.id),
      pendingAppeals: scalar(
        "SELECT COUNT(*) AS count FROM appeals WHERE guild_id = ? AND status = 'pending'",
        guild.id,
      ),
      totalAppeals: scalar('SELECT COUNT(*) AS count FROM appeals WHERE guild_id = ?', guild.id),
    },
    activeByType: activeRows.map((row) => ({
      type: row.type as CaseType,
      count: Number(row.count),
    })),
    recentCases: searchCases(guild.id, { pageSize: 6 }).items,
    security: getSecuritySettings(guild.id),
    bot: getBotInfo(client),
  };
}

export interface ActivityMemberStat {
  userId: string;
  /** Имя из кэша; null — участник уже не на сервере */
  name: string | null;
  avatarUrl: string | null;
  level: number;
  xp: number;
  messages: number;
  voiceSeconds: number;
}

export interface ActivityLiveSession {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  channelId: string;
  seconds: number;
}

/** GET /api/guilds/:guildId/activity — сводка по сообщениям и голосу */
export interface ActivityOverview {
  settings: {
    levelingEnabled: boolean;
    messageXp: number;
    messageCooldownSec: number;
    voiceXp: number;
    voiceTrackingEnabled: boolean;
  };
  /** Сколько XP даётся за одну пятиминутку в голосе */
  voiceIntervalMinutes: number;
  totals: {
    tracked: number;
    messages: number;
    voiceSeconds: number;
    xp: number;
  };
  top: Record<LeaderboardMetric, ActivityMemberStat[]>;
  live: ActivityLiveSession[];
}

function memberIdentity(
  guild: Guild,
  userId: string,
): { name: string | null; avatarUrl: string | null } {
  const member = guild.members.cache.get(userId);
  const user = member?.user ?? guild.client.users.cache.get(userId);
  if (!user) return { name: null, avatarUrl: null };
  return {
    name: member?.displayName ?? user.username,
    avatarUrl: avatarUrl(userToDiscordUser(user), 64),
  };
}

function activityStat(guild: Guild, row: LeaderboardRow): ActivityMemberStat {
  return {
    userId: row.userId,
    ...memberIdentity(guild, row.userId),
    level: row.level,
    xp: row.xp,
    messages: row.messages,
    voiceSeconds: row.voiceSeconds,
  };
}

export function getActivityOverview(guild: Guild, now = Date.now()): ActivityOverview {
  const settings = getCommunitySettings(guild.id);
  const totalsRow = db
    .prepare(
      `
      SELECT
        COUNT(*) AS tracked,
        COALESCE(SUM(messages), 0) AS messages,
        COALESCE(SUM(voice_seconds), 0) AS voice,
        COALESCE(SUM(xp), 0) AS xp
      FROM levels
      WHERE guild_id = ? AND (messages > 0 OR voice_seconds > 0 OR xp > 0)
    `,
    )
    .get(guild.id) as { tracked: number; messages: number; voice: number; xp: number } | undefined;

  const top: Record<LeaderboardMetric, ActivityMemberStat[]> = {
    xp: getLeaderboard(guild.id, 5, 'xp').map((row) => activityStat(guild, row)),
    messages: getLeaderboard(guild.id, 5, 'messages').map((row) => activityStat(guild, row)),
    voice: getLeaderboard(guild.id, 5, 'voice').map((row) => activityStat(guild, row)),
  };

  const live = listOpenVoiceSessions(guild.id)
    .map((session) => ({
      userId: session.userId,
      ...memberIdentity(guild, session.userId),
      channelId: session.channelId,
      seconds: Math.max(0, Math.floor((now - session.joinedAt) / 1_000)),
    }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    settings: {
      levelingEnabled: settings.levelingEnabled,
      messageXp: settings.messageXp,
      messageCooldownSec: settings.messageCooldownSec,
      voiceXp: settings.voiceXp,
      voiceTrackingEnabled: settings.voiceTrackingEnabled,
    },
    voiceIntervalMinutes: Math.round(VOICE_XP_INTERVAL_MS / 60_000),
    totals: {
      tracked: Number(totalsRow?.tracked ?? 0),
      messages: Number(totalsRow?.messages ?? 0),
      voiceSeconds: Number(totalsRow?.voice ?? 0),
      xp: Number(totalsRow?.xp ?? 0),
    },
    top,
    live,
  };
}

export interface MemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
  joinedAt: number | null;
  createdAt: number | null;
  timeoutUntil: number | null;
  /** На участнике сейчас роль мута */
  muted: boolean;
  highestRole: string | null;
}

function userToDiscordUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName ?? null,
    avatar: user.avatar ?? null,
  };
}

export function serializeMember(
  member: GuildMember,
  muteRoleId: string | null = null,
): MemberSummary {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatarUrl: avatarUrl(userToDiscordUser(member.user), 64),
    bot: member.user.bot,
    joinedAt: member.joinedTimestamp,
    createdAt: member.user.createdTimestamp,
    timeoutUntil: member.communicationDisabledUntilTimestamp ?? null,
    muted: muteRoleId ? member.roles.cache.has(muteRoleId) : false,
    highestRole: member.roles.highest.name,
  };
}

export interface MemberListOptions {
  page?: number;
  pageSize?: number;
}

export interface MemberListPage {
  items: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** true — в кэше бота не все участники, список может быть неполным */
  partial: boolean;
}

const MEMBER_FETCH_COOLDOWN_MS = 120_000;
const memberFetchAt = new Map<string, number>();

/**
 * Подтягивает участников в кэш, если Discord ещё не отдал их при подключении.
 * Повторные запросы в пределах кулдауна не дёргают gateway.
 */
async function ensureMembersCached(guild: Guild): Promise<void> {
  if (guild.members.cache.size >= guild.memberCount) return;

  const last = memberFetchAt.get(guild.id) ?? 0;
  if (Date.now() - last < MEMBER_FETCH_COOLDOWN_MS) return;
  memberFetchAt.set(guild.id, Date.now());

  await guild.members.fetch({ time: 10_000 }).catch(() => null);
}

function memberMatches(member: GuildMember, needle: string): boolean {
  return (
    member.id === needle ||
    member.user.username.toLowerCase().includes(needle) ||
    (member.user.globalName?.toLowerCase().includes(needle) ?? false) ||
    member.displayName.toLowerCase().includes(needle) ||
    (member.nickname?.toLowerCase().includes(needle) ?? false)
  );
}

function compareMembers(a: GuildMember, b: GuildMember): number {
  if (a.user.bot !== b.user.bot) return a.user.bot ? 1 : -1;
  return (
    a.displayName.localeCompare(b.displayName, 'ru', { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Список участников для панели: сначала локальный кэш (мгновенно), при
 * необходимости — запрос в gateway. Поддерживает поиск и пагинацию.
 */
export async function searchMembers(
  guild: Guild,
  rawQuery: string,
  options: MemberListOptions = {},
): Promise<MemberListPage> {
  const query = rawQuery.trim();
  const needle = query.toLowerCase();
  const rawPageSize = Number(options.pageSize ?? 50);
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
    : 50;
  const rawPage = Number(options.page ?? 1);
  const requestedPage = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;

  // Роль мута нужна и в результатах поиска, чтобы показать бейдж без открытия профиля.
  const muteRoleId = (await findMuteRole(guild))?.id ?? null;

  if (/^\d{17,20}$/.test(query)) {
    const member =
      guild.members.cache.get(query) ?? (await guild.members.fetch(query).catch(() => null));
    const items = member ? [serializeMember(member, muteRoleId)] : [];
    return {
      items,
      total: items.length,
      page: 1,
      pageSize,
      pages: 1,
      partial: false,
    };
  }

  await ensureMembersCached(guild);
  let members = [...guild.members.cache.values()];

  // Если кэш неполный, пробуем найти совпадения через gateway.
  if (query && members.length < guild.memberCount) {
    const found = await guild.members.fetch({ query, limit: 100, time: 10_000 }).catch(() => null);
    if (found && found.size > 0) {
      const merged = new Map(members.map((member) => [member.id, member]));
      for (const member of found.values()) merged.set(member.id, member);
      members = [...merged.values()];
    }
  }

  const filtered = (
    query ? members.filter((member) => memberMatches(member, needle)) : members
  ).sort(compareMembers);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const start = (page - 1) * pageSize;
  const items = filtered
    .slice(start, start + pageSize)
    .map((member) => serializeMember(member, muteRoleId));

  return {
    items,
    total,
    page,
    pageSize,
    pages,
    partial: members.length < guild.memberCount,
  };
}

export interface MemberProfile extends MemberSummary {
  inGuild: boolean;
  banned: boolean;
  /** На участнике сейчас роль мута */
  muted: boolean;
  roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
  kickable: boolean;
  bannable: boolean;
  moderatable: boolean;
  warnings: Array<{ id: string; reason: string; moderatorId: string; createdAt: number }>;
  notes: Array<{ id: string; text: string; authorId: string; createdAt: number }>;
  cases: ModCase[];
  activeCases: ModCase[];
  /** Активность участника: XP, уровень, сообщения и время в голосе */
  activity: {
    xp: number;
    level: number;
    rest: number;
    needed: number;
    messages: number;
    voiceSeconds: number;
    ranks: { xp: number; messages: number; voice: number };
  };
}

export async function getMemberProfile(guild: Guild, userId: string): Promise<MemberProfile> {
  if (!/^\d{17,20}$/.test(userId)) {
    throw new HttpError(400, 'Некорректный ID пользователя.');
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  const user = member?.user ?? (await guild.client.users.fetch(userId).catch(() => null));

  if (!user) {
    throw new HttpError(404, 'Пользователь не найден.');
  }

  const banned = await guild.bans
    .fetch(userId)
    .then(() => true)
    .catch(() => false);

  const muteRole = member ? await findMuteRole(guild) : null;

  const cases = searchCases(guild.id, { userId, pageSize: 100 }).items;
  const level = getLevelInfo(guild.id, userId);
  const ranks = getMemberRanks(guild.id, userId);

  return {
    ...(member
      ? serializeMember(member, muteRole?.id ?? null)
      : {
          id: user.id,
          username: user.username,
          displayName: user.globalName ?? user.username,
          avatarUrl: avatarUrl(userToDiscordUser(user), 64),
          bot: user.bot,
          joinedAt: null,
          createdAt: user.createdTimestamp,
          timeoutUntil: null,
          muted: false,
          highestRole: null,
        }),
    inGuild: Boolean(member),
    banned,
    muted: Boolean(member && muteRole && member.roles.cache.has(muteRole.id)),
    roles: member
      ? member.roles.cache
          .filter((role) => role.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((role) => ({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            managed: role.managed,
          }))
      : [],
    kickable: member?.kickable ?? false,
    bannable: member?.bannable ?? false,
    moderatable: member?.moderatable ?? false,
    warnings: getWarns(guild.id, userId),
    notes: getNotes(guild.id, userId),
    cases,
    activeCases: cases.filter((item) => item.active),
    activity: {
      xp: level.xp,
      level: level.level,
      rest: level.rest,
      needed: level.needed,
      messages: level.messages,
      voiceSeconds: level.voiceSeconds,
      ranks,
    },
  };
}
