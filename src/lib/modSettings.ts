import type { Guild, GuildMember } from 'discord.js';
import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';
import { newId } from './ids.js';

/** Действие, которое выдаётся после N варнов за окно времени */
export type WarnActionType = 'timeout' | 'mute' | 'kick' | 'ban' | 'tempban';

export interface WarnAction {
  id: string;
  count: number;
  windowDays: number;
  action: WarnActionType;
  durationMs: number | null;
}

export interface AutomodConfig {
  enabled: boolean;
  invites: boolean;
  links: boolean;
  caps: boolean;
  spam: boolean;
  words: string[];
  /** 0 — проверка упоминаний выключена */
  mentions: number;
}

export interface ModerationSettings {
  immunityRoles: string[];
  reportChannelId: string | null;
  appealChannelId: string | null;
  muteRoleId: string | null;
  warnExpiryDays: number;
  warnActions: WarnAction[];
  automod: AutomodConfig;
}

export const DEFAULT_AUTOMOD: AutomodConfig = {
  enabled: false,
  invites: true,
  links: false,
  caps: true,
  spam: true,
  words: [],
  mentions: 0,
};

export type RaidAction = 'alert' | 'kick' | 'ban';
export type NukeAction = 'alert' | 'timeout' | 'kick' | 'ban';

export interface RaidConfig {
  enabled: boolean;
  joinThreshold: number;
  joinWindowSec: number;
  accountAgeDays: number;
  action: RaidAction;
  durationSec: number;
  ignoreBots: boolean;
}

export interface NukeConfig {
  enabled: boolean;
  threshold: number;
  windowSec: number;
  action: NukeAction;
  ignoreAdmins: boolean;
}

export interface SecuritySettings {
  raid: RaidConfig;
  nuke: NukeConfig;
}

export const DEFAULT_RAID: RaidConfig = {
  enabled: false,
  joinThreshold: 10,
  joinWindowSec: 60,
  accountAgeDays: 0,
  action: 'alert',
  durationSec: 300,
  ignoreBots: true,
};

export const DEFAULT_NUKE: NukeConfig = {
  enabled: false,
  threshold: 3,
  windowSec: 60,
  action: 'alert',
  ignoreAdmins: true,
};

interface CacheEntry<T> {
  at: number;
  value: T;
}

const SETTINGS_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.SETTINGS_CACHE_TTL_MS ?? 5_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5_000;
})();

