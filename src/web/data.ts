import type { Guild, GuildMember, User } from 'discord.js';
import { searchCases, type ModCase, type CaseType } from '../lib/cases.js';
import { getNotes } from '../lib/notes.js';
import { getSecuritySettings } from '../lib/modSettings.js';
import { getWarns } from '../lib/warns.js';
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

export interface MemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
  joinedAt: number | null;
  createdAt: number | null;
  timeoutUntil: number | null;
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

export function serializeMember(member: GuildMember): MemberSummary {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatarUrl: avatarUrl(userToDiscordUser(member.user), 64),
    bot: member.user.bot,
    joinedAt: member.joinedTimestamp,
    createdAt: member.user.createdTimestamp,
    timeoutUntil: member.communicationDisabledUntilTimestamp ?? null,
    highestRole: member.roles.highest.name,
  };
}

export async function searchMembers(guild: Guild, rawQuery: string): Promise<MemberSummary[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  if (/^\d{17,20}$/.test(query)) {
    const member = await guild.members.fetch(query).catch(() => null);
    return member ? [serializeMember(member)] : [];
  }

  if (query.length < 2) return [];

  const found = await guild.members.fetch({ query, limit: 25, time: 5_000 }).catch(() => null);
  if (!found) return [];
  return [...found.values()].map(serializeMember);
}

export interface MemberProfile extends MemberSummary {
  inGuild: boolean;
  banned: boolean;
  roles: Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
  kickable: boolean;
  bannable: boolean;
  moderatable: boolean;
  warnings: Array<{ id: string; reason: string; moderatorId: string; createdAt: number }>;
  notes: Array<{ id: string; text: string; authorId: string; createdAt: number }>;
  cases: ModCase[];
  activeCases: ModCase[];
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

  const cases = searchCases(guild.id, { userId, pageSize: 100 }).items;

  return {
    ...(member
      ? serializeMember(member)
      : {
          id: user.id,
          username: user.username,
          displayName: user.globalName ?? user.username,
          avatarUrl: avatarUrl(userToDiscordUser(user), 64),
          bot: user.bot,
          joinedAt: null,
          createdAt: user.createdTimestamp,
          timeoutUntil: null,
          highestRole: null,
        }),
    inGuild: Boolean(member),
    banned,
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
  };
}
