import { useEffect, useRef } from 'react';
import { getHealth } from '@/api/endpoints';
import { getCurrentPanelBuild, normalizePanelBuild, writeUpdateNotice } from '@/lib/autoUpdate';
import { APP_VERSION } from '@/lib/constants';
import { toast } from '@/store/ui';

/** Как часто проверяем, не вышла ли новая сборка панели */
const CHECK_INTERVAL_MS = 60_000;
/** Не дёргаем /health чаще, чем раз в 10 секунд (focus + visibilitychange) */
const MIN_CHECK_GAP_MS = 10_000;
/** Первая проверка после загрузки — не мешает старту сессии */
const INITIAL_CHECK_DELAY_MS = 8_000;
/** Даём тосту показаться перед перезагрузкой */
const RELOAD_DELAY_MS = 2_500;
const GUARD_KEY = 'nexus.auto-update.target';

function readGuard(): string {
  try {
    return window.sessionStorage.getItem(GUARD_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeGuard(target: string): void {
  try {
    window.sessionStorage.setItem(GUARD_KEY, target);
  } catch {
    // sessionStorage может быть недоступен в приватном режиме — не критично.
  }
}

function clearGuard(): void {
  try {
    window.sessionStorage.removeItem(GUARD_KEY);
  } catch {
    // см. writeGuard
  }
}

/**
 * Следит за /health и перезагружает панель, когда на сервере появилась
 * новая сборка (изменился entry-скрипт) или новая версия.
 *
 * В dev-режиме не работает: свежие изменения и так приходят через HMR.
 */
export function useAutoUpdate(): void {
  const reloadingRef = useRef(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let disposed = false;
    let controller: AbortController | null = null;

    const check = async (): Promise<void> => {
      if (disposed || reloadingRef.current) return;
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (now - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
      lastCheckRef.current = now;

      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;

      try {
        const health = await getHealth(currentController.signal);
        if (disposed || reloadingRef.current) return;

        const healthBuild = normalizePanelBuild(health.build);
        const buildChanged = Boolean(healthBuild && healthBuild !== getCurrentPanelBuild());
        const versionChanged = Boolean(health.version && health.version !== APP_VERSION);

        if (!buildChanged && !versionChanged) {
          clearGuard();
          return;
        }

        const target = `${health.version ?? ''}|${healthBuild}`;
        // Уже перезагружались ради этой сборки, но всё ещё видим старую —
        // значит, сервер отдаёт устаревший index. Не зацикливаемся.
        if (readGuard() === target) return;

        writeGuard(target);
        reloadingRef.current = true;

        const versionLabel = versionChanged && health.version ? ` ${health.version}` : '';
        toast.info(
          'Обновление NEXUS',
          `Вышла новая версия${versionLabel}. Страница перезагрузится автоматически.`,
        );
        writeUpdateNotice({
          version: health.version || APP_VERSION,
          build: health.build || healthBuild,
          at: Date.now(),
        });
        window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
      } catch {
        // Сеть может быть недоступна — просто попробуем при следующей проверке.
      } finally {
        if (controller === currentController) controller = null;
      }
    };

    const onFocus = (): void => {
      if (document.visibilityState === 'visible') void check();
    };

    const initialTimer = window.setTimeout(() => void check(), INITIAL_CHECK_DELAY_MS);
    const intervalTimer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      controller?.abort();
    };
  }, []);
}
