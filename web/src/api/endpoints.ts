import { api, apiDownload, type DownloadResult } from './client';
import type {
  ActionResult,
  ActivityResponse,
  AddWarnActionInput,
  AppealListResponse,
  AppealReviewResult,
  CaseListResponse,
  CaseEventsResponse,
  CaseResponse,
  CaseType,
  CommunitySettingsResponse,
  CommunitySettingsUpdate,
  GuildMetaResponse,
  LogSettingsResponse,
  LogSettingsUpdate,
  MemberActionBody,
  MemberActionType,
  MemberProfileResponse,
  MemberSearchResponse,
  MeResponse,
  ModerationSettingsResponse,
  ModerationSettingsUpdate,
  OverviewResponse,
  SecuritySettingsResponse,
  SecuritySettingsUpdate,
  SettingsBundleResponse,
  TicketCloseResponse,
  TicketListResponse,
  TicketStatus,
  UpdateCaseInput,
  ModerationAnalyticsResponse,
} from './types';

/** Текущая сессия, список доступных серверов и CSRF-токен */
export function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  return api.get<MeResponse>('/api/me', { signal });
}

export interface HealthResponse {
  ok: boolean;
  /** Версия бота и панели из package.json */
  version?: string;
  /** Entry-скрипт текущей сборки панели — меняется при каждом билде */
  build?: string;
}

/** Публичный health-check: используется для автообновления панели. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return api.get<HealthResponse>('/health', { signal });
}

/** Статистика, последние кейсы, безопасность и состояние бота */
export function getOverview(guildId: string, signal?: AbortSignal): Promise<OverviewResponse> {
  return api.get<OverviewResponse>(`/api/guilds/${encodeURIComponent(guildId)}/overview`, {
    signal,
  });
}

/** Сводка активности: XP, сообщения, время в голосе и кто сейчас в канале */
export function getActivity(guildId: string, signal?: AbortSignal): Promise<ActivityResponse> {
  return api.get<ActivityResponse>(`/api/guilds/${encodeURIComponent(guildId)}/activity`, {
    signal,
  });
}

/** Права, каналы и роли активного сервера — источник данных для форм */
export function getGuildMeta(guildId: string, signal?: AbortSignal): Promise<GuildMetaResponse> {
  return api.get<GuildMetaResponse>(`/api/guilds/${encodeURIComponent(guildId)}/meta`, { signal });
}

export interface CaseListParams {
  page?: number;
  pageSize?: number;
  type?: CaseType;
  active?: boolean;
  /** Поиск по причине, ID участника или модератора */
  q?: string;
}

/** История кейсов с фильтрами и пагинацией */
export function getCases(
  guildId: string,
  params: CaseListParams = {},
  signal?: AbortSignal,
): Promise<CaseListResponse> {
  return api.get<CaseListResponse>(`/api/guilds/${encodeURIComponent(guildId)}/cases`, {
    query: {
      page: params.page,
      pageSize: params.pageSize,
      type: params.type,
      active: params.active,
      q: params.q,
    },
    signal,
  });
}

/** Скачивание кейсов в CSV по текущим фильтрам */
export function downloadCasesCsv(
  guildId: string,
  params: Omit<CaseListParams, 'page' | 'pageSize'> = {},
  signal?: AbortSignal,
): Promise<DownloadResult> {
  return apiDownload(`/api/guilds/${encodeURIComponent(guildId)}/cases/export`, {
    query: {
      type: params.type,
      active: params.active,
      q: params.q,
    },
    signal,
  });
}

/** История изменений кейса */
export function getCaseEvents(
  guildId: string,
  caseId: number,
  signal?: AbortSignal,
): Promise<CaseEventsResponse> {
  return api.get<CaseEventsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/cases/${caseId}/events`,
    { signal },
  );
}

/** Изменение причины или статуса кейса. Требует права moderate/admin. */
export function updateCase(
  guildId: string,
  caseId: number,
  input: UpdateCaseInput,
  signal?: AbortSignal,
): Promise<CaseResponse> {
  return api.patch<CaseResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/cases/${caseId}`,
    input,
    { signal },
  );
}

/** Поиск участников по нику или ID с пагинацией. Пустой q — весь список. */
export function searchGuildMembers(
  guildId: string,
  query: string,
  page = 1,
  pageSize = 50,
  signal?: AbortSignal,
): Promise<MemberSearchResponse> {
  return api.get<MemberSearchResponse>(`/api/guilds/${encodeURIComponent(guildId)}/members`, {
    query: { q: query, page, pageSize },
    signal,
  });
}

/** Полный профиль участника: роли, варны, заметки и кейсы */
export function getMemberProfile(
  guildId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<MemberProfileResponse> {
  return api.get<MemberProfileResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
    { signal },
  );
}

/**
 * Универсальный вызов действия модерации.
 * Бэкенд возвращает HTTP 200 даже при ok:false — это проверяет вызывающая сторона.
 */
export function performMemberAction(
  guildId: string,
  action: MemberActionType,
  body: MemberActionBody,
): Promise<ActionResult> {
  return api.post<ActionResult>(
    `/api/guilds/${encodeURIComponent(guildId)}/actions/${encodeURIComponent(action)}`,
    body,
  );
}

export function deleteMemberWarn(
  guildId: string,
  userId: string,
  warnId: string,
): Promise<ActionResult> {
  return api.delete<ActionResult>(
    `/api/guilds/${encodeURIComponent(guildId)}/warns/${encodeURIComponent(userId)}/${encodeURIComponent(warnId)}`,
  );
}

