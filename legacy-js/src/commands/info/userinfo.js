import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Информация о пользователе')
    .addUserOption((o) =>
      o.setName('user').setDescription('Чей профиль (по умолчанию — твой)'),
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.options.getMember('user') ?? interaction.member;
    const embed = baseEmbed()
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: '🆔 ID', value: user.id, inline: true },
        { name: '📅 Создан', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );
    if (member?.joinedTimestamp) {
      embed.addFields({
        name: '📥 Зашёл',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });
      const roles = member.roles.cache.filter((role) => role.id !== interaction.guild.id);
      embed.addFields({
        name: `🎭 Роли (${roles.size})`,
        value: roles.map((role) => role.toString()).join(' ').slice(0, 1024) || '—',
        inline: true,
      });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
