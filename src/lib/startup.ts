import fs from 'node:fs';
import path from 'node:path';
import { GatewayIntentBits, PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import { config } from '../config.js';
import type { BotClient } from '../core/client.js';
import { resolvePanelDir } from '../web/panelDir.js';
import { BACKUP_DIR, DB_FILE, db } from '../storage/sqlite.js';
import { getLogChannel } from './logger.js';
import { getModerationSettings } from './modSettings.js';
import { findMuteRole } from './moderation/timeouts.js';
import { isSchedulerRunning } from './scheduler.js';
import {
  findMappingForUrl,
  proxyPort,
  readServeConfig,
  readTailscaleStatus,
  tailnetUrl,
} from './tailscale.js';

/** Минимальная поддерживаемая версия Node.js (встроенный node:sqlite) */
export const MIN_NODE_VERSION = '22.13.0';

/** Кэш авто-бэкапов считается протухшим, если старше этого времени */
const BACKUP_STALE_MS = 7 * 24 * 3_600_000;

const SNOWFLAKE = /^\d{17,20}$/;

export type CheckStatus = 'ok' | 'info' | 'warn' | 'error';

export interface StartupCheck {
  /** Раздел отчёта, например «Окружение» или «Сервер: Название» */
  group: string;
  /** Что именно проверяли */
  name: string;
  status: CheckStatus;
  /** Подробности: значения, подсказки, список проблем */
  detail: string;
}

export interface StartupReport {
  checks: StartupCheck[];
  warnings: number;
  errors: number;
  /** true, если нет ни одной ошибки (warn не блокирует) */
  ok: boolean;
}

/** Наблюдатель получает каждую проверку сразу после её выполнения */
export type StartupCheckListener = (check: StartupCheck) => void;

export interface PermissionRequirement {
  bit: bigint;
  label: string;
  /** Без этого права бот не сможет отвечать на команды */
  critical?: boolean;
}

/** Права, без которых модерация работает частично */
export const REQUIRED_BOT_PERMISSIONS: PermissionRequirement[] = [
  { bit: PermissionFlagsBits.ViewChannel, label: 'Просмотр каналов', critical: true },
  { bit: PermissionFlagsBits.SendMessages, label: 'Отправка сообщений', critical: true },
  { bit: PermissionFlagsBits.EmbedLinks, label: 'Встраивание ссылок', critical: true },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: 'История сообщений', critical: true },
  { bit: PermissionFlagsBits.ManageMessages, label: 'Управление сообщениями' },
  { bit: PermissionFlagsBits.ManageRoles, label: 'Управление ролями' },
  { bit: PermissionFlagsBits.ManageChannels, label: 'Управление каналами' },
  { bit: PermissionFlagsBits.ManageNicknames, label: 'Управление никнеймами' },
  { bit: PermissionFlagsBits.KickMembers, label: 'Кик участников' },
  { bit: PermissionFlagsBits.BanMembers, label: 'Бан участников' },
  { bit: PermissionFlagsBits.ModerateMembers, label: 'Таймауты участников' },
  { bit: PermissionFlagsBits.ViewAuditLog, label: 'Журнал аудита' },
];

/** Права для отдельных функций: без них бот запустится, но часть возможностей отключится */
export const RECOMMENDED_BOT_PERMISSIONS: PermissionRequirement[] = [
  { bit: PermissionFlagsBits.AttachFiles, label: 'Прикрепление файлов' },
  { bit: PermissionFlagsBits.AddReactions, label: 'Добавление реакций' },
  { bit: PermissionFlagsBits.ManageWebhooks, label: 'Управление вебхуками' },
  { bit: PermissionFlagsBits.Connect, label: 'Подключение к голосовым каналам' },
  { bit: PermissionFlagsBits.Speak, label: 'Разговор в голосовых каналах' },
  { bit: PermissionFlagsBits.MoveMembers, label: 'Перемещение участников в голосе' },
  { bit: PermissionFlagsBits.MuteMembers, label: 'Мут в голосовых каналах' },
  { bit: PermissionFlagsBits.DeafenMembers, label: 'Заглушение в голосовых каналах' },
];

