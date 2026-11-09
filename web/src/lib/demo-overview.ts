import type { GuildAccess, GuildSummary, OverviewResponse } from '@/api/types';
import { DEMO_CASES } from '@/lib/demo-data';

const demoAccess = (guild: GuildSummary): GuildAccess =>
  guild.level === 'admin'
    ? {
        admin: true,
        moderate: true,
        kick: true,
        ban: true,
        manageMessages: true,
        manageRoles: true,
      }
    : {
        admin: false,
        moderate: true,
        kick: true,
        ban: false,
        manageMessages: true,
        manageRoles: true,
      };

/**
 * Только для dev-режима: позволяет посмотреть Dashboard без запущенного бота.
 * В production queryFn всегда идёт в реальный /overview.
 */
export function createDemoOverview(guild: GuildSummary): OverviewResponse {
  return {
    ok: true,
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      memberCount: guild.memberCount,
      ownerId: 'demo-owner',
    },
    access: demoAccess(guild),
    stats: {
      members: guild.memberCount,
      totalCases: 1_284,
      todayCases: 17,
      activeCases: 42,
      warns: 23,
      notes: 8,
      pendingAppeals: 3,
      totalAppeals: 11,
    },
    activeByType: [
      { type: 'ban', count: 12 },
      { type: 'timeout', count: 9 },
      { type: 'mute', count: 8 },
      { type: 'warn', count: 7 },
      { type: 'kick', count: 4 },
      { type: 'note', count: 2 },
    ],
    recentCases: DEMO_CASES.slice(0, 6),
    security: {
      raid: {
        enabled: true,
        joinThreshold: 8,
        joinWindowSec: 45,
        accountAgeDays: 7,
        action: 'kick',
        durationSec: 600,
        ignoreBots: true,
      },
      nuke: {
        enabled: false,
        threshold: 3,
        windowSec: 60,
        action: 'alert',
        ignoreAdmins: true,
      },
    },
    bot: {
      tag: 'Nexus#0001',
      id: 'demo-bot',
      ping: 42,
      uptime: 98_765,
      guilds: 2,
    },
  };
}
