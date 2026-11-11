import { MessageFlags, type Guild } from 'discord.js';
import { getAppeal, updateAppeal } from '../lib/appeals.js';
import { resolveAppealPunishment } from '../lib/appealResolution.js';
import { card } from '../lib/card.js';
import { caseTypeLabel, getCase, updateCase, type ModCase } from '../lib/cases.js';
import { COLORS, dmEmbed } from '../lib/embeds.js';
import { logCard } from '../lib/logCard.js';
import { sendLog } from '../lib/logger.js';
import {
  banUser,
  clearWarnsAction,
  durationToMs,
  kickUser,
  muteUser,
  noteAddAction,
  noteRemoveAction,
  roleAction,
  timeoutUser,
  unbanUser,
  unmuteUser,
  untimeoutUser,
  warnUser,
  type ActionResult,
} from '../lib/moderation.js';
import { HttpError } from './http.js';

export function requireUserId(value: unknown, label = 'участника'): string {
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value.trim())) {
    throw new HttpError(400, `Укажите корректный ID ${label}.`);
  }
  return value.trim();
}

export function requireReason(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Укажите причину.');
  const reason = value.trim();
  if (reason.length < 2) throw new HttpError(400, 'Причина слишком короткая.');
  if (reason.length > 500) throw new HttpError(400, 'Причина длиннее 500 символов.');
  return reason;
}

export function optionalDuration(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Неверный формат длительности.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (durationToMs(trimmed) === null) {
    throw new HttpError(400, 'Неверный формат длительности. Пример: 10m, 1h, 2d, 1w.');
  }
  return trimmed;
}

function optionalDeleteSeconds(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 604_800) {
    throw new HttpError(400, 'Удаление сообщений: от 0 до 604800 секунд.');
  }
  return Math.floor(seconds);
}

export async function warnFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return warnUser(guild, moderatorId, requireUserId(body.userId), requireReason(body.reason));
}

export async function timeoutFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const duration = optionalDuration(body.duration);
  if (!duration) throw new HttpError(400, 'Укажите длительность таймаута.');
  return timeoutUser(
    guild,
    moderatorId,
    requireUserId(body.userId),
    duration,
    requireReason(body.reason),
  );
}

export async function untimeoutFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return untimeoutUser(
    guild,
    moderatorId,
    requireUserId(body.userId),
    requireReason(body.reason ?? 'Снятие таймаута через веб-панель'),
  );
}

export async function muteFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return muteUser(
    guild,
    moderatorId,
    requireUserId(body.userId),
    optionalDuration(body.duration),
    requireReason(body.reason),
  );
}

export async function unmuteFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return unmuteUser(
    guild,
    moderatorId,
    requireUserId(body.userId),
    requireReason(body.reason ?? 'Снятие мута через веб-панель'),
  );
}

export async function kickFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return kickUser(guild, moderatorId, requireUserId(body.userId), requireReason(body.reason));
}

export async function banFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const duration = optionalDuration(body.duration);
  return banUser(
    guild,
    moderatorId,
    requireUserId(body.userId),
    requireReason(body.reason),
    optionalDeleteSeconds(body.deleteSeconds),
    duration ? durationToMs(duration) : null,
  );
}

export async function unbanFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return unbanUser(guild, moderatorId, requireUserId(body.userId), requireReason(body.reason));
}

export async function roleFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const action = body.action;
  if (action !== 'add' && action !== 'remove') {
    throw new HttpError(400, 'Неверное действие с ролью.');
  }
  if (typeof body.roleId !== 'string' || !/^\d{17,20}$/.test(body.roleId.trim())) {
    throw new HttpError(400, 'Укажите корректный ID роли.');
  }

  return roleAction(
    guild,
    moderatorId,
    requireUserId(body.userId),
    body.roleId.trim(),
    action,
    requireReason(body.reason),
  );
}

export async function noteFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const text = requireReason(body.text);
  return noteAddAction(guild, moderatorId, requireUserId(body.userId), text);
}

export async function removeNoteFromPanel(
  guild: Guild,
  moderatorId: string,
  userId: string,
  noteId: string,
): Promise<ActionResult> {
  return noteRemoveAction(guild, moderatorId, requireUserId(userId), noteId);
}

export async function clearWarnsFromPanel(
  guild: Guild,
  moderatorId: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return clearWarnsAction(guild, moderatorId, requireUserId(body.userId));
}

export async function removeWarnFromPanel(
  guild: Guild,
  moderatorId: string,
  userId: string,
  warnId: string,
): Promise<ActionResult> {
  return clearWarnsAction(guild, moderatorId, requireUserId(userId), warnId);
}

