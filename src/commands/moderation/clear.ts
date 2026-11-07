import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { purgeMessages } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Удалить сообщения в текущем канале')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Сколько сообщений (1–100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Удалить только сообщения этого пользователя'),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getInteger('amount', true);
    const target = interaction.options.getUser('user');

    const channel = interaction.channel;
    if (!channel?.isTextBased() || !('bulkDelete' in channel)) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Команда работает только в текстовом канале сервера.' },
        { title: '🧹 Очистка' },
      );
      return;
    }

    const result = await purgeMessages(channel, {
      amount,
      userId: target?.id,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString('reason') ?? undefined,
    });
    await replyActionResult(interaction, result, { title: '🧹 Очистка' });
  },
} satisfies Command;
