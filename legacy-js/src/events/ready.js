import { config } from '../config.js';

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[bot] Готов: ${client.user.tag} (${client.user.id})`);
    console.log(
      `[bot] Серверов: ${client.guilds.cache.size}. Команд: ${client.commands.size}`,
    );
    if (!config.guildId) {
      console.log('[bot] Подсказка: укажи GUILD_ID в .env, чтобы слэш-команды обновлялись мгновенно');
    }
    client.user.setActivity('/help');
  },
};
