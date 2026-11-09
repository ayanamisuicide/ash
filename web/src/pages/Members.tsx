import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ServerOff,
  ShieldOff,
  UserRoundSearch,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { getMemberProfile, searchGuildMembers } from '@/api/endpoints';
import type { MemberActionType, MemberSummary } from '@/api/types';
import { ActionModal } from '@/components/members/ActionModal';
import { MemberListItem } from '@/components/members/MemberListItem';
import { MemberProfile } from '@/components/members/MemberProfile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useGuildMeta } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoMemberSearch, getDemoMemberProfile, isDemoGuildId } from '@/lib/demo-data';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';

const MEMBER_PAGE_SIZE = 50;

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

function MembersSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
      <div className="glass-card p-4">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton mt-3 h-10 w-full" />
        <div className="mt-4 space-y-1.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <ProfilePanelSkeleton />
    </div>
  );
}

function ProfilePanelSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка профиля" aria-busy="true">
      <div className="glass-card p-5">
        <div className="flex gap-4">
          <div className="skeleton h-20 w-20 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-5 w-44" />
            <div className="skeleton mt-2 h-3 w-28" />
            <div className="skeleton mt-3 h-6 w-52" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-[72px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-20 rounded-xl" />
      <div className="skeleton h-24 rounded-xl" />
      <div className="glass-card p-4">
        <div className="skeleton h-8 w-full" />
        <div className="skeleton mt-4 h-32 w-full" />
      </div>
    </div>
  );
}

