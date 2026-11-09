import { AuditLogEvent, PermissionFlagsBits, type Guild } from 'discord.js';
import { auditInfo } from './audit.js';
import { COLORS } from './embeds.js';
import { logCard } from './logCard.js';
import { sendLog } from './logger.js';
import { banUser, kickUser, timeoutUser } from './moderation.js';
import { getSecuritySettings, hasImmunity } from './modSettings.js';
import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';

export type NukeActionType =
  | 'ban'
  | 'kick'
  | 'channelDelete'
  | 'roleDelete'
  | 'emojiDelete'
  | 'stickerDelete'
  | 'webhookUpdate'
  | 'botAdd';

interface NukeEvent {
  at: number;
  action: NukeActionType;
}

interface NukeState {
  events: NukeEvent[];
  lastAlertAt: number;
}

export interface NukeCounter {
  executorId: string;
  count: number;
  actions: string[];
}

const AUDIT_EVENTS: Record<NukeActionType, AuditLogEvent> = {
  ban: AuditLogEvent.MemberBanAdd,
  kick: AuditLogEvent.MemberKick,
  channelDelete: AuditLogEvent.ChannelDelete,
  roleDelete: AuditLogEvent.RoleDelete,
  emojiDelete: AuditLogEvent.EmojiDelete,
  stickerDelete: AuditLogEvent.StickerDelete,
  webhookUpdate: AuditLogEvent.WebhookUpdate,
  botAdd: AuditLogEvent.BotAdd,
};

const ACTION_LABELS: Record<NukeActionType, string> = {
  ban: 'бан',
  kick: 'кик',
  channelDelete: 'удаление канала',
  roleDelete: 'удаление роли',
  emojiDelete: 'удаление эмодзи',
  stickerDelete: 'удаление стикера',
  webhookUpdate: 'изменение вебхуков',
  botAdd: 'добавление бота',
};

const states = new Map<string, Map<string, NukeState>>();

function loadNukeStates(guildId: string): Map<string, NukeState> {
  const result = new Map<string, NukeState>();
  const row = db
    .prepare('SELECT nuke_state FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { nuke_state: string } | undefined;

  if (!row) return result;

  const stored = parseJson<unknown>(row.nuke_state, {});
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return result;
  }

  for (const [executorId, raw] of Object.entries(stored)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const value = raw as { events?: unknown; lastAlertAt?: unknown };
    const events = Array.isArray(value.events)
      ? value.events
          .filter(
            (event): event is NukeEvent =>
              typeof event === 'object' &&
              event !== null &&
              typeof (event as NukeEvent).at === 'number' &&
              typeof (event as NukeEvent).action === 'string' &&
              (event as NukeEvent).action in ACTION_LABELS,
          )
          .map((event) => ({ at: event.at, action: event.action }))
      : [];

    result.set(executorId, {
      events,
      lastAlertAt:
        typeof value.lastAlertAt === 'number' && Number.isFinite(value.lastAlertAt)
          ? value.lastAlertAt
          : 0,
    });
  }

  return result;
}

function persistNukeStates(guildId: string, guildStates: Map<string, NukeState>): void {
  ensureGuild(guildId);
  db.prepare('INSERT OR IGNORE INTO security_runtime (guild_id) VALUES (?)').run(guildId);

  const payload: Record<string, NukeState> = {};
  for (const [executorId, state] of guildStates) {
    payload[executorId] = state;
  }

  db.prepare(
    `
    UPDATE security_runtime
    SET nuke_state = ?, updated_at = ?
    WHERE guild_id = ?
  `,
  ).run(toJson(payload), Date.now(), guildId);
}

function guildStatesFor(guildId: string): Map<string, NukeState> {
  let guildStates = states.get(guildId);
  if (!guildStates) {
    guildStates = loadNukeStates(guildId);
    states.set(guildId, guildStates);
  }
  return guildStates;
}

function stateFor(guildId: string, executorId: string): NukeState {
  const guildStates = guildStatesFor(guildId);

  let state = guildStates.get(executorId);
  if (!state) {
    state = { events: [], lastAlertAt: 0 };
    guildStates.set(executorId, state);
  }
  return state;
}

export function resetNukeRuntime(guildId?: string): void {
  if (guildId) {
    states.delete(guildId);
    db.prepare(
      `
      UPDATE security_runtime
      SET nuke_state = '{}', updated_at = ?
      WHERE guild_id = ?
    `,
    ).run(Date.now(), guildId);
    return;
  }

  states.clear();
  db.prepare(
    `
    UPDATE security_runtime
    SET nuke_state = '{}', updated_at = ?
  `,
  ).run(Date.now());
}