const INTENT_REQUIREMENTS: Array<[GatewayIntentBits, string]> = [
  [GatewayIntentBits.Guilds, 'Guilds'],
  [GatewayIntentBits.GuildMembers, 'GuildMembers (привилегированный)'],
  [GatewayIntentBits.GuildModeration, 'GuildModeration'],
];

const INTENT_RECOMMENDED: Array<[GatewayIntentBits, string]> = [
  [GatewayIntentBits.MessageContent, 'MessageContent (привилегированный: автомод, уровни)'],
  [GatewayIntentBits.GuildMessageReactions, 'GuildMessageReactions (реакции-роли)'],
  [GatewayIntentBits.GuildVoiceStates, 'GuildVoiceStates (временные каналы)'],
];

const STATUS_MARK: Record<CheckStatus, string> = {
  ok: '✅',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

/** Разбирает версию вида v22.13.1 в массив чисел */
function versionParts(value: string): number[] {
  const parts = value
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

/** Сравнивает две версии: <0, 0 или >0 */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < 3; index += 1) {
    const one = left[index] ?? 0;
    const other = right[index] ?? 0;
    if (one !== other) return one > other ? 1 : -1;
  }
  return 0;
}

/** Проверяет, что версия Node.js поддерживает node:sqlite */
export function isSupportedNodeVersion(
  version = process.version,
  minimum = MIN_NODE_VERSION,
): boolean {
  return compareVersions(version, minimum) >= 0;
}

/** Возвращает отсутствующие права из списка */
export function findMissingPermissions(
  has: (bit: bigint) => boolean,
  requirements: PermissionRequirement[] = REQUIRED_BOT_PERMISSIONS,
): PermissionRequirement[] {
  return requirements.filter((requirement) => !has(requirement.bit));
}

/** Собирает отчёт и считает итоги */
export function buildReport(checks: StartupCheck[]): StartupReport {
  const warnings = checks.filter((check) => check.status === 'warn').length;
  const errors = checks.filter((check) => check.status === 'error').length;
  return { checks, warnings, errors, ok: errors === 0 };
}

