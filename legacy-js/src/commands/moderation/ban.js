import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, baseEmbed, COLORS } from '../../lib/embeds.js';
import { sendLog } from '../../lib/logger.js';

const DELETE_CHOICES = [
  { name: 'не удалять', value: '0' },
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить пользователя на сервере')
    .addUserOption((o) => o.setName('user').setDescription('Кого забанить').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина бана'))
    .addStringOption((o) =>
      o
        .setName('delete')
        .setDescription('Сколько сообщений удалить за период')
        .addChoices(...DELETE_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(interaction.options.getString('delete') ?? '0');

    if (user.id === interaction.user.id) {
      return interaction.editReply({ embeds: [errorEmbed('Нельзя забанить самого себя.')] });
    }
    if (user.id === interaction.client.user.id) {
      return interaction.editReply({ embeds: [errorEmbed('Я не буду банить себя 🙂')] });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) {
      return interaction.editReply({
        embeds: [errorEmbed('Не могу забанить: у бота нет прав или роль цели выше роли бота.')],
      });
    }

    await user
      .send(`🔨 Ты забанен на сервере **${interaction.guild.name}**.\n🧾 Причина: ${reason}`)
      .catch(() => {});

    await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteSeconds,
      reason: `${interaction.user.tag}: ${reason}`,
    });

    await interaction.editReply({
      embeds: [
        successEmbed(`**${user.tag}** забанен.`),
        baseEmbed(COLORS.gray).setDescription(`🧾 Причина: ${reason}`),
      ],
    });
    await sendLog(
      interaction.guild,
      baseEmbed(COLORS.danger)
        .setTitle('🔨 Бан')
        .setDescription(`**Кого:** ${user} (${user.tag})\n**Кем:** ${interaction.user}\n**Причина:** ${reason}`),
    );
  },
};