export function getNukeCounters(guildId: string): NukeCounter[] {
  const config = getSecuritySettings(guildId).nuke;
  const guildStates = guildStatesFor(guildId);
  if (guildStates.size === 0) return [];

  const now = Date.now();
  const counters: NukeCounter[] = [];

  for (const [executorId, state] of guildStates) {
    state.events = state.events.filter((event) => now - event.at <= config.windowSec * 1_000);
    if (state.events.length === 0) {
      guildStates.delete(executorId);
      continue;
    }
    counters.push({
      executorId,
      count: state.events.length,
      actions: [...new Set(state.events.map((event) => ACTION_LABELS[event.action]))],
    });
  }

  persistNukeStates(guildId, guildStates);
  return counters.sort((a, b) => b.count - a.count);
}

export async function recordNuke(
  guild: Guild,
  action: NukeActionType,
  targetId?: string | null,
): Promise<void> {
  const config = getSecuritySettings(guild.id).nuke;
  if (!config.enabled) return;

  const audit = await auditInfo(
    guild,
    AUDIT_EVENTS[action],
    targetId ?? null,
    action === 'kick' ? 0 : 1,
  );
  const executor = audit.executor;
  if (!executor) return;
  if (executor.id === guild.client.user?.id) return;

  const now = Date.now();
  const guildStates = guildStatesFor(guild.id);
  const state = stateFor(guild.id, executor.id);
  state.events = state.events.filter((event) => now - event.at <= config.windowSec * 1_000);
  state.events.push({ at: now, action });

  if (state.events.length < config.threshold) {
    persistNukeStates(guild.id, guildStates);
    return;
  }
  if (now - state.lastAlertAt < config.windowSec * 1_000) {
    persistNukeStates(guild.id, guildStates);
    return;
  }

  state.lastAlertAt = now;
  const events = [...state.events];
  state.events = [];
  persistNukeStates(guild.id, guildStates);

  const summary = events.map((event) => ACTION_LABELS[event.action]).join(', ');
  const reason = `Анти-нак: ${events.length} действий за ${config.windowSec} с`;

  await sendLog(
    guild,
    logCard(guild, {
      title: '🚨 Анти-нак: подозрительная активность',
      color: COLORS.danger,
      description:
        `**${events.length}** потенциально опасных действий за ` +
        `**${config.windowSec} с**.\n${summary}`,
      fields: [
        { name: 'Кто', value: `${executor} (${executor.tag})`, inline: true },
        { name: 'Действие', value: nukeActionLabel(config.action), inline: true },
        { name: 'Порог', value: String(config.threshold), inline: true },
        { name: 'Причина', value: reason, inline: false },
      ],
      footer: `ID: ${executor.id}`,
    }),
    'nukeAlert',
  );

  const member = await guild.members.fetch(executor.id).catch(() => null);
  const immune = member ? hasImmunity(guild, member) : false;
  const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const shouldPunish =
    config.action !== 'alert' &&
    executor.id !== guild.ownerId &&
    !immune &&
    !(config.ignoreAdmins && isAdmin);

  if (!shouldPunish) return;

  const moderatorId = guild.client.user?.id;
  if (!moderatorId) return;

  const result =
    config.action === 'timeout'
      ? await timeoutUser(guild, moderatorId, executor.id, 3_600, reason)
      : config.action === 'kick'
        ? await kickUser(guild, moderatorId, executor.id, reason)
        : await banUser(guild, moderatorId, executor.id, reason);

  await sendLog(
    guild,
    logCard(guild, {
      title: '🛡️ Анти-нак: действие',
      color: result.ok ? COLORS.success : COLORS.danger,
      description: result.message,
      fields: [
        { name: 'Кто', value: `${executor} (${executor.tag})`, inline: true },
        { name: 'Действие', value: nukeActionLabel(config.action), inline: true },
        { name: 'Причина', value: reason, inline: false },
      ],
      footer: `ID: ${executor.id}`,
    }),
    'nukeAction',
  );
}

function nukeActionLabel(action: 'alert' | 'timeout' | 'kick' | 'ban'): string {
  if (action === 'timeout') return 'таймаут 1 час';
  if (action === 'kick') return 'кик';
  if (action === 'ban') return 'бан';
  return 'только уведомление';
}
