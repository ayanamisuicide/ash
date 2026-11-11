import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  Download,
  FlaskConical,
  RefreshCw,
  ScrollText,
  ServerOff,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Upload,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { exportSettings, getSettings, importSettings } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { CommunitySettings } from '@/components/settings/CommunitySettings';
import { LogsSettings } from '@/components/settings/LogsSettings';
import { ModerationSettings } from '@/components/settings/ModerationSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { useGuildMeta } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoMeta, createDemoSettings } from '@/lib/demo-settings';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

type SettingsTab = 'moderation' | 'logs' | 'security' | 'community';

interface SettingsTabItem {
  key: SettingsTab;
  label: string;
  icon: LucideIcon;
}

const TABS: SettingsTabItem[] = [
  { key: 'moderation', label: 'Модерация', icon: ShieldCheck },
  { key: 'logs', label: 'Логи', icon: ScrollText },
  { key: 'security', label: 'Безопасность', icon: Shield },
  { key: 'community', label: 'Сообщество', icon: Users },
];

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

function SettingsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка настроек" aria-busy="true">
      <div className="skeleton h-10 w-full max-w-md rounded-xl" />
      <div className="glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-xl" />
          <div className="flex-1">
            <div className="skeleton h-3.5 w-40" />
            <div className="skeleton mt-2 h-2.5 w-64" />
          </div>
          <div className="skeleton h-6 w-10 rounded-full" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
        <div className="skeleton mt-4 h-10 w-full" />
      </div>
      <div className="glass-card p-5">
        <div className="skeleton h-3.5 w-32" />
        <div className="skeleton mt-4 h-10 w-full" />
        <div className="skeleton mt-3 h-20 w-full" />
      </div>
    </div>
  );
}

