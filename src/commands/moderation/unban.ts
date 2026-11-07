import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { unbanUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Разбанить пользователя по ID')
    .addStringOption((option) =>
      option
        .setName('user_id')
        .setDescription('ID пользователя (например 123456789012345678)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина разбана').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    if (!/^\d{17,20}$/.test(userId)) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Это не похоже на ID пользователя.' },
        { title: '🔓 Разбан' },
      );
      return;
    }

    const result = await unbanUser(
      interaction.guild,
      interaction.user.id,
      userId,
      reason,
    );

    await replyActionResult(interaction, result, { title: '🔓 Разбан' });
  },
} satisfies Command;