/** Формирует читаемый многострочный отчёт для консоли */
export function formatStartupReport(report: StartupReport): string {
  const groups = new Map<string, StartupCheck[]>();
  for (const check of report.checks) {
    const list = groups.get(check.group) ?? [];
    list.push(check);
    groups.set(check.group, list);
  }

  const lines = ['[startup] проверка окружения, БД, панели и прав бота'];
  for (const [group, checks] of groups) {
    lines.push(`  ${group}`);
    for (const check of checks) {
      const detail = check.detail ? ` — ${check.detail}` : '';
      lines.push(`    ${STATUS_MARK[check.status]} ${check.name}${detail}`);
    }
  }

  const okCount = report.checks.filter((check) => check.status === 'ok').length;
  const infoCount = report.checks.filter((check) => check.status === 'info').length;
  lines.push(
    `[startup] итог: ✅ ${okCount}, ℹ️ ${infoCount}, ⚠️ ${report.warnings}, ❌ ${report.errors}`,
  );
  lines.push(
    report.ok
      ? '[startup] критичных ошибок не найдено.'
      : '[startup] есть ошибки — исправьте пункты с ❌.',
  );
  return lines.join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`таймаут ${ms} мс: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

/**
 * Полная проверка при старте: версия Node.js, конфигурация, целостность БД,
 * бэкапы, веб-панель, зарегистрированные команды и права бота на каждом сервере.
 * Никогда не бросает исключение — любая проблема попадает в отчёт.
 */
export async function runStartupChecks(
  client: BotClient,
  onCheck?: StartupCheckListener,
): Promise<StartupReport> {
  const checks: StartupCheck[] = [];
  const record = (group: string, name: string, status: CheckStatus, detail = ''): void => {
    const check: StartupCheck = { group, name, status, detail };
    checks.push(check);
    try {
      onCheck?.(check);
    } catch {
      // наблюдатель не должен ломать проверки
    }
  };
  const guard = async (
    group: string,
    name: string,
    check: () => void | Promise<void>,
  ): Promise<void> => {
    try {
      await check();
    } catch (error) {
      record(group, name, 'error', `проверка не удалась: ${errorMessage(error)}`);
    }
  };

  // ------------------------------------------------------------------ окружение
  const envGroup = 'Окружение';
  await guard(envGroup, 'Node.js', () => {
    const supported = isSupportedNodeVersion();
    record(
      envGroup,
      'Node.js',
      supported ? 'ok' : 'error',
      `${process.version} (требуется ≥ ${MIN_NODE_VERSION})`,
    );
  });
  record(
    envGroup,
    'Платформа',
    'info',
    `${process.platform}/${process.arch}, PID ${process.pid}, память ${formatBytes(process.memoryUsage().rss)}`,
  );
  await guard(envGroup, 'Intents', () => {
    const intents = client.options.intents;
    const missing = INTENT_REQUIREMENTS.filter(([bit]) => !intents.has(bit));
    const absentRecommended = INTENT_RECOMMENDED.filter(([bit]) => !intents.has(bit));
    if (missing.length) {
      record(envGroup, 'Intents', 'error', `не включены: ${missing.map(([, n]) => n).join(', ')}`);
    } else {
      record(
        envGroup,
        'Intents',
        absentRecommended.length ? 'warn' : 'ok',
        absentRecommended.length
          ? `нет: ${absentRecommended.map(([, n]) => n).join(', ')}`
          : 'все необходимые подключены',
      );
    }
  });
  await guard(envGroup, 'Готовность клиента', () => {
    if (!client.user) {
      record(envGroup, 'Готовность клиента', 'error', 'client.user недоступен');
      return;
    }
    record(
      envGroup,
      'Готовность клиента',
      'ok',
      `${client.user.tag} · серверов: ${client.guilds.cache.size} · пинг ${Math.round(client.ws.ping)} мс`,
    );
  });

  // ------------------------------------------------------------- конфигурация
  const configGroup = 'Конфигурация';
  await guard(configGroup, 'DISCORD_TOKEN', () => {
    record(
      configGroup,
      'DISCORD_TOKEN',
      config.token ? 'ok' : 'error',
      config.token ? 'задан' : 'не задан',
    );
  });
  await guard(configGroup, 'DISCORD_CLIENT_ID', () => {
    if (!config.clientId) {
      record(configGroup, 'DISCORD_CLIENT_ID', 'warn', 'не задан — /deploy не сработает');
      return;
    }
    if (!SNOWFLAKE.test(config.clientId)) {
      record(configGroup, 'DISCORD_CLIENT_ID', 'warn', 'не похож на ID приложения');
      return;
    }
    const actual = client.application?.id;
    if (actual && actual !== config.clientId) {
      record(
        configGroup,
        'DISCORD_CLIENT_ID',
        'error',
        `не совпадает с приложением токена (${config.clientId} ≠ ${actual})`,
      );
      return;
    }
    record(configGroup, 'DISCORD_CLIENT_ID', 'ok', config.clientId);
  });
  record(
    configGroup,
    'GUILD_ID',
    config.guildId ? (SNOWFLAKE.test(config.guildId) ? 'ok' : 'warn') : 'info',
    config.guildId
      ? SNOWFLAKE.test(config.guildId)
        ? `${config.guildId} — команды регистрируются на сервере`
        : 'некорректный формат — будет глобальная регистрация'
      : 'не задан — команды регистрируются глобально (до 1 часа)',
  );
  record(
    configGroup,
    'Планировщик',
    isSchedulerRunning() ? 'ok' : 'warn',
    isSchedulerRunning() ? 'запущен' : 'не запущен — истечения наказаний не сработают',
  );

  // ------------------------------------------------------------------ база данных
  const dbGroup = 'База данных';
  await guard(dbGroup, 'SQLite', () => {
    const row = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    const result = row?.quick_check ?? 'нет ответа';
    record(dbGroup, 'SQLite', result === 'ok' ? 'ok' : 'error', `${result} · файл ${DB_FILE}`);
  });
  await guard(dbGroup, 'Схема', () => {
    const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    const version = Number(row?.user_version ?? 0);
    record(
      dbGroup,
      'Схема',
      version > 0 ? 'ok' : 'error',
      version > 0 ? `версия ${version}` : 'миграции не применены',
    );
  });
  await guard(dbGroup, 'Файл БД', () => {
    const stats = fs.statSync(DB_FILE);
    record(dbGroup, 'Файл БД', 'ok', `${formatBytes(stats.size)} · ${DB_FILE}`);
  });
  await guard(dbGroup, 'Запись в каталог данных', () => {
    const probe = path.join(path.dirname(DB_FILE), `.startup-probe-${process.pid}`);
    try {
      fs.writeFileSync(probe, 'ok');
      record(dbGroup, 'Запись в каталог данных', 'ok', path.dirname(DB_FILE));
    } finally {
      fs.rmSync(probe, { force: true });
    }
  });
  await guard(dbGroup, 'Бэкапы', () => {
    if (!BACKUP_DIR) {
      record(dbGroup, 'Бэкапы', 'info', 'каталог бэкапов не настроен');
      return;
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      record(dbGroup, 'Бэкапы', 'warn', `каталога ${BACKUP_DIR} ещё нет`);
      return;
    }
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.startsWith('bot-') && name.endsWith('.sqlite'))
      .sort();
    const latest = files.at(-1);
    if (!latest) {
      record(dbGroup, 'Бэкапы', 'info', 'бэкапов пока нет');
      return;
    }
    const stats = fs.statSync(path.join(BACKUP_DIR, latest));
    const age = Date.now() - stats.mtimeMs;
    record(
      dbGroup,
      'Бэкапы',
      age > BACKUP_STALE_MS ? 'warn' : 'ok',
      `последний ${latest} (${formatBytes(stats.size)}, ${Math.floor(age / 3_600_000)} ч назад)`,
    );
  });

  // ----------------------------------------------------------------- веб-панель
  const webGroup = 'Веб-панель';
  if (!config.web.enabled) {
    record(webGroup, 'Статус', 'info', 'выключена (WEB_ENABLED=true, чтобы включить)');
  } else {
    await guard(webGroup, 'Публичный адрес', () => {
      const https = config.web.publicUrl.startsWith('https://');
      record(
        webGroup,
        'Публичный адрес',
        https ? 'ok' : 'warn',
        `${config.web.publicUrl}${https ? '' : ' — для публичного доступа нужен HTTPS'}`,
      );
    });
    record(
      webGroup,
      'OAuth2 redirect',
      'info',
      `${config.web.oauthRedirectUrl} (добавьте в Developer Portal → OAuth2 → Redirects)`,
    );
    await guard(webGroup, 'Cookies', () => {
      const https = config.web.publicUrl.startsWith('https://');
      if (https && !config.web.secureCookies) {
        record(webGroup, 'Cookies', 'warn', 'https без Secure-куки');
        return;
      }
      if (!https && config.web.secureCookies) {
        record(webGroup, 'Cookies', 'error', 'Secure-куки при http:// — вход не сработает');
        return;
      }
      record(
        webGroup,
        'Cookies',
        'ok',
        `HttpOnly, SameSite=Lax${config.web.secureCookies ? ', Secure' : ''}`,
      );
    });
    await guard(webGroup, 'Привязка', () => {
      const loopback = config.web.host === '127.0.0.1' || config.web.host === 'localhost';
      record(
        webGroup,
        'Привязка',
        loopback ? 'ok' : 'warn',
        `${config.web.host}:${config.web.port}${loopback ? '' : ' — наружу только через HTTPS-прокси'}`,
      );
    });
    await guard(webGroup, 'Статика', () => {
      const dir = resolvePanelDir();
      const file = path.join(dir, 'index.html');
      const hasReact = fs.existsSync(path.join(dir, 'assets'));
      record(
        webGroup,
        'Статика',
        fs.existsSync(file) ? 'ok' : 'error',
        fs.existsSync(file)
          ? `${dir}${hasReact ? '' : ' (legacy)'}`
          : `нет ${file} — выполните npm run build`,
      );
    });
    await guard(webGroup, 'Доступность', async () => {
      // 0.0.0.0/:: слушают все интерфейсы, но не всегда принимают запросы
      // на такой адрес — для локальной проверки используем loopback.
      const probeHost =
        config.web.host === '0.0.0.0' || config.web.host === '::' ? '127.0.0.1' : config.web.host;
      const localHealth = `http://${probeHost}:${config.web.port}/health`;

      // Сначала проверяем сам HTTP-сервер. Внешний Tailscale/Funnel может быть
      // недоступен несколько секунд после старта — это не должно считаться
      // критичной ошибкой запуска бота.
      let localStatus: number;
      try {
        const response = await withTimeout(
          fetch(localHealth, { signal: AbortSignal.timeout(3_000) }),
          4_000,
          'GET local /health',
        );
        localStatus = response.status;
      } catch (error) {
        record(
          webGroup,
          'Доступность',
          'error',
          `локальный ${localHealth} недоступен: ${errorMessage(error)}`,
        );
        return;
      }

      if (!localStatus || localStatus < 200 || localStatus >= 300) {
        record(webGroup, 'Доступность', 'warn', `локальный GET /health → ${localStatus}`);
        return;
      }

      const publicHealth = `${config.web.publicUrl}/health`;
      try {
        const response = await withTimeout(
          fetch(publicHealth, { signal: AbortSignal.timeout(3_000) }),
          4_000,
          'GET public /health',
        );
        record(
          webGroup,
          'Доступность',
          response.ok ? 'ok' : 'warn',
          response.ok
            ? 'локально 200 · публично 200'
            : `локально 200 · публично ${response.status}`,
        );
      } catch (error) {
        record(
          webGroup,
          'Доступность',
          'warn',
          `локально 200 · публично недоступно (${errorMessage(error)})`,
        );
      }
    });
  }

  // -------------------------------------------------------------------- команды
  const commandsGroup = 'Команды';
  await guard(commandsGroup, 'Загрузка', () => {
    const count = client.commands.size;
    record(
      commandsGroup,
      'Загрузка',
      count > 0 ? 'ok' : 'error',
      count > 0 ? `${count} команд` : 'не загружено ни одной команды',
    );
  });
  await guard(commandsGroup, 'Регистрация в Discord', async () => {
    if (!client.application) {
      record(commandsGroup, 'Регистрация в Discord', 'warn', 'приложение ещё не готово');
      return;
    }

    const guild = config.guildId ? client.guilds.cache.get(config.guildId) : null;
    const target = guild ? guild.commands : client.application.commands;
    let fetched;
    try {
      fetched = await withTimeout(target.fetch({}), 15_000, 'commands.fetch');
    } catch (error) {
      record(
        commandsGroup,
        'Регистрация в Discord',
        'warn',
        `не удалось получить список команд: ${errorMessage(error)}`,
      );
      return;
    }

    const remote = new Set(fetched.map((command) => command.name));
    const missing = [...client.commands.keys()].filter((name) => !remote.has(name));
    const extra = [...remote].filter((name) => !client.commands.has(name));

    if (missing.length) {
      record(
        commandsGroup,
        'Регистрация в Discord',
        'warn',
        `не зарегистрированы: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''} — выполните npm run deploy`,
      );
      return;
    }
    if (extra.length) {
      record(
        commandsGroup,
        'Регистрация в Discord',
        'info',
        `лишние в Discord: ${extra.join(', ')} — npm run deploy удалит их`,
      );
      return;
    }
    record(
      commandsGroup,
      'Регистрация в Discord',
      'ok',
      `все ${remote.size} команд на месте${guild ? ' (на сервере)' : ' (глобально)'}`,
    );
  });

  // ------------------------------------------------------------------- Tailscale
  const tailGroup = 'Tailscale';
  await guard(tailGroup, 'Узел', async () => {
    const status = await readTailscaleStatus();
    if (!status.available) {
      record(tailGroup, 'Узел', 'info', status.error ?? 'Tailscale не обнаружен (необязательно)');
      return;
    }

    const running = status.backendState === 'Running';
    record(
      tailGroup,
      'Узел',
      running ? 'ok' : 'warn',
      `${status.dnsName ?? 'без DNS-имени'} · ${status.backendState ?? 'неизвестно'}` +
        (status.ips.length ? ` · ${status.ips.join(', ')}` : ''),
    );

    if (!config.web.enabled) {
      record(tailGroup, 'Serve', 'info', 'веб-панель выключена — serve не нужен');
      return;
    }

    const serve = await readServeConfig();
    const mapping = findMappingForUrl(serve, config.web.publicUrl);
    const expected = tailnetUrl(status);

    if (!mapping) {
      record(
        tailGroup,
        'Serve',
        'warn',
        `нет правила для ${config.web.publicUrl} — выполните npm run tunnel -- --apply`,
      );
      if (expected && !config.web.publicUrl.startsWith(expected)) {
        record(tailGroup, 'Адрес панели', 'info', `постоянный адрес: ${expected}`);
      }
      return;
    }

    const port = proxyPort(mapping.target);
    const portOk = port === config.web.port;
    record(
      tailGroup,
      'Serve',
      portOk ? (mapping.funnel ? 'warn' : 'ok') : 'error',
      `${mapping.host}${mapping.path} → ${mapping.target}` +
        (portOk ? '' : ` (панель слушает ${config.web.port})`) +
        (mapping.funnel ? ' · Funnel: доступно из интернета' : ' · только tailnet'),
    );

    if (!config.web.trustProxy) {
      record(
        tailGroup,
        'X-Forwarded-For',
        'warn',
        'WEB_TRUST_PROXY=false — rate limit будет считать всех одним IP',
      );
    } else {
      record(tailGroup, 'X-Forwarded-For', 'ok', 'WEB_TRUST_PROXY=true');
    }
  });

  // --------------------------------------------------------------------- серверы
  // Сразу после логина Discord может прислать гильдии как unavailable —
  // ждём пару секунд, иначе проверки прав пропускаются.
  await waitForGuilds(client);
  for (const guild of client.guilds.cache.values()) {
    await checkGuild(guild, record, guard);
  }

  return buildReport(checks);
}

