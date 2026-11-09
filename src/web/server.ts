import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { config } from '../config.js';
import type { BotClient } from '../core/client.js';
import { handleApi } from './api.js';
import { buildAuthorizeUrl, exchangeCode, fetchCurrentUser } from './discord.js';
import { pruneAccessCache } from './auth.js';
import { resolvePanelDir } from './panelDir.js';
import {
  HttpError,
  RateLimiter,
  appendCookie,
  assertSameOrigin,
  clearCookie,
  getClientIp,
  parseCookies,
  securityHeaders,
  sendError,
  serializeCookie,
} from './http.js';
import { SessionStore } from './sessions.js';

const PANEL_DIR = resolvePanelDir();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const SESSION_COOKIE = 'pp_sid';
const STATE_COOKIE = 'pp_oauth_state';

function redirect(res: http.ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.resolve(PANEL_DIR, relative);

  // Защита от path traversal: отдаём только файлы внутри каталога панели.
  if (filePath !== PANEL_DIR && !filePath.startsWith(PANEL_DIR + path.sep)) return false;

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;

    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const immutable = relative.startsWith('assets/');

    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[extension] ?? 'application/octet-stream');
    res.setHeader('Content-Length', content.length);
    res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : content);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return false;

    console.error(`[web] не удалось прочитать ${relative}:`, error);
    sendError(res, 500, 'Файл панели не найден.');
    return true;
  }
}

function cookieSecure(): boolean {
  return config.web.secureCookies;
}

function sessionTtlMs(): number {
  return config.web.sessionHours * 3_600_000;
}

export async function startWebPanel(
  client: BotClient,
  port: number,
  host = '127.0.0.1',
): Promise<http.Server> {
  const sessions = new SessionStore(sessionTtlMs());
  const apiLimiter = new RateLimiter(180, 60_000);
  const authLimiter = new RateLimiter(30, 60_000);

  const pruneTimer = setInterval(() => {
    sessions.prune();
    apiLimiter.prune();
    authLimiter.prune();
    pruneAccessCache();
  }, 5 * 60_000);
  pruneTimer.unref?.();

  const server = http.createServer((req, res) => {
    void (async () => {
      securityHeaders(res);

      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', config.web.publicUrl);
      const cookies = parseCookies(req.headers.cookie);
      const session = sessions.get(cookies[SESSION_COOKIE]);

      try {
        assertSameOrigin(req, config.web.publicUrl);

        if (url.pathname === '/auth/login' && method === 'GET') {
          const ip = getClientIp(req, config.web.trustProxy);
          if (!authLimiter.check(`login:${ip}`)) {
            sendError(res, 429, 'Слишком много попыток входа. Попробуйте позже.');
            return;
          }

          const state = crypto.randomBytes(24).toString('base64url');
          appendCookie(
            res,
            serializeCookie(STATE_COOKIE, state, {
              path: '/auth',
              maxAge: 600,
              secure: cookieSecure(),
            }),
          );
          redirect(res, buildAuthorizeUrl(state));
          return;
        }

        if (url.pathname === '/auth/callback' && method === 'GET') {
          const ip = getClientIp(req, config.web.trustProxy);
          if (!authLimiter.check(`callback:${ip}`)) {
            redirect(res, '/?error=rate');
            return;
          }

          const state = url.searchParams.get('state');
          const code = url.searchParams.get('code');
          const expectedState = cookies[STATE_COOKIE];
          clearCookie(res, STATE_COOKIE, cookieSecure(), '/auth');

          if (!state || !expectedState || state !== expectedState) {
            redirect(res, '/?error=state');
            return;
          }
          if (!code) {
            redirect(res, '/?error=oauth');
            return;
          }

          try {
            const accessToken = await exchangeCode(code);
            const user = await fetchCurrentUser(accessToken);
            const created = sessions.create(user);
            appendCookie(
              res,
              serializeCookie(SESSION_COOKIE, created.id, {
                maxAge: Math.floor(sessionTtlMs() / 1_000),
                secure: cookieSecure(),
                sameSite: 'Lax',
              }),
            );
            redirect(res, '/');
          } catch (error) {
            console.error('[web] ошибка OAuth2:', error);
            redirect(res, '/?error=oauth');
          }
          return;
        }

        if (url.pathname.startsWith('/api/')) {
          if (method !== 'GET' && method !== 'HEAD') {
            const ip = getClientIp(req, config.web.trustProxy);
            if (!apiLimiter.check(`api:${session?.user.id ?? ip}`)) {
              sendError(res, 429, 'Слишком много запросов. Подождите минуту.');
              return;
            }
          }

          await handleApi({
            req,
            res,
            url,
            client,
            session,
            sessions,
            secureCookies: cookieSecure(),
          });
          return;
        }

        if (url.pathname === '/health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (method === 'GET' || method === 'HEAD') {
          if (await serveStatic(req, res, url.pathname)) return;

          // SPA-fallback только для путей без расширения. Отсутствующий
          // /assets/*.js должен вернуть 404, а не HTML с MIME-ошибкой.
          if (
            method === 'GET' &&
            !url.pathname.startsWith('/assets/') &&
            !path.extname(url.pathname)
          ) {
            if (await serveStatic(req, res, '/')) return;
          }
        }

        sendError(res, 404, 'Не найдено.');
      } catch (error) {
        if (error instanceof HttpError) {
          sendError(res, error.status, error.message);
          return;
        }
        console.error('[web] необработанная ошибка:', error);
        if (!res.headersSent) sendError(res, 500, 'Внутренняя ошибка сервера.');
        else res.end();
      }
    })();
  });

  server.on('close', () => clearInterval(pruneTimer));

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
  console.log(`[web] статика панели: ${PANEL_DIR}`);
  if (!fsSync.existsSync(path.join(PANEL_DIR, 'assets'))) {
    console.warn(
      '[web] React-сборка не найдена — отдаётся legacy-панель. Выполните `npm run build`.',
    );
  }
  if (!config.web.publicUrl.startsWith('https://') && host !== '127.0.0.1') {
    console.warn('[web] панель доступна по HTTP. Для публичного доступа настройте HTTPS-прокси.');
  }
  return server;
}

/** Фактический порт, который слушает панель (может отличаться при port: 0) */
export function listeningPort(server: http.Server, fallback: number): number {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : fallback;
}
