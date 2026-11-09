import { MessageFlags, PermissionFlagsBits, type ButtonInteraction } from 'discord.js';
import { COLORS, dmEmbed } from '../lib/embeds.js';
import { V2, card, errorCard } from '../lib/card.js';
import { logCard } from '../lib/logCard.js';
import { sendLog } from '../lib/logger.js';
import { getAppeal, updateAppeal } from '../lib/appeals.js';
import { resolveAppealPunishment } from '../lib/appealResolution.js';
import { caseTypeLabel, getCase } from '../lib/cases.js';

export async function handleAppealButton(interaction: ButtonInteraction<'cached'>): Promise<void> {
  const [scope, action, guildId, rawId] = interaction.customId.split(':');
  if (scope !== 'appeal' || interaction.guild.id !== guildId) {
    await interaction
      .reply({
        components: [errorCard('Эта кнопка относится к другому серверу.')],
        flags: V2 | MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const appealId = Number(rawId);
  const appeal = Number.isInteger(appealId) ? getAppeal(interaction.guild.id, appealId) : null;

  if (!appeal) {
    await interaction
      .update({
        components: [errorCard('Апелляция не найдена.')],
        flags: V2,
      })
      .catch(() => {});
    return;
  }

  if (appeal.status !== 'pending') {
    await interaction
      .update({
        components: [
          card({
            tone: 'neutral',
            title: '📨 Апелляция',
            description: 'Эта апелляция уже рассмотрена.',
            timestamp: false,
          }),
        ],
        flags: V2,
      })
      .catch(() => {});
    return;
  }

  const punishedCase = appeal.caseId ? getCase(interaction.guild.id, appeal.caseId) : null;
  const requiresBan =
    !punishedCase ||
    punishedCase.type === 'ban' ||
    punishedCase.type === 'tempban' ||
    punishedCase.type === 'softban';
  const permissions = interaction.memberPermissions;
  const canReview = Boolean(
    permissions?.has(PermissionFlagsBits.ManageGuild) ||
    (requiresBan
      ? permissions?.has(PermissionFlagsBits.BanMembers)
      : permissions?.has(PermissionFlagsBits.ModerateMembers)),
  );

  if (!canReview) {
    await interaction
      .reply({
        components: [
          errorCard(
            requiresBan
              ? 'Нужно право «Банить участников» или «Управление сервером».'
              : 'Нужно право «Заглушать участников» или «Управление сервером».',
          ),
        ],
        flags: V2 | MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const approve = action === 'approve';
  const reviewedAt = Date.now();

  if (approve) {
    const resolution = await resolveAppealPunishment(
      interaction.guild,
      interaction.user.id,
      appeal,
    );
    if (!resolution.ok) {
      await interaction
        .reply({
          components: [errorCard(resolution.message)],
          flags: V2 | MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
  }

  updateAppeal(interaction.guild.id, appeal.id, {
    status: approve ? 'approved' : 'rejected',
    reviewedBy: interaction.user.id,
    reviewedAt,
    channelId: interaction.channelId,
    messageId: interaction.message.id,
  });

  const user = await interaction.client.users.fetch(appeal.userId).catch(() => null);
  if (user) {
    await user
      .send({
        components: [
          dmEmbed(approve ? 'appealApproved' : 'appealRejected', interaction.guild, {
            reason: appeal.reason,
            caseId: punishedCase?.id ?? null,
            thumbnail: user.displayAvatarURL(),
          }),
        ],
        flags: V2,
      })
      .catch(() => {});
  }

  const cardFields = [{ label: 'Причина апелляции', value: appeal.reason, block: true }];
  if (punishedCase) {
    cardFields.unshift({
      label: 'Наказание',
      value: `#${punishedCase.id} · ${caseTypeLabel(punishedCase.type)}`,
      block: false,
    });
  }

  await interaction
    .update({
      components: [
        card({
          tone: approve ? 'success' : 'danger',
          title: approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
          description: `Пользователь: <@${appeal.userId}>\nРассмотрел: ${interaction.user}`,
          fields: cardFields,
          footer: `Апелляция #${appeal.id}`,
          timestamp: reviewedAt,
        }),
      ],
      flags: V2,
    })
    .catch(() => {});

  await sendLog(
    interaction.guild,
    logCard(interaction.guild, {
      title: approve ? '✅ Апелляция одобрена' : '❌ Апелляция отклонена',
      color: approve ? COLORS.success : COLORS.danger,
      fields: [
        { name: 'Апелляция', value: `#${appeal.id}`, inline: true },
        { name: 'Пользователь', value: `<@${appeal.userId}>`, inline: true },
        { name: 'Рассмотрел', value: `${interaction.user}`, inline: true },
        ...(punishedCase
          ? [
              {
                name: 'Наказание',
                value: `#${punishedCase.id} · ${caseTypeLabel(punishedCase.type)}`,
                inline: true,
              },
            ]
          : []),
        { name: 'Причина', value: appeal.reason },
      ],
      footer: `ID: ${appeal.userId}`,
    }),
    'appealUpdate',
  );
}