const moderationCache = new Map<string, CacheEntry<ModerationSettings>>();
const securityCache = new Map<string, CacheEntry<SecuritySettings>>();

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, guildId: string): T | null {
  if (SETTINGS_CACHE_TTL_MS === 0) return null;
  const hit = cache.get(guildId);
  if (!hit) return null;
  if (Date.now() - hit.at > SETTINGS_CACHE_TTL_MS) {
    cache.delete(guildId);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, guildId: string, value: T): T {
  if (SETTINGS_CACHE_TTL_MS > 0) {
    cache.set(guildId, { at: Date.now(), value });
  }
  return value;
}

function invalidate(guildId: string): void {
  moderationCache.delete(guildId);
  securityCache.delete(guildId);
}

interface ModerationRow {
  guild_id: string;
  immunity_roles: string;
  report_channel_id: string | null;
  appeal_channel_id: string | null;
  mute_role_id: string | null;
  warn_expiry_days: number;
  warn_actions: string;
  automod: string;
}

interface SecurityRow {
  guild_id: string;
  raid_config: string;
  nuke_config: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWarnAction(value: unknown): WarnAction | null {
  if (!isObject(value)) return null;
  const action = value.action;
  if (
    action !== 'timeout' &&
    action !== 'mute' &&
    action !== 'kick' &&
    action !== 'ban' &&
    action !== 'tempban'
  ) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : newId(),
    count: typeof value.count === 'number' && value.count > 0 ? Math.floor(value.count) : 1,
    windowDays:
      typeof value.windowDays === 'number' && value.windowDays > 0
        ? Math.floor(value.windowDays)
        : 30,
    action,
    durationMs:
      typeof value.durationMs === 'number' && value.durationMs > 0
        ? Math.floor(value.durationMs)
        : null,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeRaid(value: unknown): RaidConfig {
  const raw = isObject(value) ? value : {};
  const action =
    raw.action === 'kick' || raw.action === 'ban' || raw.action === 'alert'
      ? raw.action
      : DEFAULT_RAID.action;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_RAID.enabled,
    joinThreshold: clampInt(raw.joinThreshold, DEFAULT_RAID.joinThreshold, 1, 1_000),
    joinWindowSec: clampInt(raw.joinWindowSec, DEFAULT_RAID.joinWindowSec, 5, 3_600),
    accountAgeDays: clampInt(raw.accountAgeDays, DEFAULT_RAID.accountAgeDays, 0, 365),
    action,
    durationSec: clampInt(raw.durationSec, DEFAULT_RAID.durationSec, 30, 86_400),
    ignoreBots: typeof raw.ignoreBots === 'boolean' ? raw.ignoreBots : DEFAULT_RAID.ignoreBots,
  };
}

function normalizeNuke(value: unknown): NukeConfig {
  const raw = isObject(value) ? value : {};
  const action =
    raw.action === 'timeout' ||
    raw.action === 'kick' ||
    raw.action === 'ban' ||
    raw.action === 'alert'
      ? raw.action
      : DEFAULT_NUKE.action;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_NUKE.enabled,
    threshold: clampInt(raw.threshold, DEFAULT_NUKE.threshold, 1, 100),
    windowSec: clampInt(raw.windowSec, DEFAULT_NUKE.windowSec, 5, 3_600),
    action,
    ignoreAdmins:
      typeof raw.ignoreAdmins === 'boolean' ? raw.ignoreAdmins : DEFAULT_NUKE.ignoreAdmins,
  };
}

function ensureSecurityRow(guildId: string): void {
  ensureGuild(guildId);
  db.prepare('INSERT OR IGNORE INTO security_settings (guild_id) VALUES (?)').run(guildId);
}

function updateSecurityColumn(
  guildId: string,
  column: 'raid_config' | 'nuke_config',
  value: string,
): void {
  ensureSecurityRow(guildId);
  db.prepare(`UPDATE security_settings SET ${column} = ? WHERE guild_id = ?`).run(value, guildId);
  invalidate(guildId);
}

function ensureRow(guildId: string): void {
  ensureGuild(guildId);
  db.prepare('INSERT OR IGNORE INTO moderation_settings (guild_id) VALUES (?)').run(guildId);
}

function updateColumn(
  guildId: string,
  column:
    | 'immunity_roles'
    | 'report_channel_id'
    | 'appeal_channel_id'
    | 'mute_role_id'
    | 'warn_expiry_days'
    | 'warn_actions'
    | 'automod',
  value: string | number | null,
): void {
  ensureRow(guildId);
  db.prepare(`UPDATE moderation_settings SET ${column} = ? WHERE guild_id = ?`).run(value, guildId);
  invalidate(guildId);
}

export function getModerationSettings(guildId: string): ModerationSettings {
  const cached = cacheGet(moderationCache, guildId);
  if (cached) return cached;

  const row = db.prepare('SELECT * FROM moderation_settings WHERE guild_id = ?').get(guildId) as
    ModerationRow | undefined;

  const immunityRoles = row ? parseJson<unknown>(row.immunity_roles, []) : [];
  const roles = Array.isArray(immunityRoles)
    ? immunityRoles.filter((id): id is string => typeof id === 'string')
    : [];

  const warnActionsRaw = row ? parseJson<unknown>(row.warn_actions, []) : [];
  const warnActions = Array.isArray(warnActionsRaw)
    ? warnActionsRaw
        .map((item) => normalizeWarnAction(item))
        .filter((item): item is WarnAction => item !== null)
    : [];

  const automodRaw = row ? parseJson<unknown>(row.automod, {}) : {};
  const storedAutomod = isObject(automodRaw) ? automodRaw : {};
  const automod: AutomodConfig = {
    enabled:
      typeof storedAutomod.enabled === 'boolean' ? storedAutomod.enabled : DEFAULT_AUTOMOD.enabled,
    invites:
      typeof storedAutomod.invites === 'boolean' ? storedAutomod.invites : DEFAULT_AUTOMOD.invites,
    links: typeof storedAutomod.links === 'boolean' ? storedAutomod.links : DEFAULT_AUTOMOD.links,
    caps: typeof storedAutomod.caps === 'boolean' ? storedAutomod.caps : DEFAULT_AUTOMOD.caps,
    spam: typeof storedAutomod.spam === 'boolean' ? storedAutomod.spam : DEFAULT_AUTOMOD.spam,
    words: Array.isArray(storedAutomod.words)
      ? storedAutomod.words.filter((word): word is string => typeof word === 'string')
      : [],
    mentions:
      typeof storedAutomod.mentions === 'number' && storedAutomod.mentions >= 0
        ? Math.floor(storedAutomod.mentions)
        : 0,
  };

  return cacheSet(moderationCache, guildId, {
    immunityRoles: roles,
    reportChannelId: row?.report_channel_id ?? null,
    appealChannelId: row?.appeal_channel_id ?? null,
    muteRoleId: row?.mute_role_id ?? null,
    warnExpiryDays: Number(row?.warn_expiry_days ?? 0),
    warnActions,
    automod,
  });
}

export function getImmunityRoles(guildId: string): string[] {
  return getModerationSettings(guildId).immunityRoles;
}

export function hasImmunity(guild: Guild, member: GuildMember): boolean {
  const roles = getImmunityRoles(guild.id);
  return roles.length > 0 && roles.some((roleId) => member.roles.cache.has(roleId));
}

export function addImmunityRole(guildId: string, roleId: string): boolean {
  const roles = getImmunityRoles(guildId);
  if (roles.includes(roleId)) return false;
  updateColumn(guildId, 'immunity_roles', toJson([...roles, roleId]));
  return true;
}

export function removeImmunityRole(guildId: string, roleId: string): boolean {
  const roles = getImmunityRoles(guildId);
  const next = roles.filter((id) => id !== roleId);
  if (next.length === roles.length) return false;
  updateColumn(guildId, 'immunity_roles', toJson(next));
  return true;
}

export function clearImmunityRoles(guildId: string): void {
  updateColumn(guildId, 'immunity_roles', '[]');
}

export function setReportChannel(guildId: string, channelId: string | null): void {
  updateColumn(guildId, 'report_channel_id', channelId);
}

export function setAppealChannel(guildId: string, channelId: string | null): void {
  updateColumn(guildId, 'appeal_channel_id', channelId);
}

export function setMuteRoleId(guildId: string, roleId: string | null): void {
  updateColumn(guildId, 'mute_role_id', roleId);
}

export function setWarnExpiry(guildId: string, days: number): void {
  updateColumn(guildId, 'warn_expiry_days', Math.max(0, Math.min(Math.floor(days), 365)));
}

export function addWarnAction(guildId: string, input: Omit<WarnAction, 'id'>): WarnAction {
  const actions = getModerationSettings(guildId).warnActions;
  const action: WarnAction = {
    ...input,
    id: newId(),
  };
  updateColumn(guildId, 'warn_actions', toJson([...actions, action]));
  return action;
}

export function removeWarnAction(guildId: string, id: string): boolean {
  const actions = getModerationSettings(guildId).warnActions;
  const next = actions.filter((action) => action.id !== id);
  if (next.length === actions.length) return false;
  updateColumn(guildId, 'warn_actions', toJson(next));
  return true;
}

export function clearWarnActions(guildId: string): void {
  updateColumn(guildId, 'warn_actions', '[]');
}

export function updateAutomod(guildId: string, patch: Partial<AutomodConfig>): AutomodConfig {
  const current = getModerationSettings(guildId).automod;
  const next: AutomodConfig = { ...current, ...patch };
  updateColumn(guildId, 'automod', toJson(next));
  return next;
}

export function addAutomodWord(guildId: string, word: string): boolean {
  const automod = getModerationSettings(guildId).automod;
  const normalized = word.trim().toLowerCase();
  if (!normalized || automod.words.some((item) => item.toLowerCase() === normalized)) {
    return false;
  }
  updateColumn(guildId, 'automod', toJson({ ...automod, words: [...automod.words, word.trim()] }));
  return true;
}

export function removeAutomodWord(guildId: string, word: string): boolean {
  const automod = getModerationSettings(guildId).automod;
  const normalized = word.trim().toLowerCase();
  const next = automod.words.filter((item) => item.toLowerCase() !== normalized);
  if (next.length === automod.words.length) return false;
  updateColumn(guildId, 'automod', toJson({ ...automod, words: next }));
  return true;
}

export function getSecuritySettings(guildId: string): SecuritySettings {
  const cached = cacheGet(securityCache, guildId);
  if (cached) return cached;

  const row = db.prepare('SELECT * FROM security_settings WHERE guild_id = ?').get(guildId) as
    SecurityRow | undefined;

  return cacheSet(securityCache, guildId, {
    raid: normalizeRaid(row ? parseJson<unknown>(row.raid_config, {}) : {}),
    nuke: normalizeNuke(row ? parseJson<unknown>(row.nuke_config, {}) : {}),
  });
}

export function updateRaidConfig(guildId: string, patch: Partial<RaidConfig>): RaidConfig {
  const current = getSecuritySettings(guildId).raid;
  const next = normalizeRaid({ ...current, ...patch });
  updateSecurityColumn(guildId, 'raid_config', toJson(next));
  return next;
}

export function updateNukeConfig(guildId: string, patch: Partial<NukeConfig>): NukeConfig {
  const current = getSecuritySettings(guildId).nuke;
  const next = normalizeNuke({ ...current, ...patch });
  updateSecurityColumn(guildId, 'nuke_config', toJson(next));
  return next;
}
