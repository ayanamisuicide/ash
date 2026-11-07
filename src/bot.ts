import type { ClientEvents } from 'discord.js';
import { config } from './config.js';
import { BotClient } from './core/client.js';
import { loadCommands, loadEvents } from './core/loader.js';

/**
 * Загружает команды и события, подключается к Discord.
 * Возвращает готовый клиент (используется веб-панелью).
 */
export async function startBot(): Promise<BotClient> {
  const client = new BotClient();

  for (const command of await loadCommands()) {
    client.commands.set(command.data.name, command);
  }
  console.log(`[bot] загружено команд: ${client.commands.size}`);
  console.log(`[bot] команды: ${[...client.commands.keys()].sort().join(', ')}`);

  for (const event of await loadEvents()) {
    const handler = (...args: unknown[]): void => {
      try {
        const result = (event.execute as (...params: unknown[]) => Promise<void> | void)(...args);
        Promise.resolve(result).catch((error: unknown) => {
          console.error(`[bot] ошибка в событии ${String(event.name)}:`, error);
        });
      } catch (error) {
        console.error(`[bot] ошибка в событии ${String(event.name)}:`, error);
      }
    };

    if (event.once) {
      client.once(event.name as keyof ClientEvents, handler as never);
    } else {
      client.on(event.name as keyof ClientEvents, handler as never);
    }
  }
  console.log('[bot] события загружены');

  await client.login(config.token);
  return client;
}
