export type GuildLevel = 'admin' | 'moderator';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  level: GuildLevel;
}

export interface BotInfo {
  tag: string | null;
  id: string | null;
  ping: number;
  uptime: number;
  guilds: number;
}

export interface GuildAccess {
  admin: boolean;
  moderate: boolean;
  kick: boolean;
  ban: boolean;
  manageMessages: boolean;
  manageRoles: boolean;
}

export type CaseType =
  | 'ban'
  | 'tempban'
  | 'softban'
  | 'kick'
  | 'unban'
  | 'timeout'
  | 'untimeout'
  | 'mute'
  | 'unmute'
  | 'warn'
  | 'warnRemove'
  | 'note'
  | 'noteRemove'
  | 'voice'
  | 'nick'
  | 'role'
  | 'temprole'
  | 'lock'
  | 'unlock'
  | 'slowmode'
  | 'purge';

export interface ModCase {
  id: number;
  guildId: string;
  type: CaseType;
  userId: string | null;
  moderatorId: string;
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  active: boolean;
  extra: Record<string, unknown>;
}

/** DTO из overview/cases: к ModCase добавляются человекочитаемые подписи */
export interface RecentCase extends ModCase {
  label: string;
  userName: string | null;
  moderatorName: string | null;
}

/** GET /api/guilds/:guildId/cases */
export interface CaseListResponse {
  ok: true;
  items: RecentCase[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export type CaseEventKind = 'created' | 'reason' | 'duration' | 'status';

export interface CaseEvent {
  id: number;
  guildId: string;
  caseId: number;
  actorId: string;
  kind: CaseEventKind;
  details: Record<string, unknown>;
  createdAt: number;
}

export interface CaseEventsResponse {
  ok: true;
  events: CaseEvent[];
}

/** GET/PATCH /api/guilds/:guildId/cases/:caseId */
export interface CaseResponse {
  ok: true;
  case: RecentCase;
}

/** Тело PATCH /api/guilds/:guildId/cases/:caseId */
export interface UpdateCaseInput {
  reason?: string;
  active?: boolean;
}

/** Результат модераторских действий и удаления варнов/заметок */
export interface ActionResult {
  /** false приходит с HTTP 200 — это бизнес-ошибка, её нужно показать */
  ok: boolean;
  message: string;
  caseId?: number;
}

export interface MemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
  joinedAt: number | null;
  createdAt: number | null;
  timeoutUntil: number | null;
  muted: boolean;
  highestRole: string | null;
}

export interface MemberRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface MemberWarn {
  id: string;
  reason: string;
  moderatorId: string;
  createdAt: number;
}

export interface MemberNote {
  id: string;
  text: string;
  authorId: string;
  createdAt: number;
}

/** GET /api/guilds/:guildId/members/:userId */
export interface MemberProfile extends MemberSummary {
  inGuild: boolean;
  banned: boolean;
  roles: MemberRole[];
  kickable: boolean;
  bannable: boolean;
  moderatable: boolean;
  warnings: MemberWarn[];
  notes: MemberNote[];
  cases: RecentCase[];
  activeCases: RecentCase[];
  /** Активность участника: XP, уровень, сообщения и время в голосе */
  activity: MemberActivity;
}

/** Активность участника в профиле */
export interface MemberActivity {
  xp: number;
  level: number;
  rest: number;
  needed: number;
  messages: number;
  voiceSeconds: number;
  /** Места в топах (0 — активности ещё нет) */
  ranks: { xp: number; messages: number; voice: number };
}

export type ActivityMetric = 'xp' | 'messages' | 'voice';

export interface ActivityMemberStat {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  level: number;
  xp: number;
  messages: number;
  voiceSeconds: number;
}

export interface ActivityLiveSession {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  channelId: string;
  seconds: number;
}

/** GET /api/guilds/:guildId/activity */
export interface ActivityResponse {
  ok: true;
  settings: {
    levelingEnabled: boolean;
    messageXp: number;
    messageCooldownSec: number;
    voiceXp: number;
    voiceTrackingEnabled: boolean;
  };
  voiceIntervalMinutes: number;
  totals: {
    tracked: number;
    messages: number;
    voiceSeconds: number;
    xp: number;
  };
  top: Record<ActivityMetric, ActivityMemberStat[]>;
  live: ActivityLiveSession[];
}

/** GET /api/guilds/:guildId/members?q=&page=&pageSize= */
export interface MemberSearchResponse {
  ok: true;
  items: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** true — кэш участников неполный, список может быть неполным */
  partial: boolean;
}

/** GET /api/guilds/:guildId/members/:userId */
export interface MemberProfileResponse {
  ok: true;
  member: MemberProfile;
}

export type AppealStatus = 'pending' | 'approved' | 'rejected';

/** GET /api/guilds/:guildId/appeals */
export interface Appeal {
  id: number;
  guildId: string;
  userId: string;
  reason: string;
  status: AppealStatus;
  createdAt: number;
  /** Кейс наказания, которое обжалуют */
  caseId: number | null;
  caseType: CaseType | null;
  caseReason: string | null;
  channelId: string | null;
  messageId: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  /** Комментарий модератора при решении */
  reviewComment: string | null;
}

export interface AppealListResponse {
  ok: true;
  items: Appeal[];
}

/** POST /api/guilds/:guildId/appeals/:id/review */
export interface AppealReviewResult {
  ok: boolean;
  message: string;
}

export type TicketStatus = 'open' | 'closed';

/** GET /api/guilds/:guildId/tickets */
export interface Ticket {
  channelId: string;
  userId: string;
  status: TicketStatus;
  createdAt: number;
  closedAt: number | null;
  channelName: string | null;
  channelExists: boolean;
  userName: string | null;
  hasTranscript: boolean;
}

export interface TicketListResponse {
  ok: true;
  items: Ticket[];
}

export interface TicketCloseResponse {
  ok: true;
  ticket: Ticket;
  transcript: boolean;
}

export interface AnalyticsPoint {
  date: string;
  count: number;
}

export interface AnalyticsSlice {
  type: string;
  label: string;
  count: number;
}

export interface AnalyticsPerson {
  id: string;
  count: number;
  name: string | null;
}

export interface ModerationAnalyticsResponse {
  ok: true;
  days: number;
  totals: {
    cases: number;
    active: number;
    bans: number;
    warnings: number;
    mutes: number;
    trackedMembers: number;
    messages: number;
    voiceSeconds: number;
  };
  daily: AnalyticsPoint[];
  byType: AnalyticsSlice[];
  topModerators: AnalyticsPerson[];
  topUsers: AnalyticsPerson[];
  appeals: {
    pending: number;
    approved: number;
    rejected: number;
  };
}

export type WarnActionType = 'timeout' | 'mute' | 'kick' | 'ban' | 'tempban';

export interface WarnActionSettings {
  id: string;
  count: number;
  windowDays: number;
  action: WarnActionType;
  durationMs: number | null;
}

export type AutomodAction = 'delete' | 'warn' | 'timeout' | 'mute' | 'kick' | 'ban';

export interface AutomodSettings {
  enabled: boolean;
  invites: boolean;
  links: boolean;
  caps: boolean;
  spam: boolean;
  words: string[];
  /** 0 — проверка упоминаний выключена */
  mentions: number;
  action: AutomodAction;
  durationMs: number | null;
  deleteMessage: boolean;
  capsMinLength: number;
  capsPercent: number;
  spamCount: number;
  spamWindowSec: number;
  spamDuplicateCount: number;
  ignoredChannels: string[];
  ignoredRoles: string[];
}

/** PATCH automod: длительность передаётся строкой "10m"/"1h" */
export interface AutomodSettingsUpdate extends Partial<AutomodSettings> {
  duration?: string | null;
}

/** GET /api/guilds/:guildId/settings → moderation */
export interface ModerationSettings {
  immunityRoles: string[];
  reportChannelId: string | null;
  appealChannelId: string | null;
  muteRoleId: string | null;
  warnExpiryDays: number;
  warnActions: WarnActionSettings[];
  automod: AutomodSettings;
}

export type LogCategoryKey =
  | 'messages'
  | 'members'
  | 'channels'
  | 'roles'
  | 'threads'
  | 'voice'
  | 'server'
  | 'invites'
  | 'expressions'
  | 'events'
  | 'automod'
  | 'webhooks'
  | 'security';

export type LogEventKey =
  | 'messageCreate'
  | 'messageDelete'
  | 'messageUpdate'
  | 'messageBulkDelete'
  | 'reactionAdd'
  | 'reactionRemove'
  | 'reactionClear'
  | 'reactionEmojiClear'
  | 'pinsUpdate'
  | 'memberAdd'
  | 'memberRemove'
  | 'memberUpdate'
  | 'banAdd'
  | 'banRemove'
  | 'warnAdd'
  | 'warnRemove'
  | 'warnEscalation'
  | 'moderationExpire'
  | 'noteAdd'
  | 'noteRemove'
  | 'appealUpdate'
  | 'channelCreate'
  | 'channelDelete'
  | 'channelUpdate'
  | 'roleCreate'
  | 'roleDelete'
  | 'roleUpdate'
  | 'threadCreate'
  | 'threadDelete'
  | 'threadUpdate'
  | 'voiceStateUpdate'
  | 'guildUpdate'
  | 'scheduledEventCreate'
  | 'scheduledEventUpdate'
  | 'scheduledEventDelete'
  | 'inviteCreate'
  | 'inviteDelete'
  | 'emojiCreate'
  | 'emojiDelete'
  | 'emojiUpdate'
  | 'stickerCreate'
  | 'stickerDelete'
  | 'stickerUpdate'
  | 'automodExecution'
  | 'webhookUpdate'
  | 'raidAlert'
  | 'raidAction'
  | 'nukeAlert'
  | 'nukeAction';

export interface LogConfig {
  channelId: string | null;
  categories: Record<LogCategoryKey, boolean>;
  events: Record<LogEventKey, boolean>;
}

export interface LogEventCatalogEntry {
  category: LogCategoryKey;
  label: string;
}

export interface SettingsCatalog {
  logCategories: Record<LogCategoryKey, string>;
  logEvents: Record<LogEventKey, LogEventCatalogEntry>;
}

export interface LevelReward {
  level: number;
  roleId: string;
}

export interface CommunitySettings {
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  autoroleIds: string[];
  levelingEnabled: boolean;
  levelupChannelId: string | null;
  levelupMessage: string;
  /** XP за одно сообщение (0 — не начислять) */
  messageXp: number;
  /** Пауза между начислениями за сообщения, секунды (0 — за каждое) */
  messageCooldownSec: number;
  /** XP за каждые 5 минут в голосе */
  voiceXp: number;
  voiceTrackingEnabled: boolean;
  levelRewards: LevelReward[];
  levelRewardsReplacePrevious: boolean;
  tempVoiceChannelId: string | null;
  ticketCategoryId: string | null;
  ticketLogChannelId: string | null;
  ticketSupportRoleId: string | null;
}

export interface SettingsBundleResponse {
  ok: true;
  moderation: ModerationSettings;
  logs: LogConfig;
  security: SecuritySettings;
  community: CommunitySettings;
  catalog: SettingsCatalog;
}

/** PATCH /api/guilds/:guildId/settings/logs */
export interface LogSettingsUpdate {
  reset?: boolean;
  channelId?: string | null;
  categories?: Partial<Record<LogCategoryKey, boolean>>;
  events?: Partial<Record<LogEventKey, boolean>>;
}

export interface LogSettingsResponse {
  ok: true;
  logs: LogConfig;
}

/** PATCH /api/guilds/:guildId/settings/security */
export interface SecuritySettingsUpdate {
  raid?: Partial<RaidConfig>;
  nuke?: Partial<NukeConfig>;
}

export interface SecuritySettingsResponse {
  ok: true;
  security: SecuritySettings;
}

/** PATCH /api/guilds/:guildId/settings/community */
export interface CommunitySettingsUpdate {
  welcomeChannelId?: string | null;
  welcomeMessage?: string;
  goodbyeChannelId?: string | null;
  goodbyeMessage?: string;
  autoroleIds?: string[];
  levelingEnabled?: boolean;
  levelupChannelId?: string | null;
  levelupMessage?: string;
  messageXp?: number;
  messageCooldownSec?: number;
  voiceXp?: number;
  voiceTrackingEnabled?: boolean;
  levelRewards?: LevelReward[];
  levelRewardsReplacePrevious?: boolean;
  tempVoiceChannelId?: string | null;
  ticketCategoryId?: string | null;
  ticketLogChannelId?: string | null;
  ticketSupportRoleId?: string | null;
}

export interface CommunitySettingsResponse {
  ok: true;
  community: CommunitySettings;
}

/** PATCH /api/guilds/:guildId/settings/moderation */
export interface ModerationSettingsUpdate {
  automod?: AutomodSettingsUpdate;
  warnExpiryDays?: number;
  reportChannelId?: string | null;
  appealChannelId?: string | null;
  muteRoleId?: string | null;
  immunityRoles?: string[];
}

export interface ModerationSettingsResponse {
  ok: true;
  moderation: ModerationSettings;
}

/** POST /api/guilds/:guildId/settings/moderation/warn-actions */
export interface AddWarnActionInput {
  count: number;
  windowDays: number;
  action: WarnActionType;
  duration?: string | null;
}

export type MemberActionType =
  'warn' | 'timeout' | 'untimeout' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'role' | 'note';

/** Тело POST /api/guilds/:guildId/actions/:action */
export interface MemberActionBody {
  userId: string;
  reason?: string;
  duration?: string | null;
  deleteSeconds?: number;
  roleId?: string;
  /** Только для action=role: add/remove */
  action?: 'add' | 'remove';
  /** Только для action=note */
  text?: string;
}

export interface OverviewStats {
  members: number;
  totalCases: number;
  todayCases: number;
  activeCases: number;
  warns: number;
  notes: number;
  pendingAppeals: number;
  totalAppeals: number;
}

export type RaidAction = 'alert' | 'kick' | 'ban';
export type NukeAction = 'alert' | 'timeout' | 'kick' | 'ban';

export interface RaidConfig {
  enabled: boolean;
  joinThreshold: number;
  joinWindowSec: number;
  accountAgeDays: number;
  action: RaidAction;
  durationSec: number;
  ignoreBots: boolean;
}

export interface NukeConfig {
  enabled: boolean;
  threshold: number;
  windowSec: number;
  action: NukeAction;
  ignoreAdmins: boolean;
}

export interface SecuritySettings {
  raid: RaidConfig;
  nuke: NukeConfig;
}

export interface OverviewGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  ownerId: string;
}

export interface GuildMetaChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  isText: boolean;
  isVoice: boolean;
  isCategory: boolean;
}

export interface GuildMetaRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  isEveryone: boolean;
}

/** GET /api/guilds/:guildId/meta — права, каналы и роли для форм */
export interface GuildMetaResponse {
  ok: true;
  guild: OverviewGuild;
  access: GuildAccess;
  channels: GuildMetaChannel[];
  roles: GuildMetaRole[];
  bot: BotInfo & { nickname: string | null };
}

/** GET /api/guilds/:guildId/overview */
export interface OverviewResponse {
  ok: true;
  guild: OverviewGuild;
  access: GuildAccess;
  stats: OverviewStats;
  activeByType: Array<{ type: CaseType; count: number }>;
  recentCases: RecentCase[];
  security: SecuritySettings;
  bot: BotInfo;
}

/** GET /api/me */
export interface MeResponse {
  ok: true;
  authenticated: true;
  user: AuthUser;
  csrf: string;
  guilds: GuildSummary[];
  bot: BotInfo;
}

/** Формат ошибок всех REST-эндпоинтов бота */
export interface ApiErrorPayload {
  ok: false;
  error: string;
}
