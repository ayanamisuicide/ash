import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Сколько ждём ответа `tailscale` перед тем, как признать его недоступным */
const COMMAND_TIMEOUT_MS = 5_000;

export interface TailscaleStatus {
  available: boolean;
  backendState: string | null;
  /** Имя узла в tailnet без завершающей точки, например desktop-1.tailnet.ts.net */
  dnsName: string | null;
  ips: string[];
  error?: string;
}

export interface TailscaleMapping {
  /** Ключ из конфига serve: host:port */
  host: string;
  path: string;
  /** Куда проксирует tailscaled, например http://127.0.0.1:8080 */
  target: string;
  /** true, если наружу через Funnel (публичный интернет) */
  funnel: boolean;
}

export interface TailscaleServeConfig {
  mappings: TailscaleMapping[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Разбирает JSON от `tailscale status --json` */
export function parseTailscaleStatus(raw: unknown): TailscaleStatus {
  if (!isRecord(raw)) {
    return { available: false, backendState: null, dnsName: null, ips: [], error: 'нет данных' };
  }

  const backendState = typeof raw.BackendState === 'string' ? raw.BackendState : null;
  const self = isRecord(raw.Self) ? raw.Self : null;
  const rawDns = self && typeof self.DNSName === 'string' ? self.DNSName : '';
  const dnsName = rawDns.replace(/\.$/, '') || null;
  const ips =
    self && Array.isArray(self.TailscaleIPs)
      ? self.TailscaleIPs.filter((ip): ip is string => typeof ip === 'string')
      : [];

  return { available: true, backendState, dnsName, ips };
}

/** Разбирает JSON от `tailscale serve status --json` */
export function parseServeConfig(raw: unknown): TailscaleServeConfig {
  if (!isRecord(raw) || !isRecord(raw.Web)) return { mappings: [] };

  const funnelHosts = isRecord(raw.AllowFunnel)
    ? new Set(
        Object.entries(raw.AllowFunnel)
          .filter(([, enabled]) => enabled === true)
          .map(([host]) => host),
      )
    : new Set<string>();

  const mappings: TailscaleMapping[] = [];
  for (const [host, web] of Object.entries(raw.Web)) {
    if (!isRecord(web) || !isRecord(web.Handlers)) continue;
    for (const [path, handler] of Object.entries(web.Handlers)) {
      if (!isRecord(handler) || typeof handler.Proxy !== 'string') continue;
      mappings.push({
        host,
        path,
        target: handler.Proxy,
        funnel: funnelHosts.has(host),
      });
    }
  }

  return { mappings };
}

/** Достаёт порт из адреса прокси (`http://127.0.0.1:8080` → 8080) */
export function proxyPort(target: string): number | null {
  try {
    const parsed = new URL(target.includes('://') ? target : `http://${target}`);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return null;
  }
}

/** Собирает публичный адрес узла из статуса Tailscale */
export function tailnetUrl(status: TailscaleStatus, https = true): string | null {
  if (!status.dnsName) return null;
  return `${https ? 'https' : 'http'}://${status.dnsName}`;
}

/** Запускает `tailscale ...` и возвращает stdout либо null при ошибке */
async function runTailscale(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('tailscale', args, {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Читает состояние Tailscale; никогда не бросает исключение */
export async function readTailscaleStatus(): Promise<TailscaleStatus> {
  const stdout = await runTailscale(['status', '--json']);
  if (!stdout) {
    return {
      available: false,
      backendState: null,
      dnsName: null,
      ips: [],
      error: 'tailscale не найден или не запущен',
    };
  }

  try {
    return parseTailscaleStatus(JSON.parse(stdout) as unknown);
  } catch {
    return {
      available: false,
      backendState: null,
      dnsName: null,
      ips: [],
      error: 'не удалось разобрать tailscale status',
    };
  }
}

/** Читает конфигурацию `tailscale serve`; никогда не бросает исключение */
export async function readServeConfig(): Promise<TailscaleServeConfig> {
  const stdout = await runTailscale(['serve', 'status', '--json']);
  if (!stdout) return { mappings: [] };

  try {
    return parseServeConfig(JSON.parse(stdout) as unknown);
  } catch {
    return { mappings: [] };
  }
}

/** Делит host:port из конфига Tailscale; по умолчанию порт 443 */
function splitHostPort(value: string): { host: string; port: string } {
  const index = value.lastIndexOf(':');
  if (index === -1) return { host: value, port: '443' };
  const port = value.slice(index + 1);
  if (!/^\d+$/.test(port)) return { host: value, port: '443' };
  return { host: value.slice(0, index), port };
}

/** Ищет serve-правило для публичного URL панели */
export function findMappingForUrl(
  config: TailscaleServeConfig,
  publicUrl: string,
): TailscaleMapping | null {
  let hostname: string;
  let port: string;
  try {
    const parsed = new URL(publicUrl);
    hostname = parsed.hostname;
    port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  } catch {
    return null;
  }

  const matching = config.mappings.filter((mapping) => {
    const parts = splitHostPort(mapping.host);
    return parts.host === hostname && parts.port === port;
  });

  return matching.find((mapping) => mapping.path === '/') ?? matching[0] ?? null;
}
