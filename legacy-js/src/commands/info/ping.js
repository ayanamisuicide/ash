import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Задержка бота'),
  async execute(interaction) {
    await interaction.reply(`🏓 Pong! Задержка: **${interaction.client.ws.ping} мс**`);
  },
};
