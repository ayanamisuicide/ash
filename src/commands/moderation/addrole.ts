import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { roleAction } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Выдать роль участнику')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому выдать роль').setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('role').setDescription('Какую роль выдать').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await roleAction(
      interaction.guild,
      interaction.user.id,
      user.id,
      role.id,
      'add',
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🎭 Выдача роли',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
