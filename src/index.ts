import type { Server } from 'node:http';
import { assertConfig, config } from './config.js';
import { startBot } from './bot.js';
import type { BotClient } from './core/client.js';
import { createConsoleUi } from './lib/console-ui.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';
import { runStartupChecks } from './lib/startup.js';
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
  const ui = createConsoleUi();
  await ui.banner();

  assertConfig();
  ui.ok(
    'Конфигурация проверена',
    config.web.enabled ? `веб-панель ${config.web.publicUrl}` : 'веб-панель выключена',
  );

  process.on('unhandledRejection', (reason) => {
    console.error('[bot] необработанный rejected промис:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[bot] необработанное исключение:', error);
  });

  const login = ui.spinner('Подключаюсь к Discord');
  let client: BotClient;
  try {
    client = await startBot({
      onLoaded: ({ commands, events }) =>
        login.update(`Подключаюсь к Discord · команд: ${commands}, событий: ${events}`),
      onRetry: ({ attempt, delayMs, error }) =>
        login.update(
          `Подключаюсь к Discord · повтор ${attempt} через ${Math.round(delayMs / 1_000)} с (${error})`,
        ),
    });
  } catch (error) {
    login.fail('не удалось подключиться к Discord');
    throw error;
  }
  login.succeed(`вошёл как ${client.user?.tag ?? '?'} · серверов: ${client.guilds.cache.size}`);

  startScheduler(client);
  ui.ok('Планировщик наказаний', 'запущен');

  startDatabaseBackups();
  ui.ok('Авто-бэкап БД', 'запущен');

  let webServer: Server | null = null;
  let localPanel: string | null = null;
  if (config.web.enabled) {
    const panelStep = ui.spinner('Запускаю веб-панель');
    try {
      const { startWebPanel, listeningPort } = await import('./web/server.js');
      webServer = await startWebPanel(client, config.web.port, config.web.host);
      const port = listeningPort(webServer, config.web.port);
      localPanel = `http://${config.web.host}:${port}`;
      panelStep.succeed(config.web.publicUrl);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      panelStep.fail(
        code === 'EADDRINUSE'
          ? `порт ${config.web.port} занят — укажите другой WEB_PORT`
          : 'не удалось запустить веб-панель',
      );
      throw error;
    }
  }

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    ui.info('Остановка', signal);

    stopScheduler();
    stopDatabaseBackups();
    await closeHttpServer(webServer);

    try {
      await client.destroy();
    } catch (error) {
      console.error('[bot] не удалось корректно закрыть клиент:', error);
    }

    closeDatabase();
    process.exit(exitCode);
  };

  if (!config.startup.disabled) {
    const checks = ui.spinner('Проверяю окружение, БД и права бота');
    let report: Awaited<ReturnType<typeof runStartupChecks>>;
    try {
      report = await runStartupChecks(client, (check) => {
        checks.update(`Проверяю: ${check.name}`);
      });
    } catch (error) {
      checks.fail('проверки не удалось выполнить');
      throw error;
    }
    checks.stop();
    ui.blank();
    await ui.revealReport(report);

    if (!report.ok && config.startup.strict) {
      ui.error('STARTUP_STRICT=true — останавливаюсь из-за ошибок проверок.');
      await shutdown('STARTUP_STRICT', 1);
      return;
    }
    if (!report.ok) {
      ui.warn('STARTUP_STRICT=false — продолжаю работу, несмотря на ошибки.');
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  ui.finish({
    guilds: client.guilds.cache.size,
    commands: client.commands.size,
    panel: config.web.enabled ? config.web.publicUrl : null,
    local: localPanel,
  });
}

main().catch((error: unknown) => {
  console.error('[bot] фатальная ошибка запуска:', error);
  stopScheduler();
  stopDatabaseBackups();
  closeDatabase();
  process.exit(1);
});
