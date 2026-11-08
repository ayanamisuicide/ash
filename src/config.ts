import 'dotenv/config';

const webPort = Number(process.env.WEB_PORT ?? 3000) || 3000;
const webHost = process.env.WEB_HOST?.trim() || '127.0.0.1';
const webPublicUrl = (process.env.WEB_PUBLIC_URL?.trim() || `http://127.0.0.1:${webPort}`).replace(
  /\/+$/,
  '',
);
const webSessionHours = Number(process.env.WEB_SESSION_HOURS ?? 168);
const webSecureCookies =
  process.env.WEB_SECURE_COOKIES === 'true' ||
  (process.env.WEB_SECURE_COOKIES !== 'false' && webPublicUrl.startsWith('https://'));

/**
 * Централизованная конфигурация.
 * Все значения читаются из .env, см. .env.example
 */
export const config = {
  /** Токен бота из Discord Developer Portal */
  token: process.env.DISCORD_TOKEN?.trim() ?? '',

  /** Application ID (нужен для регистрации слэш-команд) */
  clientId: process.env.DISCORD_CLIENT_ID?.trim() ?? '',

  /** Если задан — команды регистрируются мгновенно только на этом сервере */
  guildId: process.env.GUILD_ID?.trim() || null,

  /** Веб-панель модератора (Discord OAuth2 + REST API + SPA) */
  web: {
    enabled: process.env.WEB_ENABLED === 'true',
    port: webPort,
    host: webHost,
    publicUrl: webPublicUrl,
    oauthRedirectUrl: `${webPublicUrl}/auth/callback`,
    clientSecret: process.env.DISCORD_CLIENT_SECRET?.trim() ?? '',
    sessionHours:
      Number.isFinite(webSessionHours) && webSessionHours > 0 && webSessionHours <= 720
        ? Math.floor(webSessionHours)
        : 168,
    secureCookies: webSecureCookies,
    trustProxy: process.env.WEB_TRUST_PROXY === 'true',
  },
} as const;

/** Проверяет обязательные переменные окружения и завершает процесс при ошибке */
export function assertConfig(): void {
  if (!config.token) {
    console.error('[config] Не задан DISCORD_TOKEN. Заполните .env (см. .env.example).');
    process.exit(1);
  }

  if (config.web.enabled) {
    if (!config.clientId) {
      console.error('[config] Для веб-панели задайте DISCORD_CLIENT_ID.');
      process.exit(1);
    }
    if (!config.web.clientSecret) {
      console.error('[config] Для веб-панели задайте DISCORD_CLIENT_SECRET.');
      process.exit(1);
    }
    if (!config.web.publicUrl.startsWith('http')) {
      console.error('[config] WEB_PUBLIC_URL должен начинаться с http:// или https://');
      process.exit(1);
    }
    try {
      const parsed = new URL(config.web.publicUrl);
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        console.error(
          '[config] WEB_PUBLIC_URL должен быть адресом без пути (например https://bot.example.com).',
        );
        process.exit(1);
      }
    } catch {
      console.error('[config] WEB_PUBLIC_URL не является корректным URL.');
      process.exit(1);
    }
    if (config.web.host !== '127.0.0.1' && config.web.host !== 'localhost') {
      console.warn(
        '[config] Веб-панель слушает не loopback-адрес. В продакшене используйте HTTPS-прокси ' +
          '(nginx/Caddy) и WEB_SECURE_COOKIES=true.',
      );
    }
  }
}
