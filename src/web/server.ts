import http from 'node:http';
import type { BotClient } from '../core/client.js';

/**
 * ЗАГОТОВКА ВЕБ-ПАНЕЛИ.
 *
 * Сейчас — минимальный HTTP-сервер со статусом бота.
 * Позже здесь появится Express/Fastify, авторизация через Discord OAuth2,
 * REST API для настроек сервера и фронтенд.
 *
 * Запуск: WEB_ENABLED=true в .env
 */
export async function startWebPanel(
  client: BotClient,
  port: number,
  host = '127.0.0.1',
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          bot: client.user?.tag ?? null,
          guilds: client.guilds.cache.size,
          ping: Math.round(client.ws.ping),
          uptime: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<h1>Веб-панель ещё не готова</h1><p>Статус бота: <a href="/api/status">/api/status</a></p>',
    );
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  console.log(`[web] заготовка панели слушает http://${host}:${port}`);
  return server;
}
