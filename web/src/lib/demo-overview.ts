import type { ActivityResponse, GuildAccess, GuildSummary, OverviewResponse } from '@/api/types';
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

/** Демо-данные виджета активности для dev-панели */
export function createDemoActivity(): ActivityResponse {
  const members = [
    {
      userId: 'demo-1',
      name: 'Kirito',
      xp: 12_480,
      level: 24,
      messages: 3_420,
      voiceSeconds: 184_000,
    },
    {
      userId: 'demo-2',
      name: 'Asuna',
      xp: 9_860,
      level: 21,
      messages: 2_910,
      voiceSeconds: 152_000,
    },
    {
      userId: 'demo-3',
      name: 'Sinon',
      xp: 7_240,
      level: 18,
      messages: 1_870,
      voiceSeconds: 96_400,
    },
    {
      userId: 'demo-4',
      name: 'Leafa',
      xp: 4_180,
      level: 14,
      messages: 1_240,
      voiceSeconds: 63_200,
    },
    { userId: 'demo-5', name: 'Klein', xp: 2_360, level: 10, messages: 860, voiceSeconds: 28_800 },
  ];

  const sorted = (key: 'xp' | 'messages' | 'voiceSeconds') =>
    [...members]
      .sort((a, b) => b[key] - a[key])
      .map((member) => ({
        ...member,
        avatarUrl: null,
      }));

  return {
    ok: true,
    settings: {
      levelingEnabled: true,
      messageXp: 5,
      messageCooldownSec: 0,
      voiceXp: 10,
      voiceTrackingEnabled: true,
    },
    voiceIntervalMinutes: 5,
    totals: {
      tracked: 128,
      messages: 24_680,
      voiceSeconds: 1_842_000,
      xp: 96_420,
    },
    top: {
      xp: sorted('xp'),
      messages: sorted('messages'),
      voice: sorted('voiceSeconds'),
    },
    live: [
      {
        userId: 'demo-1',
        name: 'Kirito',
        avatarUrl: null,
        channelId: 'demo-voice',
        seconds: 4_320,
      },
      { userId: 'demo-3', name: 'Sinon', avatarUrl: null, channelId: 'demo-voice', seconds: 1_260 },
    ],
  };
}
