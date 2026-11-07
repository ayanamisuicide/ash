import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { setSlowmode } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Установить медленный режим в канале')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Секунды (0 — выключить)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    )
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
        { title: '🐌 Slowmode' },
      );
      return;
    }

    const result = await setSlowmode(
      interaction.guild,
      channel,
      interaction.options.getInteger('seconds', true),
      interaction.user.id,
      interaction.options.getString('reason') ?? 'Без причины',
    );

    await replyActionResult(interaction, result, { title: '🐌 Slowmode' });
  },
} satisfies Command;
