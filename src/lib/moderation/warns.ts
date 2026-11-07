import type { Guild } from 'discord.js';
import { closeCase, closeWarnCases, createCase, findCaseByWarnId } from '../cases.js';
import { COLORS } from '../embeds.js';
import { logCard } from '../logCard.js';
import { sendLog } from '../logger.js';
import { truncate } from '../logging.js';
import { addWarn, clearWarns, getWarns, removeWarn } from '../warns.js';
import { getModerationSettings, type WarnAction } from '../modSettings.js';
import { checkTarget, dm, fail, fetchMember, fetchUser, ok, type ActionResult } from './helpers.js';
import { banUser, kickUser } from './bans.js';
import { muteUser, timeoutUser } from './timeouts.js';

export async function warnUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');
  if (member.user.bot) return fail('Ботам предупреждения не выдаются.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  const { total, warn } = addWarn(guild.id, member.id, moderatorId, reason);
  const modCase = createCase({
    guildId: guild.id,
    type: 'warn',
    userId: member.id,
    moderatorId,
    reason,
    extra: { warnId: warn.id },
  });

  await dm(
    member.user,
    `⚠️ Тебе выдано предупреждение на сервере **${guild.name}** (всего: ${total}).\n🧾 Причина: ${reason}`,
  );

  await sendLog(
    guild,
    logCard(guild, {
      title: '⚠️ Предупреждение',
      color: COLORS.warn,
      actor: {
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL(),
      },
      fields: [
        { name: 'Кому', value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Всего', value: String(total), inline: true },
        { name: 'Кейс', value: `#${modCase.id}`, inline: true },
        { name: 'Причина', value: reason },
      ],
      footer: `ID: ${member.id}`,
    }),
    'warnAdd',
  );

  const escalation = await applyWarnActions(guild, member.id);
  return ok(
    `${member} получил(а) предупреждение (всего: ${total}).` +
      (escalation.length > 0 ? `\nАвтонаказание: ${escalation.join('; ')}.` : '') +
      `\nПричина: ${reason}`,
    modCase.id,
  );
}

async function applyWarnActions(guild: Guild, userId: string): Promise<string[]> {
  const actions = getModerationSettings(guild.id).warnActions;
  if (actions.length === 0) return [];

  const warns = getWarns(guild.id, userId);
  const now = Date.now();
  const applied: string[] = [];
  const moderatorId = guild.client.user?.id;
  if (!moderatorId) return applied;

  const sorted = [...actions].sort((a, b) => a.count - b.count);
  for (const action of sorted) {
    const recent = warns.filter(
      (warn) => now - warn.createdAt <= action.windowDays * 24 * 60 * 60 * 1_000,
    ).length;
    if (recent !== action.count) continue;

    const reason = `Автонаказание: ${action.count} предупреждений за ${action.windowDays} дн.`;
    let result: ActionResult | null = null;

    switch (action.action) {
      case 'timeout':
        if (action.durationMs) {
          result = await timeoutUser(guild, moderatorId, userId, action.durationMs, reason);
        }
        break;
      case 'mute':
        result = await muteUser(guild, moderatorId, userId, action.durationMs ?? null, reason);
        break;
      case 'kick':
        result = await kickUser(guild, moderatorId, userId, reason);
        break;
      case 'ban':
        result = await banUser(guild, moderatorId, userId, reason);
        break;
      case 'tempban':
        if (action.durationMs) {
          result = await banUser(guild, moderatorId, userId, reason, 0, action.durationMs);
        }
        break;
    }

    if (result?.ok) applied.push(result.message);
    break;
  }

  if (applied.length > 0) {
    await sendLog(
      guild,
      logCard(guild, {
        title: '⚡ Автонаказание по варнам',
        color: COLORS.danger,
        description: applied.join('\n'),
        fields: [{ name: 'Участник', value: `<@${userId}>`, inline: true }],
        footer: `ID: ${userId}`,
      }),
      'warnEscalation',
    );
  }

  return applied;
}

export async function clearWarnsAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
  warnId?: string | null,
): Promise<ActionResult> {
  const removed = warnId
    ? [removeWarn(guild.id, userId, warnId)].flatMap((warn) => (warn ? [warn] : []))
    : clearWarns(guild.id, userId);

  if (warnId && removed.length === 0) {
    return fail(`Предупреждение \`${warnId}\` не найдено.`);
  }
  if (removed.length === 0) {
    return fail('У этого участника нет предупреждений.');
  }

  if (warnId) {
    const warnCase = findCaseByWarnId(guild.id, userId, warnId);
    if (warnCase) closeCase(guild.id, warnCase.id, 'Снятие предупреждения');
  } else {
    closeWarnCases(guild.id, userId);
  }

  const removalCase = createCase({
    guildId: guild.id,
    type: 'warnRemove',
    userId,
    moderatorId,
    reason: warnId ? `Снят варн ${warnId}` : `Снято варнов: ${removed.length}`,
    active: false,
    extra: { warnIds: removed.map((warn) => warn.id) },
  });

  const [target, moderator] = await Promise.all([
    fetchUser(guild, userId),
    fetchUser(guild, moderatorId),
  ]);

  const fields = [
    {
      name: 'Кому',
      value: target ? `${target} (${target.tag})` : `<@${userId}>`,
      inline: true,
    },
    {
      name: 'Кем',
      value: moderator ? `${moderator} (${moderator.tag})` : `<@${moderatorId}>`,
      inline: true,
    },
    { name: 'Снято', value: String(removed.length), inline: true },
    { name: 'Кейс', value: `#${removalCase.id}`, inline: true },
  ];

  const single = removed[0];
  if (warnId && single) {
    fields.push({ name: 'Причина предупреждения', value: single.reason, inline: false });
  } else if (removed.length > 0) {
    fields.push({
      name: 'Снятые предупреждения',
      value: removed
        .slice(0, 5)
        .map((warn) => `\`${warn.id}\` — ${truncate(warn.reason, 120)}`)
        .join('\n'),
      inline: false,
    });
  }

  await sendLog(
    guild,
    logCard(guild, {
      title: warnId ? '🧽 Предупреждение снято' : '🧽 Предупреждения сняты',
      color: COLORS.success,
      actor: target ? { name: target.tag, iconURL: target.displayAvatarURL() } : undefined,
      fields,
      footer: `ID: ${userId}`,
    }),
    'warnRemove',
  );

  return warnId
    ? ok(`Предупреждение \`${warnId}\` снято с <@${userId}>.`, removalCase.id)
    : ok(`Все предупреждения <@${userId}> сняты (${removed.length}).`, removalCase.id);
}

export function warnActionLabel(action: WarnAction): string {
  const labels: Record<WarnAction['action'], string> = {
    timeout: 'Таймаут',
    mute: 'Мут',
    kick: 'Кик',
    ban: 'Бан',
    tempban: 'Временный бан',
  };
  return labels[action.action];
}
