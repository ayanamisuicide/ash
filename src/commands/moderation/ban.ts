import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { banUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

const DELETE_CHOICES = [
  { name: 'не удалять', value: '0' },
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить участника на сервере')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого забанить').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина бана').setMaxLength(450),
    )
    .addStringOption((option) =>
      option
        .setName('delete_messages')
        .setDescription('Удалить сообщения за период')
        .addChoices(...DELETE_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(interaction.options.getString('delete_messages') ?? '0');

    const result = await banUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      reason,
      Number.isFinite(deleteSeconds) ? deleteSeconds : 0,
    );

    await replyActionResult(interaction, result, {
      title: '🔨 Бан выдан',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
