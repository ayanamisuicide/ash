import { db } from '../storage/sqlite.js';
import { caseTypeLabel, type CaseType } from './cases.js';

export interface AnalyticsPoint {
  date: string;
  count: number;
}

export interface AnalyticsSlice {
  type: CaseType;
  label: string;
  count: number;
}

export interface AnalyticsPerson {
  id: string;
  count: number;
  name: string | null;
}

export interface ModerationAnalytics {
  days: number;
  totals: {
    cases: number;
    active: number;
    bans: number;
    warnings: number;
    mutes: number;
    trackedMembers: number;
    messages: number;
    voiceSeconds: number;
  };
  daily: AnalyticsPoint[];
  byType: AnalyticsSlice[];
  topModerators: AnalyticsPerson[];
  topUsers: AnalyticsPerson[];
  appeals: {
    pending: number;
    approved: number;
    rejected: number;
  };
}

interface CaseRow {
  type: string;
  user_id: string | null;
  moderator_id: string;
  created_at: number;
  active: number;
}

interface AppealCountRow {
  status: string;
  count: number;
}

/** Агрегаты для страницы аналитики: кейсы, модераторы, нарушители, апелляции. */
export function getModerationAnalytics(guildId: string, days = 30): ModerationAnalytics {
  const windowDays = Math.min(365, Math.max(7, Math.floor(days)));
  const since = Date.now() - windowDays * 86_400_000;

  const rows = db
    .prepare(
      'SELECT type, user_id, moderator_id, created_at, active FROM cases WHERE guild_id = ? AND created_at >= ?',
    )
    .all(guildId, since) as unknown as CaseRow[];

  const dailyMap = new Map<string, number>();
  const typeMap = new Map<CaseType, number>();
  const moderatorMap = new Map<string, number>();
  const userMap = new Map<string, number>();

  const totals = {
    cases: rows.length,
    active: 0,
    bans: 0,
    warnings: 0,
    mutes: 0,
    trackedMembers: 0,
    messages: 0,
    voiceSeconds: 0,
  };

  for (const row of rows) {
    const date = new Date(Number(row.created_at)).toISOString().slice(0, 10);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);

    const type = row.type as CaseType;
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
    moderatorMap.set(row.moderator_id, (moderatorMap.get(row.moderator_id) ?? 0) + 1);
    if (row.user_id) userMap.set(row.user_id, (userMap.get(row.user_id) ?? 0) + 1);

    if (Number(row.active) === 1) totals.active++;
    if (type === 'ban' || type === 'tempban' || type === 'softban') totals.bans++;
    if (type === 'warn') totals.warnings++;
    if (type === 'mute' || type === 'timeout') totals.mutes++;
  }

  const daily: AnalyticsPoint[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date, count: dailyMap.get(date) ?? 0 });
  }

  const activity = db
    .prepare(
      'SELECT COUNT(*) AS tracked, COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(voice_seconds), 0) AS voice FROM levels WHERE guild_id = ?',
    )
    .get(guildId) as { tracked: number; messages: number; voice: number } | undefined;

  totals.trackedMembers = Number(activity?.tracked ?? 0);
  totals.messages = Number(activity?.messages ?? 0);
  totals.voiceSeconds = Number(activity?.voice ?? 0);

  const appealRows = db
    .prepare('SELECT status, COUNT(*) AS count FROM appeals WHERE guild_id = ? GROUP BY status')
    .all(guildId) as unknown as AppealCountRow[];

  const appeals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of appealRows) {
    const count = Number(row.count);
    if (row.status === 'pending') appeals.pending = count;
    if (row.status === 'approved') appeals.approved = count;
    if (row.status === 'rejected') appeals.rejected = count;
  }

  return {
    days: windowDays,
    totals,
    daily,
    byType: [...typeMap.entries()]
      .map(([type, count]) => ({ type, label: caseTypeLabel(type), count }))
      .sort((a, b) => b.count - a.count),
    topModerators: [...moderatorMap.entries()]
      .map(([id, count]) => ({ id, count, name: null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topUsers: [...userMap.entries()]
      .map(([id, count]) => ({ id, count, name: null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    appeals,
  };
}