export function deleteMemberNote(
  guildId: string,
  userId: string,
  noteId: string,
): Promise<ActionResult> {
  return api.delete<ActionResult>(
    `/api/guilds/${encodeURIComponent(guildId)}/notes/${encodeURIComponent(userId)}/${encodeURIComponent(noteId)}`,
  );
}

/** Очередь апелляций. status=pending — только ожидающие, all — вся история. */
export function getAppeals(
  guildId: string,
  status: 'pending' | 'all',
  signal?: AbortSignal,
): Promise<AppealListResponse> {
  return api.get<AppealListResponse>(`/api/guilds/${encodeURIComponent(guildId)}/appeals`, {
    query: { status },
    signal,
  });
}

/** Одобрение или отклонение апелляции. Требует права ban/admin. */
export function reviewAppeal(
  guildId: string,
  appealId: number,
  approve: boolean,
  comment?: string,
): Promise<AppealReviewResult> {
  return api.post<AppealReviewResult>(
    `/api/guilds/${encodeURIComponent(guildId)}/appeals/${appealId}/review`,
    { approve, comment },
  );
}

/** Аналитика модерации за период */
export function getAnalytics(
  guildId: string,
  days = 30,
  signal?: AbortSignal,
): Promise<ModerationAnalyticsResponse> {
  return api.get<ModerationAnalyticsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/analytics`,
    { query: { days }, signal },
  );
}

/** Тикеты сервера с фильтром по статусу */
export function getTickets(
  guildId: string,
  status?: TicketStatus,
  signal?: AbortSignal,
): Promise<TicketListResponse> {
  return api.get<TicketListResponse>(`/api/guilds/${encodeURIComponent(guildId)}/tickets`, {
    query: { status },
    signal,
  });
}

/** Закрытие тикета из панели (транскрипт сохраняется, канал удаляется) */
export function closeTicket(guildId: string, channelId: string): Promise<TicketCloseResponse> {
  return api.post<TicketCloseResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/tickets/${encodeURIComponent(channelId)}/close`,
  );
}

/** URL HTML-транскрипта тикета для открытия в новой вкладке */
export function ticketTranscriptUrl(guildId: string, channelId: string): string {
  return `/api/guilds/${encodeURIComponent(guildId)}/tickets/${encodeURIComponent(channelId)}/transcript`;
}

/** Экспорт настроек сервера в JSON */
export function exportSettings(guildId: string): Promise<DownloadResult> {
  return apiDownload(`/api/guilds/${encodeURIComponent(guildId)}/settings/export`);
}

/** Импорт настроек из JSON-бандла */
export function importSettings(guildId: string, bundle: unknown): Promise<SettingsBundleResponse> {
  return api.post<SettingsBundleResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/import`,
    bundle,
  );
}

/** Полный бандл настроек сервера. Доступен только администраторам. */
export function getSettings(
  guildId: string,
  signal?: AbortSignal,
): Promise<SettingsBundleResponse> {
  return api.get<SettingsBundleResponse>(`/api/guilds/${encodeURIComponent(guildId)}/settings`, {
    signal,
  });
}

/** Частичное обновление настроек модерации (PATCH /settings/moderation) */
export function updateModerationSettings(
  guildId: string,
  input: ModerationSettingsUpdate,
): Promise<ModerationSettingsResponse> {
  return api.patch<ModerationSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/moderation`,
    input,
  );
}

/** Канал, категории и отдельные события логов. */
export function updateLogSettings(
  guildId: string,
  input: LogSettingsUpdate,
): Promise<LogSettingsResponse> {
  return api.patch<LogSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/logs`,
    input,
  );
}

/** Антирейд и анти-нак. */
export function updateSecuritySettings(
  guildId: string,
  input: SecuritySettingsUpdate,
): Promise<SecuritySettingsResponse> {
  return api.patch<SecuritySettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/security`,
    input,
  );
}

/** Приветствия, автороли, уровни, временные голосовые и тикеты. */
export function updateCommunitySettings(
  guildId: string,
  input: CommunitySettingsUpdate,
): Promise<CommunitySettingsResponse> {
  return api.patch<CommunitySettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/community`,
    input,
  );
}

export function addAutomodWord(guildId: string, word: string): Promise<ModerationSettingsResponse> {
  return api.post<ModerationSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/moderation/words`,
    { word },
  );
}

export function removeAutomodWord(
  guildId: string,
  word: string,
): Promise<ModerationSettingsResponse> {
  return api.delete<ModerationSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/moderation/words/${encodeURIComponent(word)}`,
  );
}

export function addWarnAction(
  guildId: string,
  input: AddWarnActionInput,
): Promise<ModerationSettingsResponse> {
  return api.post<ModerationSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/moderation/warn-actions`,
    input,
  );
}

export function deleteWarnAction(guildId: string, id: string): Promise<ModerationSettingsResponse> {
  return api.delete<ModerationSettingsResponse>(
    `/api/guilds/${encodeURIComponent(guildId)}/settings/moderation/warn-actions/${encodeURIComponent(id)}`,
  );
}

/** Завершает серверную сессию. CSRF подставляется клиентом автоматически. */
export function logout(): Promise<{ ok: true }> {
  return api.post<{ ok: true }>('/api/logout');
}
