import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { lockChannel } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Заблокировать канал для @everyone')
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
        { title: '🔒 Блокировка' },
      );
      return;
    }

    const result = await lockChannel(
      interaction.guild,
      channel,
      interaction.user.id,
      interaction.options.getString('reason') ?? 'Без причины',
    );

    await replyActionResult(interaction, result, { title: '🔒 Блокировка' });
  },
} satisfies Command;