export function editCaseFromPanel(
  guildId: string,
  caseId: number,
  body: Record<string, unknown>,
): ModCase {
  const existing = getCase(guildId, caseId);
  if (!existing) throw new HttpError(404, 'Кейс не найден.');

  const patch: Parameters<typeof updateCase>[2] = {};

  if (body.reason !== undefined) {
    patch.reason = requireReason(body.reason);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      throw new HttpError(400, 'Поле active должно быть boolean.');
    }
    patch.active = body.active;
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'Нет изменений.');
  }

  const updated = updateCase(guildId, caseId, patch);
  if (!updated) throw new HttpError(404, 'Кейс не найден.');
  return updated;
}

export interface AppealReviewResult {
  ok: boolean;
  message: string;
}

/** Одобрение/отклонение апелляции из веб-панели (аналог кнопок в Discord) */
export async function reviewAppeal(
  guild: Guild,
  moderator: { id: string; tag: string },
  appealId: number,
  approve: boolean,
  comment?: string | null,
): Promise<AppealReviewResult> {
  const appeal = getAppeal(guild.id, appealId);
  if (!appeal) throw new HttpError(404, 'Апелляция не найдена.');
  if (appeal.status !== 'pending') {
    throw new HttpError(409, 'Эта апелляция уже рассмотрена.');
  }

  if (approve) {
    const resolution = await resolveAppealPunishment(guild, moderator.id, appeal);
    if (!resolution.ok) throw new HttpError(502, resolution.message);
  }

  const reviewedAt = Date.now();
  const reviewComment = comment?.trim() ? comment.trim().slice(0, 500) : null;
  updateAppeal(guild.id, appeal.id, {
    status: approve ? 'approved' : 'rejected',
    reviewedBy: moderator.id,
    reviewedAt,
    reviewComment,
  });

  const punishedCase = appeal.caseId ? getCase(guild.id, appeal.caseId) : null;
  const punishment = punishedCase
    ? `#${punishedCase.id} · ${caseTypeLabel(punishedCase.type)}`
    : null;

  const user = await guild.client.users.fetch(appeal.userId).catch(() => null);
  if (user) {
    await user
      .send({
        components: [
          dmEmbed(approve ? 'appealApproved' : 'appealRejected', guild, {
            reason: appeal.reason,
            caseId: punishedCase?.id ?? null,
            thumbnail: user.displayAvatarURL(),
            fields: reviewComment
              ? [{ label: 'Комментарий модератора', value: reviewComment, block: true }]
              : undefined,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch(() => {});
  }

  await updateAppealMessage(guild, appeal.channelId, appeal.messageId, {
    approve,
    userId: appeal.userId,
    moderatorTag: moderator.tag,
    reason: appeal.reason,
    appealId: appeal.id,
    reviewedAt,
    punishment,
    comment: reviewComment,
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
      color: approve ? COLORS.success : COLORS.danger,
      fields: [
        { name: 'Апелляция', value: `#${appeal.id}`, inline: true },
        { name: 'Пользователь', value: `<@${appeal.userId}>`, inline: true },
        { name: 'Рассмотрел', value: `<@${moderator.id}> (веб-панель)`, inline: true },
        ...(punishment ? [{ name: 'Наказание', value: punishment, inline: true }] : []),
        { name: 'Причина', value: appeal.reason },
        ...(reviewComment
          ? [{ name: 'Комментарий модератора', value: reviewComment, inline: false }]
          : []),
      ],
      footer: `ID: ${appeal.userId}`,
    }),
    'appealUpdate',
  );

  return {
    ok: true,
    message: approve ? 'Апелляция одобрена.' : 'Апелляция отклонена.',
  };
}

async function updateAppealMessage(
  guild: Guild,
  channelId: string | null,
  messageId: string | null,
  data: {
    approve: boolean;
    userId: string;
    moderatorTag: string;
    reason: string;
    appealId: number;
    reviewedAt: number;
    punishment: string | null;
    comment: string | null;
  },
): Promise<void> {
  if (!channelId || !messageId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  const fields = [{ label: 'Причина апелляции', value: data.reason, block: true }];
  if (data.punishment) {
    fields.unshift({ label: 'Наказание', value: data.punishment, block: false });
  }
  if (data.comment) {
    fields.push({ label: 'Комментарий модератора', value: data.comment, block: true });
  }

  await message
    .edit({
      components: [
        card({
          tone: data.approve ? 'success' : 'danger',
          title: data.approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
          description: `Пользователь: <@${data.userId}>\nРассмотрел: ${data.moderatorTag} (веб-панель)`,
          fields,
          footer: `Апелляция #${data.appealId}`,
          timestamp: data.reviewedAt,
        }),
      ],
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => {});
}
