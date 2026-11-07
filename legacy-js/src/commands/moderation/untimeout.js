import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../lib/embeds.js';
import { sendLog } from '../../lib/logger.js';
import { baseEmbed, COLORS } from '../../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Снять заглушение с участника')
    .addUserOption((o) => o.setName('user').setDescription('Кого разоглушить').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const member = interaction.options.getMember('user');
    if (!member) {
      return interaction.editReply({ embeds: [errorEmbed('Участник не найден на сервере.')] });
    }

    await member.timeout(null, `Таймаут снят: ${interaction.user.tag}`);
    await interaction.editReply({ embeds: [successEmbed(`**${member.user.tag}** разоглушен.`)] });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.success)
        .setTitle('🔊 Разглушен')
        .setDescription(`**Кого:** ${member} (${member.user.tag})\n**Кем:** ${interaction.user}`),
    );
  },
};
