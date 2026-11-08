import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import type { BotClient } from '../core/client.js';
import { handleApi } from './api.js';
import { buildAuthorizeUrl, exchangeCode, fetchCurrentUser } from './discord.js';
import { pruneAccessCache } from './auth.js';
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

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml' },
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
  const entry = STATIC_FILES[pathname];
  if (!entry) return false;

  try {
    const content = await fs.readFile(path.join(PUBLIC_DIR, entry.file));
    res.statusCode = 200;
    res.setHeader('Content-Type', entry.type);
    res.setHeader('Content-Length', content.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : content);
    return true;
  } catch (error) {
    console.error(`[web] не удалось прочитать ${entry.file}:`, error);
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

        if (method === 'GET' || method === 'HEAD') {
          if (await serveStatic(req, res, url.pathname)) return;
        }

        if (url.pathname === '/health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (method === 'GET') {
          redirect(res, '/');
          return;
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

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`[web] панель модератора: ${config.web.publicUrl} (слушает ${host}:${actualPort})`);
  if (!config.web.publicUrl.startsWith('https://') && host !== '127.0.0.1') {
    console.warn('[web] панель доступна по HTTP. Для публичного доступа настройте HTTPS-прокси.');
  }
  return server;
}
