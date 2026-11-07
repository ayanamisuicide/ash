import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { kickUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Кикнуть участника с сервера')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого кикнуть').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина кика').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await kickUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '👢 Кик',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
