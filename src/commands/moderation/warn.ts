import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { warnUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Выдать предупреждение участнику')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому предупреждение').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(500).setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    const result = await warnUser(interaction.guild, interaction.user.id, user.id, reason);

    await replyActionResult(interaction, result, {
      action: 'warn',
      target: user,
      moderator: interaction.user,
      reason,
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
