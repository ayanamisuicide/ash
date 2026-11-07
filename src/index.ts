import { assertConfig, config } from './config.js';
import { startBot } from './bot.js';
import { stopScheduler } from './lib/scheduler.js';
import { closeDatabase, startDatabaseBackups, stopDatabaseBackups } from './storage/sqlite.js';

async function main(): Promise<void> {
  assertConfig();

  const client = await startBot();
  startDatabaseBackups();

  // Заготовка под веб-панель: включается через WEB_ENABLED=true
  if (config.web.enabled) {
    const { startWebPanel } = await import('./web/server.js');
    await startWebPanel(client, config.web.port, config.web.host);
  }

  const shutdown = (signal: string): void => {
    console.log(`[bot] получен ${signal}, закрываю базу и выхожу...`);
    stopScheduler();
    stopDatabaseBackups();
    closeDatabase();
    void client.destroy();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(signal));
  }
}

main().catch((error: unknown) => {
  console.error('[bot] фатальная ошибка запуска:', error);
  stopScheduler();
  stopDatabaseBackups();
  closeDatabase();
  process.exit(1);
});
