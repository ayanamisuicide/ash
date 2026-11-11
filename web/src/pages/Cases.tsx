import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  ServerOff,
  ShieldAlert,
  WifiOff,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { downloadCasesCsv, getCases, getMemberProfile } from '@/api/endpoints';
import type { CaseType, MemberActionType, RecentCase } from '@/api/types';
import { EditCaseModal } from '@/components/cases/EditCaseModal';
import { RecentCasesTable } from '@/components/dashboard/RecentCasesTable';
import { ActionModal } from '@/components/members/ActionModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useGuildAccess, useGuildMeta } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { CASE_TYPE_LABELS } from '@/lib/cases';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoCaseList, isDemoGuildId } from '@/lib/demo-data';
import { formatNumber, pluralizeRu } from '@/lib/format';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

const PAGE_SIZE = 25;

type StatusFilter = '' | 'active' | 'closed';

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

function CasesTableSkeleton() {
  return (
    <div
      className="glass-card overflow-hidden"
      role="status"
      aria-label="Загрузка кейсов"
      aria-busy="true"
    >
      <div className="p-5 pb-3">
        <div className="skeleton h-4 w-44" />
        <div className="skeleton mt-2 h-2.5 w-64" />
      </div>
      <div className="border-y border-white/[0.06] bg-white/[0.015] px-5 py-3">
        <div className="skeleton h-2.5 w-full" />
      </div>
      <div className="divide-y divide-white/[0.04]">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-5 py-3.5">
            <div className="skeleton h-3 w-10" />
            <div className="skeleton h-5 w-24" />
            <div className="skeleton h-3 flex-1" />
            <div className="skeleton h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CasesPage() {
  usePageTitle('Кейсы');

  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const isDemo = isDemoGuildId(activeGuildId);
  const access = useGuildAccess();
  const metaQuery = useGuildMeta();
  const canEdit = !isDemo && Boolean(access?.admin || access?.moderate);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState<CaseType | ''>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [selectedCase, setSelectedCase] = useState<RecentCase | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<MemberActionType | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  // Поиск не дёргает API на каждый символ. Страницу сбрасываем вместе
  // с применением запроса, чтобы не делать два запроса подряд.
  useEffect(() => {
    const nextQuery = search.trim();
    if (nextQuery === debouncedSearch) return;

    const timer = window.setTimeout(() => {
      setDebouncedSearch(nextQuery);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const { data, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['guild', activeGuildId, 'cases', page, debouncedSearch, type, status],
    queryFn: ({ signal }) => {
      const params = {
        page,
        pageSize: PAGE_SIZE,
        type: type || undefined,
        active: status === '' ? undefined : status === 'active',
        q: debouncedSearch || undefined,
      };
      if (isDemo && activeGuild) {
        return Promise.resolve(createDemoCaseList(activeGuild.id, params));
      }
      return getCases(activeGuildId ?? '', params, signal);
    },
    enabled: Boolean(activeGuildId),
    // Держим предыдущую страницу при пагинации, но не показываем данные
    // другого сервера, пока грузится новый.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === activeGuildId ? previousData : undefined,
    meta: { silent: true },
  });

  // Бэкенд сам ограничивает страницу последней — синхронизируем состояние.
  // Пока запрос новой страницы в полёте, data ещё содержит предыдущую
  // (placeholderData), поэтому ждём реального ответа, иначе page тут же
  // откатывается на 1 и пагинация «залипает».
  useEffect(() => {
    if (!isPlaceholderData && data && data.page !== page) setPage(data.page);
  }, [data, page, isPlaceholderData]);

  const caseUserId = editOpen ? (selectedCase?.userId ?? null) : null;
  const { data: profileData, isFetching: profileFetching } = useQuery({
    queryKey: ['guild', activeGuildId, 'members', caseUserId],
    queryFn: ({ signal }) => getMemberProfile(activeGuildId ?? '', caseUserId ?? '', signal),
    enabled: Boolean(activeGuildId && caseUserId && !isDemo),
    meta: { silent: true },
  });

  useEffect(() => {
    setSelectedCase(null);
    setEditOpen(false);
    setAction(null);
    setActionOpen(false);
  }, [activeGuildId]);

  const hasFilters = Boolean(search || type || status);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setType('');
    setStatus('');
    setPage(1);
  };

  const exportMutation = useMutation({
    mutationFn: () => {
      if (!activeGuildId) throw new Error('Сервер не выбран.');
      return downloadCasesCsv(activeGuildId, {
        type: type || undefined,
        active: status === '' ? undefined : status === 'active',
        q: debouncedSearch || undefined,
      });
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'nexus-cases.csv';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Экспорт готов', 'CSV-файл с кейсами скачан.');
    },
  });

  const openCase = (item: RecentCase) => {
    setSelectedCase(item);
    setEditOpen(true);
  };

  const handleCaseAction = (next: MemberActionType) => {
    setEditOpen(false);
    setAction(next);
    setActionOpen(true);
  };

  const actionTarget =
    profileData?.member ??
    (selectedCase?.userId
      ? {
          id: selectedCase.userId,
          username: selectedCase.userName ?? selectedCase.userId,
          displayName: selectedCase.userName ?? selectedCase.userId,
          avatarUrl: '',
        }
      : null);

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
            NEXUS / КЕЙСЫ
          </p>
          <h1 className="mt-2 text-gradient text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
            Кейсы
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Полная история наказаний: поиск, фильтры и управление причинами.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {access && !canEdit && !isDemo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">
              <ShieldAlert className="h-3 w-3" />
              только просмотр
            </span>
          ) : null}

          {isFetching && data ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <Spinner className="h-3 w-3" />
              Обновление…
            </span>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => exportMutation.mutate()}
            disabled={!activeGuildId || isDemo || exportMutation.isPending}
            className="gap-2"
            title={
              isDemo ? 'Экспорт доступен на реальном сервере' : 'Скачать CSV по текущим фильтрам'
            }
          >
            {exportMutation.isPending ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Экспорт
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            disabled={!activeGuildId || isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Обновить
          </Button>
        </div>
      </motion.header>

      <motion.div variants={itemVariants} className="glass-card p-3 sm:p-4">
        <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_190px_170px_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Причина, ID участника или модератора"
              aria-label="Поиск кейсов"
              className="pl-9 pr-9"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Очистить поиск"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as CaseType | '');
              setPage(1);
            }}
            aria-label="Тип кейса"
          >
            <option value="">Все типы</option>
            {(Object.keys(CASE_TYPE_LABELS) as CaseType[]).map((value) => (
              <option key={value} value={value}>
                {CASE_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Статус кейса"
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="closed">Закрытые</option>
          </Select>

          <Button
            type="button"
            variant="secondary"
            onClick={resetFilters}
            disabled={!hasFilters}
            className="gap-2 md:justify-self-end"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </Button>
        </div>
      </motion.div>

      {!activeGuildId ? (
        <EmptyState
          icon={ServerOff}
          title="Сервер не выбран"
          description="Выберите сервер в меню слева. Если список пуст, добавьте бота на сервер и убедитесь, что у вас есть права модератора."
          tone="muted"
        />
      ) : isLoading ? (
        <CasesTableSkeleton />
      ) : isError && !data ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось загрузить кейсы"
          description={getErrorMessage(error)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : data ? (
        <motion.div variants={itemVariants} className="space-y-3">
          {isError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-4 py-2.5 text-xs text-danger">
              <span>Не удалось обновить список: {getErrorMessage(error)}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Повторить
              </button>
            </div>
          ) : null}

          <RecentCasesTable
            cases={data.items}
            title="История наказаний"
            description={
              data.total > 0
                ? `${formatNumber(data.total)} ${pluralizeRu(
                    data.total,
                    'кейс',
                    'кейса',
                    'кейсов',
                  )} по выбранным фильтрам`
                : 'По выбранным фильтрам записей нет'
            }
            showAllLink={false}
            onCaseClick={openCase}
            emptyTitle={hasFilters ? 'Ничего не найдено' : undefined}
            emptyDescription={
              hasFilters
                ? 'По выбранным фильтрам кейсов нет. Измените запрос или сбросьте фильтры.'
                : undefined
            }
            emptyAction={
              hasFilters ? (
                <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
                  <RotateCcw />
                  Сбросить фильтры
                </Button>
              ) : undefined
            }
            footer={
              data.total > 0 ? (
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  disabled={isFetching}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          />
        </motion.div>
      ) : null}

      <EditCaseModal
        open={editOpen}
        onOpenChange={setEditOpen}
        guildId={activeGuildId}
        item={selectedCase}
        canEdit={canEdit}
        access={isDemo ? null : access}
        profile={profileData?.member ?? null}
        profileLoading={profileFetching}
        onAction={handleCaseAction}
        demo={isDemo}
      />

      <ActionModal
        open={actionOpen}
        onOpenChange={setActionOpen}
        guildId={activeGuildId}
        member={actionTarget}
        action={action}
        roles={metaQuery.data?.roles ?? []}
      />
    </motion.div>
  );
}