export function SettingsPage() {
  usePageTitle('Настройки');

  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const storedAccess = useAuthStore((state) => state.access);
  const isDemo = import.meta.env.DEV && Boolean(activeGuildId?.startsWith('demo-'));
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: SettingsTab = TABS.some((item) => item.key === requestedTab)
    ? (requestedTab as SettingsTab)
    : 'moderation';
  const setTab = (next: SettingsTab): void => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const metaQuery = useGuildMeta({ enabled: !isDemo });
  const { isLoading: metaLoading, isError: metaError, error: metaErrorObject } = metaQuery;

  const meta = isDemo && activeGuild ? createDemoMeta(activeGuild) : metaQuery.data;
  // meta — самый свежий источник прав, store — резерв, пока запрос не завершён.
  const access = meta?.access ?? storedAccess;
  const canAdmin = Boolean(access?.admin) || (isDemo && activeGuild?.level === 'admin');

  const settingsQuery = useQuery({
    queryKey: ['guild', activeGuildId, 'settings'],
    queryFn: ({ signal }) =>
      isDemo && activeGuild
        ? Promise.resolve(createDemoSettings(activeGuild))
        : getSettings(activeGuildId ?? '', signal),
    enabled: Boolean(activeGuildId && canAdmin),
    meta: { silent: true },
  });

  const isRefreshing = metaQuery.isFetching || settingsQuery.isFetching;

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importBundle, setImportBundle] = useState<unknown | null>(null);
  const [importName, setImportName] = useState('');

  const exportMutation = useMutation({
    mutationFn: () => {
      if (!activeGuildId) throw new Error('Сервер не выбран.');
      return exportSettings(activeGuildId);
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'nexus-settings.json';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Настройки экспортированы');
    },
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!activeGuildId) throw new Error('Сервер не выбран.');
      if (!importBundle) throw new Error('Файл не выбран.');
      return importSettings(activeGuildId, importBundle);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['guild', activeGuildId, 'settings'], data);
      void queryClient.invalidateQueries({ queryKey: ['guild', activeGuildId] });
      toast.success('Настройки импортированы', 'Проверьте разделы и сохраните правки.');
      setImportBundle(null);
      setImportName('');
    },
  });

  const pickImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Ожидается JSON-объект с настройками.');
      }
      importMutation.reset();
      setImportBundle(parsed);
      setImportName(file.name);
    } catch (error) {
      toast.error('Не удалось прочитать файл', getErrorMessage(error));
    }
  };

  const refresh = () => {
    if (!isDemo) void metaQuery.refetch();
    if (canAdmin) void settingsQuery.refetch();
  };

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
            NEXUS / НАСТРОЙКИ
          </p>
          <h1 className="mt-2 text-gradient text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
            Настройки
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Модерация, логи, безопасность и сообщество.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRefreshing && (meta || settingsQuery.data) ? (
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
            disabled={!canAdmin || isDemo || exportMutation.isPending}
            className="gap-2"
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
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAdmin || isDemo || importMutation.isPending}
            className="gap-2"
          >
            <Upload className="h-3.5 w-3.5" />
            Импорт
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              void pickImportFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

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
        <SettingsSkeleton />
      ) : metaError && !access ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось проверить права"
          description={getErrorMessage(metaErrorObject)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void metaQuery.refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : !canAdmin ? (
        <EmptyState
          icon={ShieldOff}
          title="Нужно право «Управление сервером»"
          description="Раздел настроек доступен только администраторам этого сервера."
          tone="danger"
        />
      ) : settingsQuery.isLoading ? (
        <SettingsSkeleton />
      ) : settingsQuery.isError && !settingsQuery.data ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось загрузить настройки"
          description={getErrorMessage(settingsQuery.error)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void settingsQuery.refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : settingsQuery.data ? (
        <motion.div variants={itemVariants} className="space-y-4">
          {settingsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-4 py-2.5 text-xs text-danger">
              <span>Не удалось обновить настройки: {getErrorMessage(settingsQuery.error)}</span>
              <button
                type="button"
                onClick={() => void settingsQuery.refetch()}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Повторить
              </button>
            </div>
          ) : null}

          <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
            <TabsList className="w-full" aria-label="Разделы настроек">
              {TABS.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger key={item.key} value={item.key}>
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {isDemo ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/[0.06] px-4 py-3 text-xs leading-relaxed text-warning/90">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Демо-режим: настройки показаны для примера. Сохранение и применение изменений
                отключены.
              </span>
            </div>
          ) : null}

          <fieldset disabled={isDemo} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {/* Все панели остаются смонтированными: смена вкладки не теряет черновик. */}
            <div className={tab === 'moderation' ? 'animate-tab-in' : 'hidden'}>
              <ModerationSettings
                key={`${activeGuildId}:moderation`}
                guildId={activeGuildId}
                settings={settingsQuery.data.moderation}
                channels={meta?.channels ?? []}
                roles={meta?.roles ?? []}
              />
            </div>
            <div className={tab === 'logs' ? 'animate-tab-in' : 'hidden'}>
              <LogsSettings
                key={`${activeGuildId}:logs`}
                guildId={activeGuildId}
                settings={settingsQuery.data.logs}
                catalog={settingsQuery.data.catalog}
                channels={meta?.channels ?? []}
              />
            </div>
            <div className={tab === 'security' ? 'animate-tab-in' : 'hidden'}>
              <SecuritySettings
                key={`${activeGuildId}:security`}
                guildId={activeGuildId}
                settings={settingsQuery.data.security}
              />
            </div>
            <div className={tab === 'community' ? 'animate-tab-in' : 'hidden'}>
              <CommunitySettings
                key={`${activeGuildId}:community`}
                guildId={activeGuildId}
                guildName={meta?.guild.name ?? 'Сервер'}
                settings={settingsQuery.data.community}
                channels={meta?.channels ?? []}
                roles={meta?.roles ?? []}
              />
            </div>
          </fieldset>

          <div className="flex items-center justify-center gap-2 pb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
            <Settings2 className="h-3 w-3" />
            изменения применяются после сохранения
          </div>
        </motion.div>
      ) : null}

      <Modal
        open={Boolean(importBundle)}
        onOpenChange={(open) => {
          if (!open && !importMutation.isPending) {
            setImportBundle(null);
            setImportName('');
          }
        }}
        title="Импортировать настройки?"
        description={importName || undefined}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setImportBundle(null);
                setImportName('');
              }}
              disabled={importMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? <Spinner /> : <Upload />}
              {importMutation.isPending ? 'Применяем…' : 'Импортировать'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/20 bg-warning/[0.06] px-3.5 py-3">
            <Upload className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-warning/90">
              Настройки модерации, логов, безопасности и сообщества из файла заменят текущие. Каналы
              и роли должны существовать на этом сервере — иначе импорт вернёт ошибку.
            </p>
          </div>

          {importMutation.isError ? (
            <p className="rounded-lg border border-danger/20 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
              {getErrorMessage(importMutation.error)}
            </p>
          ) : null}
        </div>
      </Modal>
    </motion.div>
  );
}
