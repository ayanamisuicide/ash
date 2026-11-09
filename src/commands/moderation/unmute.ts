import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { unmuteUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Снять мут с участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('С кого снять мут').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await unmuteUser(interaction.guild, interaction.user.id, user.id, reason);

    await replyActionResult(interaction, result, {
      action: 'unmute',
      target: user,
      moderator: interaction.user,
      reason,
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
