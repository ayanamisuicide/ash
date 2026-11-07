import type { Guild, GuildMember } from 'discord.js';
import { COLORS } from './embeds.js';
import { humanDuration } from './format.js';
import { logCard } from './logCard.js';
import { sendLog } from './logger.js';
import { banUser, kickUser } from './moderation.js';
import { getSecuritySettings } from './modSettings.js';
import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';

interface RaidState {
  joins: number[];
  raidUntil: number;
  lastAlertAt: number;
}

const states = new Map<string, RaidState>();

export interface RaidRuntime {
  joins: number;
  raidUntil: number | null;
  active: boolean;
}

function loadRaidState(guildId: string): RaidState {
  const row = db
    .prepare('SELECT raid_until, raid_joins FROM security_runtime WHERE guild_id = ?')
    .get(guildId) as { raid_until: number; raid_joins: string } | undefined;

  if (!row) {
    return { joins: [], raidUntil: 0, lastAlertAt: 0 };
  }

  const parsed = parseJson<unknown>(row.raid_joins, []);
  const joins = Array.isArray(parsed)
    ? parsed.filter(
        (timestamp): timestamp is number =>
          typeof timestamp === 'number' && Number.isFinite(timestamp),
      )
    : [];

  return {
    joins,
    raidUntil: Number(row.raid_until) || 0,
    lastAlertAt: 0,
  };
}

function persistRaidState(guildId: string, state: RaidState): void {
  ensureGuild(guildId);
  db.prepare(
    'INSERT OR IGNORE INTO security_runtime (guild_id) VALUES (?)',
  ).run(guildId);
  db.prepare(`
    UPDATE security_runtime
    SET raid_until = ?, raid_joins = ?, updated_at = ?
    WHERE guild_id = ?
  `).run(Math.floor(state.raidUntil), toJson(state.joins), Date.now(), guildId);
}

function stateFor(guildId: string): RaidState {
  let state = states.get(guildId);
  if (!state) {
    state = loadRaidState(guildId);
    states.set(guildId, state);
  }
  return state;
}

function prune(state: RaidState, windowMs: number, now: number): void {
  state.joins = state.joins.filter((timestamp) => now - timestamp <= windowMs);
}

export function getRaidRuntime(guildId: string): RaidRuntime {
  const state = stateFor(guildId);
  const config = getSecuritySettings(guildId).raid;
  const now = Date.now();

  if (state.raidUntil > 0 && state.raidUntil <= now) {
    state.raidUntil = 0;
  }
  prune(state, config.joinWindowSec * 1_000, now);
  persistRaidState(guildId, state);

  return {
    joins: state.joins.length,
    raidUntil: state.raidUntil > 0 ? state.raidUntil : null,
    active: state.raidUntil > now,
  };
}

export function setRaidMode(guildId: string, durationMs: number): void {
  const state = stateFor(guildId);
  state.raidUntil = Date.now() + Math.max(1_000, Math.floor(durationMs));
  persistRaidState(guildId, state);
}

export function clearRaidMode(guildId: string): void {
  const state = stateFor(guildId);
  state.raidUntil = 0;
  persistRaidState(guildId, state);
}

export function resetRaidRuntime(guildId: string): void {
  states.delete(guildId);
  db.prepare(`
    UPDATE security_runtime
    SET raid_until = 0, raid_joins = '[]', updated_at = ?
    WHERE guild_id = ?
  `).run(Date.now(), guildId);
}

export async function handleRaidJoin(
  guild: Guild,
  member: GuildMember,
): Promise<void> {
  const config = getSecuritySettings(guild.id).raid;
  if (!config.enabled) return;
  if (member.user.bot && config.ignoreBots) return;

  const now = Date.now();
  const state = stateFor(guild.id);

  if (state.raidUntil > 0 && state.raidUntil <= now) {
    state.raidUntil = 0;
    state.joins = [];
  }

  prune(state, config.joinWindowSec * 1_000, now);
  state.joins.push(now);
  const count = state.joins.length;
  const wasActive = state.raidUntil > now;
  const thresholdReached = count >= config.joinThreshold;
  const youngAccount =
    config.accountAgeDays > 0 &&
    now - member.user.createdTimestamp < config.accountAgeDays * 86_400_000;

  if (thresholdReached && !wasActive) {
    state.raidUntil = now + config.durationSec * 1_000;
    state.joins = [];
    state.lastAlertAt = now;

    await sendLog(
      guild,
      logCard(guild, {
        title: '🚨 Антирейд: массовые заходы',
        color: COLORS.danger,
        actor: {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        },
        description:
          `За **${config.joinWindowSec} с** зашло **${count}** участников.\n` +
          `Режим антирейда: **${humanDuration(config.durationSec * 1_000)}**.\n` +
          `Действие: **${raidActionLabel(config.action)}**.`,
        fields: [
          { name: 'Последний участник', value: `${member}`, inline: true },
          { name: 'Порог', value: String(config.joinThreshold), inline: true },
        ],
        footer: `ID: ${member.id}`,
      }),
      'raidAlert',
    );
  } else if (youngAccount && !thresholdReached && now - state.lastAlertAt > 10_000) {
    state.lastAlertAt = now;
    await sendLog(
      guild,
      logCard(guild, {
        title: '🚨 Антирейд: молодой аккаунт',
        color: COLORS.warn,
        actor: {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        },
        description:
          `Аккаунт создан <t:${Math.floor(member.user.createdTimestamp / 1_000)}:R> ` +
          `(порог: ${config.accountAgeDays} дн.).`,
        fields: [{ name: 'Участник', value: `${member}`, inline: true }],
        footer: `ID: ${member.id}`,
      }),
      'raidAlert',
    );
  }

  persistRaidState(guild.id, state);

  let reason: string | null = null;
  if (youngAccount) {
    reason = `аккаунт младше ${config.accountAgeDays} дн.`;
  } else if (thresholdReached) {
    reason = `массовые заходы: ${count} за ${config.joinWindowSec} с`;
  } else if (wasActive || state.raidUntil > now) {
    reason = 'активен режим антирейда';
  }

  if (!reason || config.action === 'alert') return;

  const moderatorId = guild.client.user?.id;
  if (!moderatorId) return;

  const reasonText = `Антирейд: ${reason}`;
  const result =
    config.action === 'kick'
      ? await kickUser(guild, moderatorId, member.id, reasonText)
      : await banUser(guild, moderatorId, member.id, reasonText);

  await sendLog(
    guild,
    logCard(guild, {
      title: '🛡️ Антирейд: действие',
      color: result.ok ? COLORS.success : COLORS.danger,
      actor: {
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL(),
      },
      description: result.message,
      fields: [
        {
          name: 'Действие',
          value: config.action === 'kick' ? 'Кик' : 'Бан',
          inline: true,
        },
        { name: 'Причина', value: reason, inline: true },
      ],
      footer: `ID: ${member.id}`,
    }),
    'raidAction',
  );
}

function raidActionLabel(action: 'alert' | 'kick' | 'ban'): string {
  if (action === 'kick') return 'кик';
  if (action === 'ban') return 'бан';
  return 'только уведомление';
}