export function MembersPage() {
  usePageTitle('Участники');

  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const storedAccess = useAuthStore((state) => state.access);
  const isDemo = isDemoGuildId(activeGuildId);
  const {
    data: meta,
    isLoading: metaLoading,
    isError: metaError,
    error: metaErrorObject,
    refetch: refetchMeta,
  } = useGuildMeta();

  // meta — самый свежий источник прав, store — резерв, пока запрос не завершён.
  const access = meta?.access ?? storedAccess;
  const canModerate = Boolean(access?.admin || access?.moderate);
  const canKick = Boolean(access?.admin || access?.kick);
  const canBan = Boolean(access?.admin || access?.ban);
  const canManageRoles = Boolean(access?.admin || access?.manageRoles);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<MemberActionType | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  // Поиск с задержкой 300 мс, чтобы не спамить Discord API.
  useEffect(() => {
    const nextQuery = search.trim();
    if (nextQuery === debouncedSearch) return;

    const timer = window.setTimeout(() => {
      setDebouncedSearch(nextQuery);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  // Смена сервера не должна оставлять чужой профиль или открытую модалку.
  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setSelectedId(null);
    setAction(null);
    setActionOpen(false);
  }, [activeGuildId]);

  useEffect(() => {
    setAction(null);
    setActionOpen(false);
  }, [selectedId]);

  const searchTerm = debouncedSearch.trim();

  const searchQuery = useQuery({
    queryKey: ['guild', activeGuildId, 'members', 'list', searchTerm, page],
    queryFn: ({ signal }) => {
      if (isDemo && activeGuild) {
        return Promise.resolve(
          createDemoMemberSearch(activeGuild.id, searchTerm, page, MEMBER_PAGE_SIZE),
        );
      }
      return searchGuildMembers(activeGuildId ?? '', searchTerm, page, MEMBER_PAGE_SIZE, signal);
    },
    enabled: Boolean(activeGuildId) && canModerate,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === activeGuildId ? previousData : undefined,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const profileQuery = useQuery({
    queryKey: ['guild', activeGuildId, 'members', selectedId, isDemo ? 'demo' : 'live'],
    queryFn: ({ signal }) => {
      if (isDemo && selectedId) {
        return Promise.resolve({ ok: true as const, member: getDemoMemberProfile(selectedId) });
      }
      return getMemberProfile(activeGuildId ?? '', selectedId ?? '', signal);
    },
    enabled: Boolean(activeGuildId && selectedId),
    meta: { silent: true },
  });

  const searchItems = searchQuery.data?.items ?? [];
  const totalMembers = searchQuery.data?.total ?? 0;
  const totalPages = searchQuery.data?.pages ?? 1;
  const listPartial = searchQuery.data?.partial ?? false;
  const profile = profileQuery.data?.member ?? null;

  const selectMember = (member: MemberSummary) => {
    setSelectedId(member.id);
  };

  const clearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
  };

  const openAction = (nextAction: MemberActionType) => {
    setAction(nextAction);
    setActionOpen(true);
  };

  const refresh = () => {
    void searchQuery.refetch();
    if (selectedId) void profileQuery.refetch();
  };

  const isRefreshing = searchQuery.isFetching || profileQuery.isFetching;

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="space-y-5 sm:space-y-6"
    >
      <motion.header
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="eyebrow flex items-center gap-2 text-accent">
            <span className="h-px w-5 bg-accent/70" />
            NEXUS / УЧАСТНИКИ
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Участники</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Поиск, профиль, роли и действия модерации в одном месте.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRefreshing && (searchQuery.data || profileQuery.data) ? (
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:inline-flex">
              <Spinner className="h-3 w-3" />
              Обновление…
            </span>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={!activeGuildId || isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Обновить
          </Button>
        </div>
      </motion.header>

      {!activeGuildId ? (
        <EmptyState
          icon={ServerOff}
          title="Сервер не выбран"
          description="Выберите сервер в меню слева. Если список пуст, добавьте бота на сервер и убедитесь, что у вас есть права модератора."
          tone="muted"
        />
      ) : metaLoading && !access ? (
        <MembersSkeleton />
      ) : metaError && !access ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось проверить права"
          description={getErrorMessage(metaErrorObject)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void refetchMeta()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : !canModerate ? (
        <EmptyState
          icon={ShieldOff}
          title="Нет доступа к участникам"
          description="Для раздела нужно право «Заглушать участников» или «Управление сервером»."
          tone="danger"
        />
      ) : (
        <motion.div
          variants={itemVariants}
          className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start"
        >
          <Card className="overflow-hidden lg:sticky lg:top-20">
            <div className="border-b border-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold">Участники</h2>
                </div>
                {searchQuery.data ? (
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    {totalMembers}
                  </span>
                ) : null}
              </div>

              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Имя, ник или ID"
                  aria-label="Поиск участников"
                  className="pl-9 pr-9"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Очистить поиск"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <p className="mt-2 text-[10px] text-muted-foreground">
                Поиск по имени, нику или ID участника
              </p>
            </div>

            <div className="max-h-[440px] overflow-y-auto p-2 lg:max-h-[calc(100vh-24rem)]">
              {searchQuery.isLoading ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="skeleton h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : searchQuery.isError ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs font-semibold text-danger">
                    Не удалось загрузить участников
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {getErrorMessage(searchQuery.error)}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => void searchQuery.refetch()}
                  >
                    <RefreshCw />
                    Повторить
                  </Button>
                </div>
              ) : searchItems.length === 0 ? (
                <div className="px-3 py-10 text-center">
                  <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                    <UserRoundSearch className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold">
                    {searchTerm ? 'Ничего не найдено' : 'Участники не загрузились'}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {searchTerm
                      ? 'Попробуйте другой ник или точный ID участника.'
                      : 'Discord ещё не отдал список. Нажмите «Обновить» или попробуйте позже.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {searchItems.map((member) => (
                    <MemberListItem
                      key={member.id}
                      member={member}
                      selected={selectedId === member.id}
                      onSelect={selectMember}
                    />
                  ))}
                </div>
              )}

              {listPartial && !searchQuery.isLoading && searchItems.length > 0 ? (
                <p className="mx-1 mt-2 rounded-lg border border-warning/20 bg-warning/[0.06] px-3 py-2 text-[10px] leading-relaxed text-warning/90">
                  Discord отдал не всех участников — список может быть неполным. Нажмите «Обновить»,
                  чтобы попробовать ещё раз.
                </p>
              ) : null}
            </div>

            {searchQuery.data && totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || searchQuery.isFetching}
                  className="gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Назад
                </Button>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  Стр. {searchQuery.data.page} из {totalPages}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={searchQuery.data.page >= totalPages || searchQuery.isFetching}
                  className="gap-1"
                >
                  Вперёд
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </Card>

          <div className="min-w-0">
            {profile ? (
              <>
                {profileQuery.isError ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-4 py-2.5 text-xs text-danger">
                    <span>Не удалось обновить профиль: {getErrorMessage(profileQuery.error)}</span>
                    <button
                      type="button"
                      onClick={() => void profileQuery.refetch()}
                      className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      Повторить
                    </button>
                  </div>
                ) : null}
                <MemberProfile
                  guildId={activeGuildId}
                  profile={profile}
                  canModerate={canModerate && !isDemo}
                  canKick={canKick && !isDemo}
                  canBan={canBan && !isDemo}
                  canManageRoles={canManageRoles && !isDemo}
                  onAction={openAction}
                />
              </>
            ) : profileQuery.isLoading ? (
              <ProfilePanelSkeleton />
            ) : profileQuery.isError ? (
              <EmptyState
                icon={WifiOff}
                title="Не удалось загрузить профиль"
                description={getErrorMessage(profileQuery.error)}
                tone="danger"
                action={
                  <Button type="button" onClick={() => void profileQuery.refetch()}>
                    <RefreshCw />
                    Повторить
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={UserRoundSearch}
                title="Выберите участника"
                description="Найдите участника слева, чтобы открыть профиль, роли и историю наказаний."
                tone="muted"
              />
            )}
          </div>
        </motion.div>
      )}

      <ActionModal
        open={actionOpen}
        onOpenChange={setActionOpen}
        guildId={activeGuildId}
        member={profile}
        action={action}
        roles={meta?.roles ?? []}
      />
    </motion.div>
  );
}
