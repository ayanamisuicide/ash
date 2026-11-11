import type {
  Appeal,
  AppealListResponse,
  CaseListResponse,
  CaseType,
  MemberNote,
  MemberProfile,
  MemberRole,
  MemberSearchResponse,
  MemberSummary,
  MemberWarn,
  RecentCase,
  Ticket,
  TicketListResponse,
} from '@/api/types';
import { caseTypeLabel } from '@/lib/cases';
import { DEMO_ROLES } from '@/lib/demo-settings';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.now();

/** Dev-only ветка: демо-серверы не должны ходить в реальный API. */
export function isDemoGuildId(guildId: string | null | undefined): boolean {
  return import.meta.env.DEV && Boolean(guildId?.startsWith('demo-'));
}

export function demoUserId(name: string): string {
  return `demo-user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

const MEMBER_NAMES = ['Nova', 'Kira', 'Rin', 'Maks', 'Sora', 'Vex', 'Lumen', 'Iris', 'Orion'];
const MODERATOR_NAMES = ['Aya', 'Nova', 'Lumen'];

const CASE_REASONS: Partial<Record<CaseType, string>> = {
  ban: 'Реклама сторонних сервисов и обход блокировок',
  tempban: 'Систематические нарушения правил сервера',
  softban: 'Массовый спам с очисткой сообщений',
  kick: 'Токсичное поведение после предупреждения',
  unban: 'Апелляция одобрена, бан снят',
  timeout: 'Флуд после предупреждения',
  untimeout: 'Таймаут снят досрочно',
  mute: 'Нарушение правил голосовых каналов',
  unmute: 'Мут снят по апелляции',
  warn: 'Спам в #general',
  warnRemove: 'Предупреждение снято модератором',
  note: 'Наблюдение за поведением',
  noteRemove: 'Заметка удалена',
  voice: 'Переключение каналов без причины',
  nick: 'Никнейм, нарушающий правила',
  role: 'Выдана роль Support',
  temprole: 'Временная роль на 24 часа',
  lock: 'Канал закрыт на время разбора',
  unlock: 'Канал снова открыт',
  slowmode: 'Медленный режим 15 секунд',
  purge: 'Очищено 48 сообщений',
};

function buildCase(
  id: number,
  type: CaseType,
  userName: string,
  moderatorName: string,
  reason: string,
  createdAt: number,
  active: boolean,
  expiresAt: number | null = null,
): RecentCase {
  return {
    id,
    guildId: 'demo-nightfall',
    type,
    userId: demoUserId(userName),
    moderatorId: `demo-mod-${moderatorName.toLowerCase()}`,
    reason,
    createdAt,
    expiresAt,
    active,
    extra: {},
    label: caseTypeLabel(type),
    userName,
    moderatorName,
  };
}

const seedCases: RecentCase[] = [
  buildCase(1042, 'ban', 'Orion', 'Aya', 'Реклама сторонних сервисов', now - 12 * MINUTE, true),
  buildCase(1041, 'warn', 'Kira', 'Nova', 'Спам в #general', now - 47 * MINUTE, true),
  buildCase(
    1040,
    'timeout',
    'Rin',
    'Aya',
    'Флуд после предупреждения',
    now - 2 * HOUR,
    true,
    now + 10 * HOUR,
  ),
  buildCase(1039, 'kick', 'Maks', 'Nova', 'Токсичное поведение', now - 5 * HOUR, false),
  buildCase(1038, 'note', 'Sora', 'Nova', 'Наблюдение за поведением', now - 26 * HOUR, true),
  buildCase(
    1037,
    'mute',
    'Vex',
    'Aya',
    'Нарушение правил голосовых каналов',
    now - 2 * DAY,
    true,
    now + 18 * HOUR,
  ),
];

const generatedTypes: CaseType[] = [
  'warn',
  'timeout',
  'note',
  'mute',
  'kick',
  'ban',
  'unban',
  'untimeout',
  'unmute',
  'role',
  'slowmode',
  'lock',
  'unlock',
];

const generatedCases: RecentCase[] = Array.from({ length: 34 }, (_, index) => {
  const id = 1036 - index;
  const type = generatedTypes[index % generatedTypes.length];
  const userName = MEMBER_NAMES[(index + 3) % MEMBER_NAMES.length];
  const moderatorName = MODERATOR_NAMES[index % MODERATOR_NAMES.length];
  const createdAt = now - (3 * DAY + index * 5 * HOUR);
  const active = index % 4 !== 0;
  const timed = type === 'timeout' || type === 'mute' || type === 'tempban';
  return buildCase(
    id,
    type,
    userName,
    moderatorName,
    CASE_REASONS[type] ?? 'Нарушение правил сервера',
    createdAt,
    active,
    active && timed ? Math.max(now + 2 * HOUR, createdAt + 12 * HOUR) : null,
  );
});

export const DEMO_CASES: RecentCase[] = [...seedCases, ...generatedCases].sort(
  (a, b) => b.createdAt - a.createdAt,
);

interface MemberSeed {
  name: string;
  username: string;
  role: string;
  muted?: boolean;
  timeoutUntil?: number | null;
  banned?: boolean;
  joinedDays: number;
  accountDays: number;
  bot?: boolean;
}

const memberSeeds: MemberSeed[] = [
  {
    name: 'Nova',
    username: 'nova',
    role: 'Администратор',
    joinedDays: 420,
    accountDays: 1_240,
  },
  {
    name: 'Kira',
    username: 'kira',
    role: 'Модератор',
    joinedDays: 280,
    accountDays: 860,
  },
  {
    name: 'Rin',
    username: 'rin',
    role: 'Support',
    timeoutUntil: now + 10 * HOUR,
    joinedDays: 190,
    accountDays: 640,
  },
  {
    name: 'Maks',
    username: 'maks',
    role: 'Участник',
    joinedDays: 95,
    accountDays: 410,
  },
  {
    name: 'Sora',
    username: 'sora',
    role: 'Участник',
    joinedDays: 64,
    accountDays: 300,
  },
  {
    name: 'Vex',
    username: 'vex',
    role: 'Участник',
    muted: true,
    joinedDays: 38,
    accountDays: 220,
  },
  {
    name: 'Lumen',
    username: 'lumen',
    role: 'Support',
    joinedDays: 150,
    accountDays: 520,
  },
  {
    name: 'Iris',
    username: 'iris',
    role: 'Участник',
    joinedDays: 22,
    accountDays: 140,
  },
  {
    name: 'Orion',
    username: 'orion',
    role: 'Участник',
    banned: true,
    joinedDays: 310,
    accountDays: 980,
  },
  {
    name: 'Nexus',
    username: 'nexus_bot',
    role: 'Бот',
    joinedDays: 480,
    accountDays: 480,
    bot: true,
  },
];

function roleFor(name: string): MemberRole | null {
  const role = DEMO_ROLES.find((item) => item.name === name);
  return role
    ? {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        managed: role.managed,
      }
    : null;
}

function rolesFor(name: string, roleName: string): MemberRole[] {
  const roles: MemberRole[] = [];
  const primary = roleFor(roleName);
  if (primary) roles.push(primary);

  if (roleName === 'Администратор') {
    const moderator = roleFor('Модератор');
    if (moderator) roles.push(moderator);
  }
  if (roleName === 'Модератор' || roleName === 'Support') {
    const member = roleFor('Участник');
    if (member) roles.push(member);
  }
  if (name === 'Vex') {
    const muted = roleFor('Muted');
    if (muted) roles.push(muted);
  }
  return roles;
}

export const DEMO_MEMBERS: MemberSummary[] = memberSeeds.map((seed) => ({
  id: demoUserId(seed.name),
  username: seed.username,
  displayName: seed.name,
  avatarUrl: '',
  bot: Boolean(seed.bot),
  joinedAt: seed.joinedDays ? now - seed.joinedDays * DAY : null,
  createdAt: seed.accountDays ? now - seed.accountDays * DAY : null,
  timeoutUntil: seed.timeoutUntil ?? null,
  muted: Boolean(seed.muted),
  highestRole: seed.role,
}));

function buildProfile(seed: MemberSeed, summary: MemberSummary): MemberProfile {
  const userCases = DEMO_CASES.filter((item) => item.userId === summary.id);
  const activeCases = userCases.filter((item) => item.active);
  const banned =
    Boolean(seed.banned) ||
    activeCases.some(
      (item) => item.type === 'ban' || item.type === 'tempban' || item.type === 'softban',
    );
  const muted = Boolean(seed.muted) || activeCases.some((item) => item.type === 'mute');
  const timeoutCase = activeCases.find((item) => item.type === 'timeout');
  const inGuild = !banned && seed.name !== 'Maks';

  const warnings: MemberWarn[] = userCases
    .filter((item) => item.type === 'warn')
    .map((item) => ({
      id: `warn-${item.id}`,
      reason: item.reason,
      moderatorId: item.moderatorName ?? item.moderatorId,
      createdAt: item.createdAt,
    }));

  const notes: MemberNote[] = userCases
    .filter((item) => item.type === 'note')
    .map((item) => ({
      id: `note-${item.id}`,
      text: item.reason,
      authorId: item.moderatorName ?? item.moderatorId,
      createdAt: item.createdAt,
    }));

  const activitySeed = [...seed.name].reduce((total, char) => total + char.charCodeAt(0), 0);
  const messages = seed.bot ? 0 : 40 + ((activitySeed * 7) % 900);
  const voiceSeconds = seed.bot ? 0 : 1_200 + ((activitySeed * 13) % 40_000);
  const xp = seed.bot ? 0 : messages * 5 + Math.floor(voiceSeconds / 300) * 10;
  let level = 0;
  let rest = xp;
  let needed = 100;
  while (rest >= needed) {
    rest -= needed;
    level += 1;
    needed = 5 * level * level + 50 * level + 100;
  }

  return {
    ...summary,
    inGuild,
    banned,
    roles: rolesFor(seed.name, seed.role),
    kickable: inGuild && !seed.bot && seed.role !== 'Администратор',
    bannable: inGuild && !seed.bot && seed.role !== 'Администратор',
    moderatable: inGuild && !seed.bot && seed.role !== 'Администратор',
    warnings,
    notes,
    cases: userCases,
    activeCases,
    muted,
    timeoutUntil: timeoutCase?.expiresAt ?? summary.timeoutUntil,
    activity: {
      xp,
      level,
      rest,
      needed,
      messages,
      voiceSeconds,
      ranks: seed.bot
        ? { xp: 0, messages: 0, voice: 0 }
        : {
            xp: 1 + (activitySeed % 12),
            messages: 1 + (activitySeed % 9),
            voice: 1 + (activitySeed % 7),
          },
    },
  };
}

export const DEMO_PROFILES: Record<string, MemberProfile> = Object.fromEntries(
  memberSeeds.map((seed) => {
    const summary = DEMO_MEMBERS.find((item) => item.id === demoUserId(seed.name));
    if (!summary) throw new Error(`Demo member not found: ${seed.name}`);
    return [summary.id, buildProfile(seed, summary)];
  }),
);

export interface DemoCaseParams {
  page?: number;
  pageSize?: number;
  type?: CaseType;
  active?: boolean;
  q?: string;
}

export function createDemoCaseList(
  _guildId: string,
  params: DemoCaseParams = {},
): CaseListResponse {
  const pageSize = params.pageSize ?? 25;
  let items = [...DEMO_CASES];

  if (params.type) items = items.filter((item) => item.type === params.type);
  if (typeof params.active === 'boolean') {
    items = items.filter((item) => item.active === params.active);
  }
  if (params.q) {
    const query = params.q.toLowerCase();
    items = items.filter((item) => {
      return (
        item.reason.toLowerCase().includes(query) ||
        String(item.id).includes(query) ||
        (item.userName ?? '').toLowerCase().includes(query) ||
        (item.moderatorName ?? '').toLowerCase().includes(query)
      );
    });
  }

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(params.page ?? 1, 1), pages);
  const start = (page - 1) * pageSize;

  return {
    ok: true,
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pages,
  };
}

export function createDemoMemberSearch(
  _guildId: string,
  query: string,
  page = 1,
  pageSize = 50,
): MemberSearchResponse {
  const normalized = query.trim().toLowerCase();
  const items = normalized
    ? DEMO_MEMBERS.filter((member) => {
        return (
          member.displayName.toLowerCase().includes(normalized) ||
          member.username.toLowerCase().includes(normalized) ||
          member.id.includes(normalized)
        );
      })
    : [...DEMO_MEMBERS];

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize;

  return {
    ok: true,
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pages,
    partial: false,
  };
}

export function getDemoMemberProfile(userId: string): MemberProfile {
  const profile = DEMO_PROFILES[userId];
  if (!profile) throw new Error('Демо-участник не найден.');
  return profile;
}

const pendingAppeals: Appeal[] = [
  {
    id: 501,
    guildId: 'demo-nightfall',
    userId: '428512736094112771',
    reason:
      'Понимаю, что реклама — нарушение, но это была ошибка: аккаунт взломали и разослали ссылки. Пароль уже сменён, прошу разбанить.',
    status: 'pending',
    createdAt: now - 40 * MINUTE,
    caseId: 1042,
    caseType: 'ban',
    caseReason: 'Реклама сторонних сервисов',
    channelId: '100000000000000004',
    messageId: 'demo-message-501',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
  },
  {
    id: 502,
    guildId: 'demo-nightfall',
    userId: '583927104662118405',
    reason:
      'Был в голосовом канале с друзьями, музыка играла слишком громко. Больше не повторится — прошу снять мут.',
    status: 'pending',
    createdAt: now - 3 * HOUR,
    caseId: 1037,
    caseType: 'mute',
    caseReason: 'Нарушение правил голосовых каналов',
    channelId: '100000000000000004',
    messageId: 'demo-message-502',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
  },
  {
    id: 503,
    guildId: 'demo-nightfall',
    userId: '397451820776331265',
    reason:
      'Предупреждение получила за ссылку на гифку, которую не считаю спамом. Готова больше не отправлять такие сообщения.',
    status: 'pending',
    createdAt: now - 9 * HOUR,
    caseId: 1041,
    caseType: 'warn',
    caseReason: 'Спам в #general',
    channelId: '100000000000000004',
    messageId: 'demo-message-503',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
  },
];

const reviewedAppeals: Appeal[] = [
  {
    id: 498,
    guildId: 'demo-nightfall',
    userId: '612048395771904002',
    reason: 'Таймаут был выдан на фоне конфликта, я уже извинился перед участником.',
    status: 'approved',
    createdAt: now - 2 * DAY,
    caseId: 1040,
    caseType: 'timeout',
    caseReason: 'Флуд после предупреждения',
    channelId: '100000000000000004',
    messageId: 'demo-message-498',
    reviewedBy: 'Nova',
    reviewedAt: now - 30 * HOUR,
    reviewComment: 'Наказание снято, постарайтесь не повторять конфликт.',
  },
  {
    id: 497,
    guildId: 'demo-nightfall',
    userId: '554820391177264130',
    reason: 'Считаю кик несправедливым, в чате был сарказм, а не токсичность.',
    status: 'rejected',
    createdAt: now - 4 * DAY,
    caseId: 1039,
    caseType: 'kick',
    caseReason: 'Токсичное поведение',
    channelId: '100000000000000004',
    messageId: 'demo-message-497',
    reviewedBy: 'Aya',
    reviewedAt: now - 3 * DAY,
    reviewComment: 'Наказание оставлено в силе: токсичность подтверждена логами канала.',
  },
];

export const DEMO_APPEALS: Appeal[] = [...pendingAppeals, ...reviewedAppeals];
const demoTickets: Ticket[] = [
  {
    channelId: '100000000000000201',
    userId: '428512736094112771',
    status: 'open',
    createdAt: now - 25 * MINUTE,
    closedAt: null,
    channelName: 'ticket-aya',
    channelExists: true,
    userName: 'aya',
    hasTranscript: false,
  },
  {
    channelId: '100000000000000202',
    userId: '583927104662118405',
    status: 'open',
    createdAt: now - 2 * HOUR,
    closedAt: null,
    channelName: 'ticket-nova',
    channelExists: true,
    userName: 'nova',
    hasTranscript: false,
  },
  {
    channelId: '100000000000000203',
    userId: '612048395771904002',
    status: 'closed',
    createdAt: now - 2 * DAY,
    closedAt: now - 30 * HOUR,
    channelName: 'ticket-ren',
    channelExists: false,
    userName: 'ren',
    hasTranscript: true,
  },
];

export function createDemoTickets(status: 'open' | 'all'): TicketListResponse {
  return {
    ok: true,
    items:
      status === 'open' ? demoTickets.filter((ticket) => ticket.status === 'open') : demoTickets,
  };
}
export function createDemoAppeals(_guildId: string, status: 'pending' | 'all'): AppealListResponse {
  return {
    ok: true,
    items: status === 'pending' ? pendingAppeals : DEMO_APPEALS,
  };
}
