import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { muteUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Заглушить участника через роль Muted')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого заглушить').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('duration').setDescription('Длительность: 10m, 1h, 2d (пусто — навсегда)'),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await muteUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      duration,
      reason,
    );

    await replyActionResult(interaction, result, {
      action: 'mute',
      target: user,
      moderator: interaction.user,
      reason,
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