/** Ждёт, пока кэш гильдий заполнится после входа/переподключения */
async function waitForGuilds(client: BotClient, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const guilds = [...client.guilds.cache.values()];
    if (guilds.length === 0) return;
    if (guilds.every((guild) => guild.available && Boolean(guild.name))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function checkGuild(
  guild: Guild,
  record: (group: string, name: string, status: CheckStatus, detail?: string) => void,
  guard: (group: string, name: string, check: () => void | Promise<void>) => Promise<void>,
): Promise<void> {
  let current = guild;
  if (!current.available) {
    current = await guild.fetch().catch(() => guild);
  }

  const group = `Сервер: ${current.name ?? current.id}`;

  if (!current.available) {
    record(
      group,
      'Доступность',
      'warn',
      'Discord сообщает о недоступности сервера — проверки прав пропущены',
    );
    return;
  }

  const me: GuildMember | null =
    current.members.me ?? (await current.members.fetchMe().catch(() => null));
  if (!me) {
    record(group, 'Участник-бот', 'error', 'бот не найден в кэше участников');
    return;
  }

  const server = current;

  // Права
  await guard(group, 'Права бота', () => {
    const missing = findMissingPermissions((bit) => me.permissions.has(bit));
    const critical = missing.filter((requirement) => requirement.critical);
    if (critical.length) {
      record(
        group,
        'Права бота',
        'error',
        `нет критичных прав: ${critical.map((item) => item.label).join(', ')}`,
      );
    } else if (missing.length) {
      record(
        group,
        'Права бота',
        'warn',
        `часть функций недоступна, нет: ${missing.map((item) => item.label).join(', ')}`,
      );
    } else {
      record(group, 'Права бота', 'ok', 'все обязательные права есть');
    }

    const missingRecommended = findMissingPermissions(
      (bit) => me.permissions.has(bit),
      RECOMMENDED_BOT_PERMISSIONS,
    );
    record(
      group,
      'Дополнительные права',
      missingRecommended.length ? 'warn' : 'ok',
      missingRecommended.length
        ? `нет: ${missingRecommended.map((item) => item.label).join(', ')}`
        : 'все есть',
    );
  });

  // Иерархия ролей
  await guard(group, 'Иерархия ролей', () => {
    const highest = me.roles.highest;
    const above = server.roles.cache.filter((role) => role.position > highest.position).size;
    if (highest.position === 0) {
      record(group, 'Иерархия ролей', 'warn', 'высшая роль бота — @everyone: модерировать некого');
      return;
    }
    record(
      group,
      'Иерархия ролей',
      'ok',
      `высшая роль «${highest.name}» (позиция ${highest.position}), выше неё ${above} рол.`,
    );
  });

  // Audit Log
  await guard(group, 'Audit Log', async () => {
    if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      record(group, 'Audit Log', 'warn', 'нет права «Журнал аудита» — анти-нак и причины неполные');
      return;
    }
    await withTimeout(server.fetchAuditLogs({ limit: 1 }), 5_000, 'audit logs');
    record(group, 'Audit Log', 'ok', 'доступен');
  });

  // Канал логов
  await guard(group, 'Канал логов', () => {
    const channel = getLogChannel(server);
    if (!channel) {
      record(group, 'Канал логов', 'info', 'не настроен — включите через /logs');
      return;
    }
    if (!channel.isTextBased()) {
      record(group, 'Канал логов', 'warn', 'настроен нетекстовый канал');
      return;
    }
    const permissions = channel.permissionsFor(me);
    const canWrite = Boolean(
      permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ]),
    );
    record(
      group,
      'Канал логов',
      canWrite ? 'ok' : 'warn',
      canWrite
        ? `#${channel.name}`
        : `#${channel.name} — не хватает прав на просмотр/отправку/эмбеды`,
    );
  });

  // Роль мута
  await guard(group, 'Роль мута', async () => {
    const settings = getModerationSettings(server.id);
    const configured = settings.muteRoleId
      ? server.roles.cache.get(settings.muteRoleId)
      : undefined;
    if (settings.muteRoleId && !configured) {
      record(
        group,
        'Роль мута',
        'warn',
        `ID ${settings.muteRoleId} из настроек не найден — проверьте /warnconfig`,
      );
      return;
    }
    const role = configured ?? (await findMuteRole(server));
    if (!role) {
      record(group, 'Роль мута', 'info', 'не создана — появится при первом /mute');
      return;
    }
    if (role.managed) {
      record(group, 'Роль мута', 'warn', `«${role.name}» управляется интеграцией`);
      return;
    }
    const canManage = role.position < me.roles.highest.position;
    record(
      group,
      'Роль мута',
      canManage ? 'ok' : 'warn',
      canManage ? `«${role.name}»` : `«${role.name}» не ниже высшей роли бота — мут не выдастся`,
    );
  });

  // Участники
  record(
    group,
    'Участники',
    'info',
    `${server.memberCount} на сервере, ${server.members.cache.size} в кэше`,
  );
}
