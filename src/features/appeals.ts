import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildBan,
} from 'discord.js';
import { COLORS } from '../lib/embeds.js';
import { V2, card, errorCard } from '../lib/card.js';
import { logCard } from '../lib/logCard.js';
import { sendLog } from '../lib/logger.js';
import { getAppeal, updateAppeal } from '../lib/appeals.js';
import { unmuteUser } from '../lib/moderation.js';

function allowed(interaction: ButtonInteraction<'cached'>): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

export async function handleAppealButton(
  interaction: ButtonInteraction<'cached'>,
): Promise<void> {
  const [scope, action, guildId, rawId] = interaction.customId.split(':');
  if (scope !== 'appeal' || interaction.guild.id !== guildId) {
    await interaction.reply({
      components: [errorCard('Эта кнопка относится к другому серверу.')],
      flags: V2 | MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  if (!allowed(interaction)) {
    await interaction.reply({
      components: [errorCard('Нужно право «Банить участников» или «Управление сервером».')],
      flags: V2 | MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  const appealId = Number(rawId);
  const appeal = Number.isInteger(appealId)
    ? getAppeal(interaction.guild.id, appealId)
    : null;

  if (!appeal) {
    await interaction.update({
      components: [errorCard('Апелляция не найдена.')],
      flags: V2,
    }).catch(() => {});
    return;
  }

  if (appeal.status !== 'pending') {
    await interaction.update({
      components: [
        card({
          tone: 'neutral',
          title: '📨 Апелляция',
          description: 'Эта апелляция уже рассмотрена.',
          timestamp: false,
        }),
      ],
      flags: V2,
    }).catch(() => {});
    return;
  }

  const approve = action === 'approve';
  const reviewedAt = Date.now();

  if (approve) {
    let banned: GuildBan | null = null;
    try {
      banned = await interaction.guild.bans.fetch(appeal.userId);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 10026) {
        console.error('[appeal] не удалось проверить бан:', error);
        await interaction
          .reply({
            components: [
              errorCard(
                'Не удалось проверить бан. Проверьте право бота «Банить участников».',
              ),
            ],
            flags: V2 | MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }
    }

    if (banned) {
      try {
        await interaction.guild.bans.remove(
          appeal.userId,
          `Апелляция #${appeal.id} одобрена (${interaction.user.tag})`,
        );
      } catch (error) {
        console.error('[appeal] не удалось снять бан:', error);
        await interaction
          .reply({
            components: [
              errorCard(
                'Не удалось снять бан. Проверьте право бота «Банить участников».',
              ),
            ],
            flags: V2 | MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }
    }

    await unmuteUser(
      interaction.guild,
      interaction.user.id,
      appeal.userId,
      `Апелляция #${appeal.id} одобрена`,
    ).catch(() => null);
  }

  updateAppeal(interaction.guild.id, appeal.id, {
    status: approve ? 'approved' : 'rejected',
    reviewedBy: interaction.user.id,
    reviewedAt,
    channelId: interaction.channelId,
    messageId: interaction.message.id,
  });

  const user = await interaction.client.users
    .fetch(appeal.userId)
    .catch(() => null);
  await user
    ?.send(
      approve
        ? `✅ Твоя апелляция на сервере **${interaction.guild.name}** одобрена.`
        : `❌ Твоя апелляция на сервере **${interaction.guild.name}** отклонена.`,
    )
    .catch(() => {});

  await interaction.update({
    components: [
      card({
        tone: approve ? 'success' : 'danger',
        title: approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
        description: `Пользователь: <@${appeal.userId}>\nРассмотрел: ${interaction.user}`,
        fields: [{ label: 'Причина', value: appeal.reason, block: true }],
        footer: `Апелляция #${appeal.id}`,
        timestamp: reviewedAt,
      }),
    ],
    flags: V2,
  }).catch(() => {});

  await sendLog(
    interaction.guild,
    logCard(interaction.guild, {
      title: approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
      color: approve ? COLORS.success : COLORS.danger,
      fields: [
        { name: 'Апелляция', value: `#${appeal.id}`, inline: true },
        { name: 'Пользователь', value: `<@${appeal.userId}>`, inline: true },
        { name: 'Рассмотрел', value: `${interaction.user}`, inline: true },
        { name: 'Причина', value: appeal.reason },
      ],
      footer: `ID: ${appeal.userId}`,
    }),
    'appealUpdate',
  );
}
