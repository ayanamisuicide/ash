import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { purgeMessages } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Массовая очистка сообщений с фильтрами')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Сколько сообщений удалить (1–1000)')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true),
    )
    .addUserOption((option) => option.setName('user').setDescription('Только сообщения участника'))
    .addBooleanOption((option) => option.setName('bots').setDescription('Только сообщения ботов'))
    .addStringOption((option) => option.setName('contains').setDescription('Содержит текст'))
    .addStringOption((option) => option.setName('regex').setDescription('Регулярное выражение'))
    .addBooleanOption((option) =>
      option.setName('embeds').setDescription('Только сообщения с эмбедами'),
    )
    .addBooleanOption((option) =>
      option.setName('files').setDescription('Только сообщения с вложениями'),
    )
    .addBooleanOption((option) =>
      option.setName('links').setDescription('Только сообщения со ссылками'),
    )
    .addBooleanOption((option) =>
      option.setName('images').setDescription('Только сообщения с изображениями'),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    if (!channel?.isTextBased() || !('bulkDelete' in channel)) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Команда работает только в текстовом канале.' },
        { title: '🧹 Очистка' },
      );
      return;
    }

    const result = await purgeMessages(channel, {
      amount: interaction.options.getInteger('amount', true),
      userId: interaction.options.getUser('user')?.id,
      bots: interaction.options.getBoolean('bots') ?? false,
      contains: interaction.options.getString('contains') ?? undefined,
      regex: interaction.options.getString('regex') ?? undefined,
      embeds: interaction.options.getBoolean('embeds') ?? false,
      files: interaction.options.getBoolean('files') ?? false,
      links: interaction.options.getBoolean('links') ?? false,
      images: interaction.options.getBoolean('images') ?? false,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString('reason') ?? undefined,
    });

    await replyActionResult(interaction, result, { title: '🧹 Очистка' });
  },
} satisfies Command;
