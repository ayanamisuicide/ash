import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, baseEmbed, COLORS } from '../../lib/embeds.js';
import { sendLog } from '../../lib/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Кикнуть участника с сервера')
    .addUserOption((o) => o.setName('user').setDescription('Кого кикнуть').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина кика'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    if (!target) {
      return interaction.editReply({ embeds: [errorEmbed('Пользователь не найден на сервере.')] });
    }
    if (target.id === interaction.user.id) {
      return interaction.editReply({ embeds: [errorEmbed('Нельзя кикнуть самого себя.')] });
    }
    if (!target.kickable) {
      return interaction.editReply({
        embeds: [errorEmbed('Не могу кикнуть: у бота нет прав или роль цели выше роли бота.')],
      });
    }

    // Пытаемся отправить в личные сообщения
    await target.send(`🪓 Ты кикнут с сервера **${interaction.guild.name}**.\n🧾 Причина: ${reason}`).catch(() => {});

    await interaction.guild.members.kick(target.id, reason);

    await interaction.editReply({
      embeds: [
        successEmbed(`**${target.user.tag}** кикнут.`),
        baseEmbed(COLORS.gray).setDescription(`🧾 Причина: ${reason}`),
      ],
    });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.warn)
        .setTitle('🪓 Кик')
        .setDescription(`**Кого:** ${target} (${target.user.tag})\n**Кем:** ${interaction.user}\n**Причина:** ${reason}`),
    );
  },
};
