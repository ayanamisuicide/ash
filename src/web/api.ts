import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BotClient } from '../core/client.js';
import {
  caseTypeLabel,
  getCase,
  isCaseType,
  listCasesForExport,
  searchCases,
  type ModCase,
} from '../lib/cases.js';
import { casesToCsv } from '../lib/casesCsv.js';
import { getAppeal, listAppeals, type Appeal, type AppealStatus } from '../lib/appeals.js';
import { ChannelType, type Guild } from 'discord.js';
import {
  banFromPanel,
  clearWarnsFromPanel,
  editCaseFromPanel,
  kickFromPanel,
  muteFromPanel,
  noteFromPanel,
  removeNoteFromPanel,
  removeWarnFromPanel,
  reviewAppeal,
  roleFromPanel,
  timeoutFromPanel,
  unbanFromPanel,
  unmuteFromPanel,
  untimeoutFromPanel,
  warnFromPanel,
} from './actions.js';
import {
  invalidateAccessCache,
  listAccessibleGuilds,
  requireAdmin,
  resolveGuildAccess,
  type GuildAccess,
} from './auth.js';
import {
  getActivityOverview,
  getBotInfo,
  getMemberProfile,
  getOverview,
  searchMembers,
} from './data.js';
import { avatarUrl, guildIconUrl } from './discord.js';
import { HttpError, clearCookie, readJson, sendError, sendJson } from './http.js';
import { csrfMatches, type Session, type SessionStore } from './sessions.js';
import {
  addAutomodWordFromPanel,
  addWarnActionFromPanel,
  clearWarnActionsFromPanel,
  getSettingsBundle,
  removeAutomodWordFromPanel,
  removeWarnActionFromPanel,
  updateCommunityFromPanel,
  updateLogSettings,
  updateModerationSettings,
  updateSecuritySettings,
} from './settings.js';

export interface ApiRequest {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  client: BotClient;
  session: Session | null;
  sessions: SessionStore;
  secureCookies: boolean;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function segmentsOf(rest: string): string[] {
  return rest.split('/').filter(Boolean).map(decodeSegment);
}

function requireSession(session: Session | null): Session {
  if (!session) throw new HttpError(401, 'Требуется авторизация.');
  return session;
}

function requireModerate(access: GuildAccess): void {
  if (!access.admin && !access.moderate) {
    throw new HttpError(403, 'Нужно право «Заглушать участников».');
  }
}

function requireKick(access: GuildAccess): void {
  if (!access.admin && !access.kick) {
    throw new HttpError(403, 'Нужно право «Кикать участников».');
  }
}

function requireBan(access: GuildAccess): void {
  if (!access.admin && !access.ban) {
    throw new HttpError(403, 'Нужно право «Банить участников».');
  }
}

/** Баны — BanMembers, остальные наказания — ModerateMembers. */
function requireAppealReview(access: GuildAccess, guildId: string, appealId: number): void {
  const appeal = getAppeal(guildId, appealId);
  if (!appeal) throw new HttpError(404, 'Апелляция не найдена.');

  const modCase = appeal.caseId ? getCase(guildId, appeal.caseId) : null;
  const requiresBan =
    !modCase || modCase.type === 'ban' || modCase.type === 'tempban' || modCase.type === 'softban';

  if (requiresBan) requireBan(access);
  else requireModerate(access);
}

function requireRoles(access: GuildAccess): void {
  if (!access.admin && !access.manageRoles) {
    throw new HttpError(403, 'Нужно право «Управлять ролями».');
  }
}

function caseDto(guild: Guild, item: ModCase) {
  const user = item.userId ? guild.members.cache.get(item.userId)?.user : null;
  const moderator = guild.members.cache.get(item.moderatorId)?.user ?? null;

  return {
    ...item,
    label: caseTypeLabel(item.type),
    userName: user?.username ?? null,
    moderatorName: moderator?.username ?? null,
  };
}

function caseListDto(guild: Guild, items: ModCase[]) {
  return items.map((item) => caseDto(guild, item));
}

function appealDto(guildId: string, item: Appeal) {
  const punished = item.caseId ? getCase(guildId, item.caseId) : null;
  return {
    ...item,
    caseType: punished?.type ?? null,
    caseReason: punished?.reason ?? null,
  };
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** Фильтры списка кейсов — общие для JSON-выдачи и CSV-экспорта. */
function parseCaseFilters(url: URL) {
  const typeRaw = url.searchParams.get('type');
  if (typeRaw && !isCaseType(typeRaw)) throw new HttpError(400, 'Неверный тип кейса.');

  const activeRaw = url.searchParams.get('active');
  let active: boolean | null = null;
  if (activeRaw === 'true') active = true;
  if (activeRaw === 'false') active = false;

  return {
    type: typeRaw && isCaseType(typeRaw) ? typeRaw : null,
    userId: url.searchParams.get('userId'),
    moderatorId: url.searchParams.get('moderatorId'),
    active,
    query: url.searchParams.get('q'),
  };
}

function parseStatus(value: string | null): AppealStatus | undefined {
  if (!value || value === 'all') return undefined;
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  throw new HttpError(400, 'Неверный статус апелляции.');
}

async function handleGuildRoute(
  ctx: ApiRequest,
  session: Session,
  guildId: string,
  segments: string[],
): Promise<void> {
  const access = await resolveGuildAccess(ctx.client, session.user.id, guildId);
  const guild = access.guild;

  const section = segments[0];
  if (!section) throw new HttpError(404, 'Не найдено.');

  if (section === 'overview' && segments.length === 1) {
    if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
    const overview = getOverview(guild, ctx.client);
    sendJson(ctx.res, 200, {
      ok: true,
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild.id, guild.icon, 128),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      },
      access: {
        admin: access.admin,
        moderate: access.moderate,
        kick: access.kick,
        ban: access.ban,
        manageMessages: access.manageMessages,
        manageRoles: access.manageRoles,
      },
      ...overview,
      recentCases: caseListDto(guild, overview.recentCases),
    });
    return;
  }

