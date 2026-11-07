import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, baseEmbed, COLORS } from '../../lib/embeds.js';
import { sendLog } from '../../lib/logger.js';
import { parseDuration, humanDuration } from '../../lib/format.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 дней — лимит Discord

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Заглушить участника (таймаут)')
    .addUserOption((o) => o.setName('user').setDescription('Кого заглушить').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('duration')
        .setDescription('Длительность: 30s, 10m, 1h, 2d, 1w')
        .setRequired(true),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Причина'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const ms = parseDuration(interaction.options.getString('duration') ?? '');

    if (!ms) {
      return interaction.editReply({
        embeds: [errorEmbed('Неверный формат длительности. Пример: `10m`, `1h`, `2d`, `1w`.')],
      });
    }
    if (ms > MAX_TIMEOUT_MS) {
      return interaction.editReply({ embeds: [errorEmbed('Максимум — 28 дней.')] });
    }
    if (!member) {
      return interaction.editReply({ embeds: [errorEmbed('Участник не найден на сервере.')] });
    }
    if (member.id === interaction.user.id) {
      return interaction.editReply({ embeds: [errorEmbed('Нельзя заглушить самого себя.')] });
    }
    if (!member.moderatable) {
      return interaction.editReply({
        embeds: [errorEmbed('Не могу заглушить: у роли участника слишком высокие права.')],
      });
    }

    await member.timeout(ms, `${interaction.user.tag}: ${reason}`);
    await interaction.editReply({
      embeds: [
        successEmbed(`**${member.user.tag}** заглушён на **${humanDuration(ms)}**.`),
        baseEmbed(COLORS.gray).setDescription(`🧾 Причина: ${reason}`),
      ],
    });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.warn)
        .setTitle('🔇 Таймаут')
        .setDescription(
          `**Кого:** ${member} (${member.user.tag})\n**Кем:** ${interaction.user}\n**Срок:** ${humanDuration(ms)}\n**Причина:** ${reason}`,
        ),
    );
  },
};
