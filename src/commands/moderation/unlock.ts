import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { unlockChannel } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Разблокировать канал')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Канал (по умолчанию текущий)'),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply();
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel || !channel.isTextBased() || channel.isThread()) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Укажите текстовый канал (не ветку).' },
        { title: '🔓 Разблокировка' },
      );
      return;
    }

    const result = await unlockChannel(
      interaction.guild,
      channel,
      interaction.user.id,
      interaction.options.getString('reason') ?? 'Без причины',
    );

    await replyActionResult(interaction, result, { title: '🔓 Разблокировка' });
  },
} satisfies Command;
