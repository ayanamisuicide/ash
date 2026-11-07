import type { ButtonInteraction } from 'discord.js';
import { V2, card, errorCard } from '../lib/card.js';
import { takeConfirmation } from '../lib/confirmations.js';
import {
  lockdownGuild,
  massbanUsers,
  setRole,
  unlockAll,
  type ActionResult,
} from '../lib/moderation.js';
import { updateNukeConfig } from '../lib/modSettings.js';

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

export async function handleConfirmationButton(
  interaction: ButtonInteraction<'cached'>,
): Promise<void> {
  const [scope, decision, id] = interaction.customId.split(':');
  if (scope !== 'confirm' || !id) return;

  const pending = takeConfirmation(id, interaction.guild.id, interaction.user.id);
  if (!pending) {
    await interaction
      .update({
        components: [errorCard('Подтверждение устарело. Запустите команду заново.')],
        flags: V2,
      })
      .catch(() => {});
    return;
  }

  if (decision === 'no') {
    await interaction
      .update({
        components: [
          card({
            tone: 'neutral',
            title: 'Отменено',
            description: 'Действие не выполнено.',
            timestamp: false,
          }),
        ],
        flags: V2,
      })
      .catch(() => {});
    return;
  }

  if (decision !== 'yes') {
    await interaction
      .update({ components: [errorCard('Неизвестное действие.')], flags: V2 })
      .catch(() => {});
    return;
  }

  if (!interaction.memberPermissions?.has(pending.permission)) {
    await interaction
      .update({
        components: [errorCard('У тебя больше нет прав на это действие.')],
        flags: V2,
      })
      .catch(() => {});
    return;
  }

  let result: ActionResult | null = null;

  switch (pending.kind) {
    case 'setrole':
      result = await setRole(
        interaction.guild,
        interaction.user.id,
        payloadString(pending.payload, 'userId'),
        payloadString(pending.payload, 'roleId'),
        payloadString(pending.payload, 'reason'),
      );
      break;

    case 'massban': {
      const userIds = Array.isArray(pending.payload.userIds)
        ? pending.payload.userIds.filter((item): item is string => typeof item === 'string')
        : [];
      result = await massbanUsers(
        interaction.guild,
        interaction.user.id,
        userIds,
        payloadString(pending.payload, 'reason'),
        typeof pending.payload.deleteSeconds === 'number' ? pending.payload.deleteSeconds : 0,
      );
      break;
    }

    case 'lockdown': {
      const enabled = pending.payload.enabled === true;
      const reason = payloadString(pending.payload, 'reason');
      result = enabled
        ? await lockdownGuild(interaction.guild, interaction.user.id, reason)
        : await unlockAll(interaction.guild, interaction.user.id, reason);
      break;
    }

    case 'antinuke-action': {
      if (pending.payload.action === 'ban') {
        updateNukeConfig(interaction.guild.id, { action: 'ban' });
        result = {
          ok: true,
          message: 'Действие анти-нака переключено на **бан**.',
        };
      } else {
        result = { ok: false, message: 'Неизвестное действие.' };
      }
      break;
    }
  }

  const final = result ?? { ok: false, message: 'Не удалось выполнить действие.' };

  await interaction
    .update({
      components: [
        card({
          tone: final.ok ? 'success' : 'danger',
          title: final.ok ? 'Готово' : 'Ошибка',
          description: final.message,
          footer: final.caseId ? `Кейс #${final.caseId}` : null,
          timestamp: false,
        }),
      ],
      flags: V2,
    })
    .catch(() => {});
}
