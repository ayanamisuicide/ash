import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { untimeoutUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Снять заглушение с участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('С кого снять таймаут').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await untimeoutUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🔊 Снятие таймаута',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
