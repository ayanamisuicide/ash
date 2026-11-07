import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, baseEmbed, COLORS } from '../../lib/embeds.js';
import { sendLog } from '../../lib/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Разбанить пользователя по его ID')
    .addStringOption((o) =>
      o.setName('user_id').setDescription('ID пользователя (например 123456789012345678)').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const id = interaction.options.getString('user_id').trim();
    if (!/^\d{17,20}$/.test(id)) {
      return interaction.editReply({ embeds: [errorEmbed('Это не похоже на ID пользователя.')] });
    }

    const user = await interaction.guild.members.unban(id, `Разбанен ${interaction.user.tag}`).catch(() => null);
    if (!user) {
      return interaction.editReply({ embeds: [errorEmbed('Пользователь не забанен или не найден.')] });
    }

    await interaction.editReply({ embeds: [successEmbed(`**${user.tag}** разбанен.`)] });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.success)
        .setTitle('🔓 Разбан')
        .setDescription(`**Кого:** ${user.tag}\n**Кем:** ${interaction.user}`),
    );
  },
};
