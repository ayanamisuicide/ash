import type { Server } from 'node:http';
import { assertConfig, config } from './config.js';
import { startBot } from './bot.js';
import { stopScheduler } from './lib/scheduler.js';
import { closeDatabase, startDatabaseBackups, stopDatabaseBackups } from './storage/sqlite.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

/** Закрывает HTTP-сервер панели, не блокируя выход дольше таймаута */
async function closeHttpServer(server: Server | null): Promise<void> {
  if (!server) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
    timer.unref?.();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections?.();
  });
}

async function main(): Promise<void> {
  assertConfig();

  console.log(
    `[bot] старт: PID ${process.pid}, Node ${process.version}, ${process.platform}, аптайм процесса ${Math.floor(process.uptime())} с`,
  );

  process.on('unhandledRejection', (reason) => {
    console.error('[bot] необработанный rejected промис:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[bot] необработанное исключение:', error);
  });

  const client = await startBot();
  startDatabaseBackups();

  let webServer: Server | null = null;
  if (config.web.enabled) {
    const { startWebPanel } = await import('./web/server.js');
    webServer = await startWebPanel(client, config.web.port, config.web.host);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[bot] получен ${signal}, останавливаюсь...`);

    stopScheduler();
    stopDatabaseBackups();
    await closeHttpServer(webServer);

    try {
      await client.destroy();
    } catch (error) {
      console.error('[bot] не удалось корректно закрыть клиент:', error);
    }

    closeDatabase();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main().catch((error: unknown) => {
  console.error('[bot] фатальная ошибка запуска:', error);
  stopScheduler();
  stopDatabaseBackups();
  closeDatabase();
  process.exit(1);
});
