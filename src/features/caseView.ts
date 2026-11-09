import { MessageFlags, PermissionFlagsBits, type ButtonInteraction } from 'discord.js';
import { V2, errorCard } from '../lib/card.js';
import { getCase } from '../lib/cases.js';
import { successEmbed } from '../lib/embeds.js';
import { clearWarnsAction, unbanUser, unmuteUser, untimeoutUser } from '../lib/moderation.js';
import { caseDetailsCard } from '../lib/responses.js';

function parseCaseId(customId: string): number | null {
  const [, , rawId] = customId.split(':');
  const caseId = Number(rawId);
  return Number.isInteger(caseId) && caseId > 0 ? caseId : null;
}

async function replyError(
  interaction: ButtonInteraction<'cached'>,
  message: string,
): Promise<void> {
  await interaction
    .reply({
      components: [errorCard(message)],
      flags: V2 | MessageFlags.Ephemeral,
    })
    .catch(() => {});
}

/**
 * Кнопка «Просмотреть кейс» из публичного ответа на наказание.
 * Показывает карточку кейса только модераторам.
 */
export async function handleCaseButton(interaction: ButtonInteraction<'cached'>): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await replyError(interaction, 'Просматривать кейсы могут только модераторы.');
    return;
  }

  const caseId = parseCaseId(interaction.customId);
  const modCase = caseId ? getCase(interaction.guild.id, caseId) : null;

  if (!modCase) {
    await replyError(interaction, 'Кейс не найден или уже удалён.');
    return;
  }

  await interaction
    .reply({
      components: [caseDetailsCard(modCase)],
      flags: V2 | MessageFlags.Ephemeral,
    })
    .catch(() => {});
}

/**
 * Кнопка «Отменить действие»: откатывает активный варн, мут, таймаут,
 * бан или временный бан. Доступна только администраторам сервера.
 */
export async function handleUndoCaseButton(
  interaction: ButtonInteraction<'cached'>,
): Promise<void> {
  const permissions = interaction.memberPermissions;
  const canUndo = Boolean(
    permissions?.has(PermissionFlagsBits.Administrator) ||
    permissions?.has(PermissionFlagsBits.ManageGuild),
  );
  if (!canUndo) {
    await replyError(interaction, 'Отменять действия могут только администраторы.');
    return;
  }

  const caseId = parseCaseId(interaction.customId);
  const modCase = caseId ? getCase(interaction.guild.id, caseId) : null;
  if (!modCase || !modCase.userId) {
    await replyError(interaction, 'Кейс не найден или уже удалён.');
    return;
  }
  if (!modCase.active) {
    await replyError(interaction, 'Это действие уже отменено или завершено.');
    return;
  }

  const reason = `Отмена действия по кейсу #${modCase.id} (${interaction.user.tag})`;
  const common = [interaction.guild, interaction.user.id, modCase.userId, reason] as const;

  let result: { ok: boolean; message: string };

  switch (modCase.type) {
    case 'warn': {
      const warnId = typeof modCase.extra.warnId === 'string' ? modCase.extra.warnId : null;
      if (!warnId) {
        await replyError(interaction, 'У кейса нет ID предупреждения — отмена невозможна.');
        return;
      }
      result = await clearWarnsAction(
        interaction.guild,
        interaction.user.id,
        modCase.userId,
        warnId,
        reason,
      );
      break;
    }
    case 'mute':
      result = await unmuteUser(...common);
      break;
    case 'timeout':
      result = await untimeoutUser(...common);
      break;
    case 'ban':
    case 'tempban':
      result = await unbanUser(...common);
      break;
    default:
      await replyError(interaction, 'Для этого типа кейса отмена кнопкой не поддерживается.');
      return;
  }

  await interaction
    .reply({
      components: [
        result.ok ? successEmbed('Действие отменено', result.message) : errorCard(result.message),
      ],
      flags: V2 | MessageFlags.Ephemeral,
    })
    .catch(() => {});
}
