import type {
  CaseType,
  GuildAccess,
  GuildSummary,
  OverviewResponse,
  RecentCase,
} from '@/api/types';
import { caseTypeLabel } from '@/lib/cases';

const now = Date.now();
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

function demoCase(
  id: number,
  type: CaseType,
  user: string,
  moderator: string,
  reason: string,
  createdAt: number,
  active: boolean,
  expiresAt: number | null = null,
): RecentCase {
  return {
    id,
    guildId: 'demo',
    type,
    userId: `demo-user-${id}`,
    moderatorId: `demo-mod-${moderator}`,
    reason,
    createdAt,
    expiresAt,
    active,
    extra: {},
    label: caseTypeLabel(type),
    userName: user,
    moderatorName: moderator,
  };
}

const recentCases: RecentCase[] = [
  demoCase(1042, 'ban', 'Nova', 'Aya', 'Реклама сторонних сервисов', now - 12 * 60_000, true),
  demoCase(1041, 'warn', 'Kira', 'Nova', 'Спам в #general', now - 47 * 60_000, true),
  demoCase(
    1040,
    'timeout',
    'Rin',
    'Aya',
    'Флуд после предупреждения',
    now - 2 * 3_600_000,
    true,
    now + 10 * 3_600_000,
  ),
  demoCase(1039, 'kick', 'Maks', 'Nova', 'Токсичное поведение', now - 5 * 3_600_000, false),
  demoCase(
    1038,
    'note',
    'Sora',
    'Nova',
    'Наблюдение за поведением',
    now - 26 * 3_600_000,
    true,
  ),
  demoCase(
    1037,
    'mute',
    'Vex',
    'Aya',
    'Нарушение правил голосовых каналов',
    now - 2 * 86_400_000,
    false,
  ),
];

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
    recentCases,
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
