import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, errorCard } from '../../lib/card.js';
import { buildConfirmationView, createConfirmation } from '../../lib/confirmations.js';

const DELETE_CHOICES = [
  { name: 'не удалять', value: '0' },
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Забанить несколько пользователей по ID')
    .addStringOption((option) =>
      option
        .setName('users')
        .setDescription('ID через запятую или пробел (до 50)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .addStringOption((option) =>
      option
        .setName('delete_messages')
        .setDescription('Удалить сообщения за период')
        .addChoices(...DELETE_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const input = interaction.options.getString('users', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(interaction.options.getString('delete_messages') ?? '0');
    const ids = input
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      await interaction.editReply({
        components: [errorCard('Укажите хотя бы один ID пользователя.')],
        flags: V2,
      });
      return;
    }
    if (ids.length > 50) {
      await interaction.editReply({
        components: [errorCard('За один раз можно забанить не более 50 пользователей.')],
        flags: V2,
      });
      return;
    }

    const id = createConfirmation({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      kind: 'massban',
      permission: PermissionFlagsBits.BanMembers,
      payload: {
        userIds: ids,
        reason,
        deleteSeconds: Number.isFinite(deleteSeconds) ? deleteSeconds : 0,
      },
    });

    await interaction.editReply(
      buildConfirmationView(
        id,
        '🔨 Подтверждение массового бана',
        `Забанить **${ids.length}** пользователей?`,
        [
          { label: 'ID', value: ids.slice(0, 10).join(', '), block: true },
          { label: 'Причина', value: reason, block: true },
        ],
      ),
    );
  },
} satisfies Command;