  if (section === 'meta' && segments.length === 1) {
    if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
    sendJson(ctx.res, 200, {
      ok: true,
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild.id, guild.icon, 128),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      },
      access: {
        admin: access.admin,
        moderate: access.moderate,
        kick: access.kick,
        ban: access.ban,
        manageMessages: access.manageMessages,
        manageRoles: access.manageRoles,
      },
      // Ветки лежат в channels.cache, но у них нет position — для выбора каналов
      // в настройках они не нужны.
      channels: [...guild.channels.cache.values()]
        .filter((channel) => !channel.isThread())
        .sort((a, b) => a.position - b.position)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: channel.position,
          isText: channel.isTextBased(),
          isVoice: channel.isVoiceBased(),
          isCategory: channel.type === ChannelType.GuildCategory,
        })),
      roles: [...guild.roles.cache.values()]
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          managed: role.managed,
          isEveryone: role.id === guild.id,
        })),
      bot: {
        ...getBotInfo(ctx.client),
        nickname: guild.members.me?.displayName ?? null,
      },
    });
    return;
  }

  if (section === 'cases') {
    if (segments.length === 1) {
      if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');

      const result = searchCases(guild.id, {
        page: parsePositiveInt(ctx.url.searchParams.get('page'), 1),
        pageSize: parsePositiveInt(ctx.url.searchParams.get('pageSize'), 25),
        ...parseCaseFilters(ctx.url),
      });

      sendJson(ctx.res, 200, {
        ok: true,
        items: caseListDto(guild, result.items),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        pages: result.pages,
      });
      return;
    }

    // CSV-экспорт по тем же фильтрам, что и список. Отдаём до разбора
    // числового id, иначе «export» попадёт в проверку номера кейса.
    if (segments.length === 2 && segments[1] === 'export') {
      if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');

      const items = listCasesForExport(guild.id, parseCaseFilters(ctx.url));
      ctx.res.statusCode = 200;
      ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      ctx.res.setHeader(
        'Content-Disposition',
        `attachment; filename="nexus-cases-${guild.id}-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      ctx.res.setHeader('Cache-Control', 'no-store');
      ctx.res.end(`\uFEFF${casesToCsv(items)}`);
      return;
    }

    if (segments.length === 2) {
      const caseId = Number(segments[1]);
      if (!Number.isInteger(caseId) || caseId <= 0)
        throw new HttpError(400, 'Неверный номер кейса.');

      if (ctx.req.method === 'GET') {
        const item = getCase(guild.id, caseId);
        if (!item) throw new HttpError(404, 'Кейс не найден.');
        sendJson(ctx.res, 200, { ok: true, case: caseDto(guild, item) });
        return;
      }

      if (ctx.req.method === 'PATCH') {
        requireModerate(access);
        const body = await readJson(ctx.req);
        const updated = editCaseFromPanel(guild.id, caseId, body);
        sendJson(ctx.res, 200, { ok: true, case: caseDto(guild, updated) });
        return;
      }
    }

    throw new HttpError(405, 'Метод не поддерживается.');
  }

  if (section === 'activity' && segments.length === 1) {
    if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
    // Доступ уже ограничен resolveGuildAccess: любой модератор сервера видит
    // те же данные, что и на обзоре, без требования ModerateMembers.
    sendJson(ctx.res, 200, { ok: true, ...getActivityOverview(guild) });
    return;
  }

  if (section === 'members') {
    if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');

    if (segments.length === 1) {
      requireModerate(access);
      const query = ctx.url.searchParams.get('q') ?? '';
      const page = Number(ctx.url.searchParams.get('page') ?? 1);
      const pageSize = Number(ctx.url.searchParams.get('pageSize') ?? 50);
      const result = await searchMembers(guild, query, { page, pageSize });
      sendJson(ctx.res, 200, { ok: true, ...result });
      return;
    }

    if (segments.length === 2) {
      requireModerate(access);
      const profile = await getMemberProfile(guild, segments[1] ?? '');
      sendJson(ctx.res, 200, {
        ok: true,
        member: {
          ...profile,
          cases: caseListDto(guild, profile.cases),
          activeCases: caseListDto(guild, profile.activeCases),
        },
      });
      return;
    }

    throw new HttpError(404, 'Не найдено.');
  }

  if (section === 'appeals') {
    if (segments.length === 1 && ctx.req.method === 'GET') {
      const status = parseStatus(ctx.url.searchParams.get('status'));
      const items = listAppeals(guild.id, status).map((item) => appealDto(guild.id, item));
      sendJson(ctx.res, 200, { ok: true, items });
      return;
    }

    if (segments.length === 3 && segments[2] === 'review' && ctx.req.method === 'POST') {
      const appealId = Number(segments[1]);
      if (!Number.isInteger(appealId) || appealId <= 0) {
        throw new HttpError(400, 'Неверный номер апелляции.');
      }
      requireAppealReview(access, guild.id, appealId);
      const body = await readJson(ctx.req);
      if (typeof body.approve !== 'boolean') {
        throw new HttpError(400, 'Поле approve должно быть boolean.');
      }
      let comment: string | null = null;
      if (body.comment !== undefined && body.comment !== null) {
        if (typeof body.comment !== 'string') {
          throw new HttpError(400, 'Комментарий должен быть строкой.');
        }
        if (body.comment.length > 500) {
          throw new HttpError(400, 'Комментарий длиннее 500 символов.');
        }
        comment = body.comment;
      }
      const result = await reviewAppeal(
        guild,
        { id: session.user.id, tag: session.user.username },
        appealId,
        body.approve,
        comment,
      );
      sendJson(ctx.res, 200, result);
      return;
    }

    throw new HttpError(405, 'Метод не поддерживается.');
  }

  if (section === 'settings') {
    if (segments.length === 1) {
      requireAdmin(access);
      if (ctx.req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
      sendJson(ctx.res, 200, { ok: true, ...getSettingsBundle(guild) });
      return;
    }

    const area = segments[1];

    if (area === 'moderation') {
      requireAdmin(access);

      if (segments.length === 2 && ctx.req.method === 'PATCH') {
        const body = await readJson(ctx.req);
        sendJson(ctx.res, 200, {
          ok: true,
          moderation: updateModerationSettings(guild, body),
        });
        return;
      }

      if (segments[2] === 'words') {
        if (segments.length === 3 && ctx.req.method === 'POST') {
          const body = await readJson(ctx.req);
          sendJson(ctx.res, 200, {
            ok: true,
            moderation: addAutomodWordFromPanel(guild, body),
          });
          return;
        }
        if (segments.length === 4 && ctx.req.method === 'DELETE') {
          sendJson(ctx.res, 200, {
            ok: true,
            moderation: removeAutomodWordFromPanel(guild, segments[3] ?? ''),
          });
          return;
        }
      }

      if (segments[2] === 'warn-actions') {
        if (segments.length === 3 && ctx.req.method === 'POST') {
          const body = await readJson(ctx.req);
          sendJson(ctx.res, 200, {
            ok: true,
            moderation: addWarnActionFromPanel(guild, body),
          });
          return;
        }
        if (segments.length === 3 && ctx.req.method === 'DELETE') {
          sendJson(ctx.res, 200, {
            ok: true,
            moderation: clearWarnActionsFromPanel(guild.id),
          });
          return;
        }
        if (segments.length === 4 && ctx.req.method === 'DELETE') {
          sendJson(ctx.res, 200, {
            ok: true,
            moderation: removeWarnActionFromPanel(guild.id, segments[3] ?? ''),
          });
          return;
        }
      }

      throw new HttpError(405, 'Метод не поддерживается.');
    }

    if (area === 'logs' && segments.length === 2 && ctx.req.method === 'PATCH') {
      requireAdmin(access);
      const body = await readJson(ctx.req);
      sendJson(ctx.res, 200, { ok: true, logs: updateLogSettings(guild, body) });
      return;
    }

    if (area === 'security' && segments.length === 2 && ctx.req.method === 'PATCH') {
      requireAdmin(access);
      const body = await readJson(ctx.req);
      sendJson(ctx.res, 200, { ok: true, security: updateSecuritySettings(guild, body) });
      return;
    }

    if (area === 'community' && segments.length === 2 && ctx.req.method === 'PATCH') {
      requireAdmin(access);
      const body = await readJson(ctx.req);
      sendJson(ctx.res, 200, { ok: true, community: updateCommunityFromPanel(guild, body) });
      return;
    }

    throw new HttpError(404, 'Не найдено.');
  }

  if (section === 'actions' && segments.length === 2 && ctx.req.method === 'POST') {
    const action = segments[1];
    const body = await readJson(ctx.req);

    if (action === 'warn') {
      requireModerate(access);
      sendJson(ctx.res, 200, await warnFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'timeout') {
      requireModerate(access);
      sendJson(ctx.res, 200, await timeoutFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'untimeout') {
      requireModerate(access);
      sendJson(ctx.res, 200, await untimeoutFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'mute') {
      requireModerate(access);
      sendJson(ctx.res, 200, await muteFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'unmute') {
      requireModerate(access);
      sendJson(ctx.res, 200, await unmuteFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'clearwarns') {
      requireModerate(access);
      sendJson(ctx.res, 200, await clearWarnsFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'note') {
      requireModerate(access);
      sendJson(ctx.res, 200, await noteFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'kick') {
      requireKick(access);
      sendJson(ctx.res, 200, await kickFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'ban') {
      requireBan(access);
      sendJson(ctx.res, 200, await banFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'unban') {
      requireBan(access);
      sendJson(ctx.res, 200, await unbanFromPanel(guild, session.user.id, body));
      return;
    }
    if (action === 'role') {
      requireRoles(access);
      sendJson(ctx.res, 200, await roleFromPanel(guild, session.user.id, body));
      return;
    }

    throw new HttpError(404, 'Неизвестное действие.');
  }

  if (section === 'notes' && segments.length === 3 && ctx.req.method === 'DELETE') {
    requireModerate(access);
    sendJson(
      ctx.res,
      200,
      await removeNoteFromPanel(guild, session.user.id, segments[1] ?? '', segments[2] ?? ''),
    );
    return;
  }

  if (section === 'warns' && segments.length === 3 && ctx.req.method === 'DELETE') {
    requireModerate(access);
    sendJson(
      ctx.res,
      200,
      await removeWarnFromPanel(guild, session.user.id, segments[1] ?? '', segments[2] ?? ''),
    );
    return;
  }

  throw new HttpError(404, 'Не найдено.');
}

export async function handleApi(ctx: ApiRequest): Promise<void> {
  const { req, res, url, client, sessions, session } = ctx;

  try {
    if (url.pathname === '/api/status') {
      // Служебный эндпоинт: без сессии отдаём только факт работоспособности,
      // чтобы не раскрывать тег/ID бота и число серверов.
      if (req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
      if (!session) {
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 200, { ok: true, ...getBotInfo(client) });
      return;
    }

    if (url.pathname === '/api/me') {
      if (req.method !== 'GET') throw new HttpError(405, 'Метод не поддерживается.');
      const current = requireSession(session);
      const guilds = await listAccessibleGuilds(client, current.user.id);
      sendJson(res, 200, {
        ok: true,
        authenticated: true,
        user: {
          id: current.user.id,
          username: current.user.username,
          displayName: current.user.globalName ?? current.user.username,
          avatarUrl: avatarUrl(current.user, 128),
        },
        csrf: current.csrf,
        guilds,
        bot: getBotInfo(client),
      });
      return;
    }

    if (url.pathname === '/api/logout') {
      const current = requireSession(session);
      if (req.method !== 'POST') throw new HttpError(405, 'Метод не поддерживается.');
      const token = req.headers['x-csrf-token'];
      if (!csrfMatches(current, token)) {
        throw new HttpError(403, 'Неверный CSRF-токен. Обновите страницу.');
      }
      sessions.destroy(current.id);
      invalidateAccessCache(current.user.id);
      clearCookie(res, 'pp_sid', ctx.secureCookies);
      sendJson(res, 200, { ok: true });
      return;
    }

    const current = requireSession(session);

    if (
      url.pathname.startsWith('/api/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '')
    ) {
      const token = req.headers['x-csrf-token'];
      if (!csrfMatches(current, token)) {
        throw new HttpError(403, 'Неверный CSRF-токен. Обновите страницу.');
      }
    }

    const guildMatch = /^\/api\/guilds\/(\d{17,20})(\/.*)?$/.exec(url.pathname);
    if (guildMatch) {
      const guildId = guildMatch[1] ?? '';
      await handleGuildRoute(ctx, current, guildId, segmentsOf(guildMatch[2] ?? ''));
      return;
    }

    throw new HttpError(404, 'Не найдено.');
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(res, error.status, error.message);
      return;
    }
    console.error('[web] ошибка API:', error);
    sendError(res, 500, 'Внутренняя ошибка сервера.');
  }
}
