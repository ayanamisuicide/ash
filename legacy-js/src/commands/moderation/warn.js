import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { warnEmbed, errorEmbed, baseEmbed, COLORS } from '../../lib/embeds.js';
import { addWarn, getWarns } from '../../lib/warns.js';
import { sendLog } from '../../lib/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Выдать предупреждение участнику')
    .addUserOption((o) => o.setName('user').setDescription('Кому предупреждение').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) {
      return interaction.editReply({ embeds: [errorEmbed('Участник не найден на сервере.')] });
    }
    if (target.user.bot) {
      return interaction.editReply({ embeds: [errorEmbed('Ботам предупреждения не выдаются.')] });
    }

    const count = addWarn(interaction.guild.id, target.id, interaction.user.id, reason);

    await target
      .send(
        `⚠️ Тебе выдано предупреждение **${count}** на сервере **${interaction.guild.name}**.\n🧾 Причина: ${reason}`,
      )
      .catch(() => {});

    await interaction.editReply({
      embeds: [
        warnEmbed(
          `**${target.user.tag}** получил(а) предупреждение (всего: **${count}**).\n🧾 Причина: ${reason}`,
        ),
      ],
    });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.warn)
        .setTitle('⚠️ Предупреждение')
        .setDescription(
          `**Кому:** ${target} (${target.user.tag})\n**Кем:** ${interaction.user}\n**Всего:** ${count}\n**Причина:** ${reason}`,
        ),
    );
  },
};
