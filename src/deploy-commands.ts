import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './core/loader.js';
import { closeDatabase } from './storage/sqlite.js';

async function main(): Promise<void> {
  if (!config.token || !config.clientId) {
    console.error('[deploy] Заполните DISCORD_TOKEN и DISCORD_CLIENT_ID в .env');
    closeDatabase();
    process.exit(1);
  }

  const commands = await loadCommands();
  console.log(`[deploy] регистрирую команд: ${commands.length}`);

  const rest = new REST().setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());

  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(config.clientId, config.guildId)
      : Routes.applicationCommands(config.clientId);

    const result = (await rest.put(route, { body })) as unknown[];
    console.log(
      `[deploy] готово: ${result.length} команд${config.guildId ? ' (на сервере)' : ' (глобально, до 1 часа)'}`,
    );
    closeDatabase();
  } catch (error) {
    console.error('[deploy] ошибка:', error);
    closeDatabase();
    process.exit(1);
  }
}

main();
