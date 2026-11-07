import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { timeoutUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Заглушить участника (таймаут)')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого заглушить').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription('Длительность: 30s, 10m, 1h, 2d, 1w')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const duration = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await timeoutUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      duration,
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🔇 Таймаут',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
