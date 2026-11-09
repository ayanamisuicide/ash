/** Общие утилиты автообновления панели. */

const NOTICE_KEY = 'nexus.auto-update.notice';
const NOTICE_MAX_AGE_MS = 2 * 60_000;

export interface UpdateNoticePayload {
  /** Версия, которую отдал сервер перед перезагрузкой */
  version: string;
  /** Entry-скрипт новой сборки */
  build: string;
  /** Время перезагрузки */
  at: number;
}

export function getCurrentPanelBuild(): string {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) return '';

  try {
    return new URL(script.src, window.location.href).pathname;
  } catch {
    return '';
  }
}

export function normalizePanelBuild(build?: string): string {
  if (!build) return '';

  try {
    return new URL(build, window.location.href).pathname;
  } catch {
    return '';
  }
}

export function writeUpdateNotice(payload: UpdateNoticePayload): void {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage может быть недоступен в приватном режиме.
  }
}

export function readUpdateNotice(): UpdateNoticePayload | null {
  try {
    const raw = window.sessionStorage.getItem(NOTICE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<UpdateNoticePayload>;
    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.build !== 'string' ||
      typeof parsed.at !== 'number'
    ) {
      window.sessionStorage.removeItem(NOTICE_KEY);
      return null;
    }

    if (Date.now() - parsed.at > NOTICE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(NOTICE_KEY);
      return null;
    }

    return { version: parsed.version, build: parsed.build, at: parsed.at };
  } catch {
    return null;
  }
}

export function clearUpdateNotice(): void {
  try {
    window.sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // см. writeUpdateNotice
  }
}

/** Показываем окно только если реально загрузилась та сборка, на которую обновлялись. */
export function isNoticeForCurrentBuild(payload: UpdateNoticePayload): boolean {
  if (import.meta.env.DEV) return true;

  const expected = normalizePanelBuild(payload.build);
  const current = getCurrentPanelBuild();
  return !expected || !current || expected === current;
}
