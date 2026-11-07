import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { roleAction } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Снять роль с участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('С кого снять роль').setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('role').setDescription('Какую роль снять').setRequired(true),
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
      'remove',
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🎭 Снятие роли',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
