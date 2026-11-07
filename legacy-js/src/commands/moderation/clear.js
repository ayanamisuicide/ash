import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { baseEmbed, COLORS } from '../../lib/embeds.js';

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // Discord удаляет сообщения не старее 14 дней

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Удалить сообщения в текущем канале')
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('Сколько сообщений (1–100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((o) => o.setName('user').setDescription('Только сообщения этого пользователя'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: target ? 100 : amount });
    const deletable = messages
      .filter(
        (m) =>
          !m.pinned &&
          Date.now() - m.createdTimestamp < MAX_AGE_MS &&
          (!target || m.author.id === target.id),
      )
      .first(amount) ?? [];

    if (deletable.length === 0) {
      return interaction.editReply({
        embeds: [
          baseEmbed(COLORS.warn).setDescription(
            '⚠️ Не нашел сообщений для удаления (учтите: сообщения не должны быть старше 14 дней).',
          ),
        ],
      });
    }

    const deleted = await interaction.channel.bulkDelete(deletable, true);
    await interaction.editReply({
      embeds: [
        baseEmbed(COLORS.success).setDescription(
          `🧹 Удалено **${deleted.size}** сообщений${target ? ` от ${target}` : ''}.`,
        ),
      ],
    });
  },
};
