import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGuildMeta } from '@/api/endpoints';
import type { GuildAccess } from '@/api/types';
import { isDemoGuildId } from '@/lib/demo-data';
import { createDemoMeta } from '@/lib/demo-settings';
import { selectActiveGuild, useAuthStore } from '@/store/auth';

function useGuildMetaQuery(enabled: boolean) {
  const guildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const setAccess = useAuthStore((state) => state.setAccess);
  const isDemo = isDemoGuildId(guildId);

  const query = useQuery({
    queryKey: ['guild', guildId, 'meta', isDemo ? 'demo' : 'live'],
    queryFn: ({ signal }) => {
      if (isDemo && activeGuild) return Promise.resolve(createDemoMeta(activeGuild));
      return getGuildMeta(guildId ?? '', signal);
    },
    enabled: Boolean(guildId) && enabled,
    staleTime: 60_000,
    meta: { silent: true },
  });

  useEffect(() => {
    if (query.data) setAccess(query.data.access);
  }, [query.data, setAccess]);

  return query;
}

/**
 * Права обычно приходят вместе с overview, но при прямом переходе на раздел
 * (например, /#/cases) Dashboard не монтируется и access остаётся null.
 * Догружаем meta один раз на сервер, чтобы кнопки действий были доступны.
 */
export function useGuildAccess(): GuildAccess | null {
  const access = useAuthStore((state) => state.access);
  useGuildMetaQuery(!access);
  return access;
}

/**
 * Полные meta-данные сервера: права, каналы и роли.
 * Нужны формам действий, где требуется выбрать роль или канал.
 * `enabled: false` используется демо-режимом, где данные подставляются локально.
 */
export function useGuildMeta(options: { enabled?: boolean } = {}) {
  return useGuildMetaQuery(options.enabled ?? true);
}
