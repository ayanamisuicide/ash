import type { MeResponse } from '@/api/types';

/**
 * Только для dev-режима: позволяет открыть панель без запущенного бота.
 * В production-сборке кнопка демо-входа не рендерится.
 */
export const DEMO_SESSION: MeResponse = {
  ok: true,
  authenticated: true,
  user: {
    id: 'demo-user',
    username: 'nova',
    displayName: 'Nova',
    avatarUrl: null,
  },
  csrf: 'demo-csrf-token',
  guilds: [
    {
      id: 'demo-nightfall',
      name: 'Nightfall',
      iconUrl: null,
      memberCount: 12_847,
      level: 'admin',
    },
    {
      id: 'demo-solaris',
      name: 'Solaris',
      iconUrl: null,
      memberCount: 3_204,
      level: 'moderator',
    },
  ],
  bot: {
    tag: 'Nexus#0001',
    id: 'demo-bot',
    ping: 42,
    uptime: 98_765,
    guilds: 2,
  },
};
