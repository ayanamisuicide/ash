import { errorEmbed } from '../lib/embeds.js';
import { db } from '../storage/db.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[bot] Неизвестная команда: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[bot] Ошибка в команде /${interaction.commandName}:`, error);
      if (interaction.isRepliable()) {
        const payload = { embeds: [errorEmbed('Произошла ошибка при выполнении команды.')] };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
        }
      }
    }

    // статистика использования
    const key = interaction.commandName;
    db.set(`stats.${key}`, (db.get(`stats.${key}`, 0) ?? 0) + 1);
  },
};
