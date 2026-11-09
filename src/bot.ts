import { Events, type ClientEvents } from 'discord.js';
import { config } from './config.js';
import { BotClient } from './core/client.js';
import { loadCommands, loadEvents } from './core/loader.js';

/**
 * Загружает команды и события, подключается к Discord.
 * Возвращает готовый клиент (используется веб-панелью).
 */
export interface BotStartHooks {
  /** Вызывается после загрузки команд и событий, до входа в Discord */
  onLoaded?: (info: { commands: number; events: number }) => void;
  /** Вызывается перед повтором входа после сетевой ошибки */
  onRetry?: (info: { attempt: number; delayMs: number; error: string }) => void;
}

const LOGIN_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

function isFatalLoginError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('invalid token') ||
    message.includes('tokeninvalid') ||
    message.includes('disallowed intents') ||
    message.includes('used disallowed intents')
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Вход с повторами: 522/502 и обрывы сети не должны оставлять бота выключенным */
async function loginWithRetry(client: BotClient, hooks: BotStartHooks): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.login(config.token);
      return;
    } catch (error) {
      const delay = LOGIN_RETRY_DELAYS_MS[attempt - 1];
      if (isFatalLoginError(error) || delay === undefined) throw error;

      hooks.onRetry?.({ attempt, delayMs: delay, error: describeError(error) });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function startBot(hooks: BotStartHooks = {}): Promise<BotClient> {
  const client = new BotClient();

  // Без этих обработчиков сбой websocket либо молча роняет процесс,
  // либо оставляет бота «онлайн», но не отвечающим на команды.
  client.on(Events.Error, (error) => {
    console.error('[bot] ошибка Discord-клиента:', error);
  });
  client.on(Events.Warn, (message) => {
    console.warn('[bot] предупреждение Discord:', message);
  });
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(
      `[bot] шард ${shardId} отключён (код ${event.code}${event.reason ? `, ${event.reason}` : ''}) — переподключаемся`,
    );
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    console.warn(`[bot] шард ${shardId} переподключается`);
  });

  for (const command of await loadCommands()) {
    client.commands.set(command.data.name, command);
  }

  const events = await loadEvents();
  for (const event of events) {
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

  hooks.onLoaded?.({ commands: client.commands.size, events: events.length });

  await loginWithRetry(client, hooks);
  return client;
}
