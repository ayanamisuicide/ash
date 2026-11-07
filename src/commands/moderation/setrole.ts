import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { setRole } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Заменить все управляемые роли участника одной ролью')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому установить роль').setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('role').setDescription('Какая роль должна остаться').setRequired(true),
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

    const result = await setRole(
      interaction.guild,
      interaction.user.id,
      user.id,
      role.id,
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🎭 Установка роли',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
