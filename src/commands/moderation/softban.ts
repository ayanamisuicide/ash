import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { softbanUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

const DELETE_CHOICES = [
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Софтбан: бан и мгновенный разбан с очисткой сообщений')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого софтбанить').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .addStringOption((option) =>
      option
        .setName('delete_messages')
        .setDescription('За какой период удалить сообщения')
        .addChoices(...DELETE_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(
      interaction.options.getString('delete_messages') ?? '86400',
    );

    const result = await softbanUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      reason,
      Number.isFinite(deleteSeconds) ? deleteSeconds : 86_400,
    );

    await replyActionResult(interaction, result, {
      title: '🧹 Софтбан',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
