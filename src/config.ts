import 'dotenv/config';

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

  /** Заготовка под будущую веб-панель */
  web: {
    enabled: process.env.WEB_ENABLED === 'true',
    port: Number(process.env.WEB_PORT ?? 3000) || 3000,
    host: process.env.WEB_HOST?.trim() || '127.0.0.1',
  },
} as const;

/** Проверяет обязательные переменные окружения и завершает процесс при ошибке */
export function assertConfig(): void {
  if (!config.token) {
    console.error('[config] Не задан DISCORD_TOKEN. Заполните .env (см. .env.example).');
    process.exit(1);
  }
}
