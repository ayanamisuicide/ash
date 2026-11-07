import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { lockdownGuild, unlockAll } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Заблокировать или разблокировать все текстовые каналы')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('true — заблокировать, false — разблокировать')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply();
    const enabled = interaction.options.getBoolean('enabled', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = enabled
      ? await lockdownGuild(interaction.guild, interaction.user.id, reason)
      : await unlockAll(interaction.guild, interaction.user.id, reason);

    await replyActionResult(interaction, result, {
      title: enabled ? '🔒 Lockdown' : '🔓 Снятие lockdown',
    });
  },
} satisfies Command;
