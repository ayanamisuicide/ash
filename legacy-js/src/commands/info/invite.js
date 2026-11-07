import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { baseEmbed, successEmbed, errorEmbed } from '../../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Ссылка для приглашения бота на сервер'),
  async execute(interaction) {
    const url = `https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&scope=bot+applications.commands&permissions=${PermissionFlagsBits.Administrator}`;
    const embed = baseEmbed()
      .setTitle('🔗 Пригласить бота')
      .setDescription(
        `Добавь бота на сервер: [нажми здесь](${url})\n\n` +
          `⚠️ По ссылке бот получает права **администратора** для работы автомодерации. ` +
          `Если хочешь выдать меньше прав — создай ссылку вручную без параметра \`permissions\`.`,
      );
    await interaction.reply({ embeds: [embed] });
  },
};
