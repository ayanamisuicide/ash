import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { baseEmbed } from '../../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Информация о сервере'),
  async execute(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    const embed = baseEmbed()
      .setTitle(`🏰 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: '👑 Владелец', value: `${owner.user.tag}`, inline: true },
        { name: '👥 Участники', value: String(guild.memberCount), inline: true },
        { name: '📅 Создан', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        {
          name: '📺 Каналы',
          value: `Текст: ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size}\n` +
            `Голос: ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size}`,
          inline: true,
        },
        { name: '🎭 Роли', value: String(guild.roles.cache.size), inline: true },
        { name: '🚀 Бусты', value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
