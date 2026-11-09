import { motion, useReducedMotion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LogOut, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { GuildAvatar } from '@/components/layout/GuildAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { useLogout } from '@/hooks/useLogout';
import { APP_VERSION } from '@/lib/constants';
import { formatMembers, getInitials, pingTone } from '@/lib/format';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';

interface SidebarContentProps {
  instance: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

function GuildSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const guilds = useAuthStore((state) => state.guilds);
  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const setActiveGuild = useAuthStore((state) => state.setActiveGuild);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const selectGuild = (guildId: string) => {
    if (guildId !== activeGuildId) {
      setActiveGuild(guildId);
      // Сбрасываем только данные, привязанные к guildId.
      // Сессию ['session', 'me'] трогать нельзя: её рефетч при недоступном API
      // ошибочно разлогинивал пользователя.
      void queryClient.invalidateQueries({ queryKey: ['guild'] });
      navigate('/dashboard');
    }
    onNavigate?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={guilds.length === 0}>
        <button
          type="button"
          className="focus-ring group flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2.5 text-left transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-accent/25 hover:bg-white/[0.055] disabled:cursor-default disabled:opacity-60"
        >
          {activeGuild ? (
            <GuildAvatar guild={activeGuild} size="lg" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-white/[0.05]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {activeGuild?.name ?? 'Нет серверов'}
            </p>
            <p className="mt-1 truncate text-[10px] leading-none text-muted-foreground">
              {activeGuild ? formatMembers(activeGuild.memberCount) : 'Добавьте бота на сервер'}
            </p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[248px]">
        <DropdownMenuLabel>Ваши серверы</DropdownMenuLabel>
        {guilds.map((guild) => (
          <DropdownMenuItem
            key={guild.id}
            onSelect={() => selectGuild(guild.id)}
            className="gap-2.5 py-2.5"
          >
            <GuildAvatar guild={guild} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{guild.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMembers(guild.memberCount)}
              </p>
            </div>
            {guild.id === activeGuildId ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {guilds.length === 0 ? (
          <p className="px-2.5 py-3 text-xs leading-relaxed text-muted-foreground">
            У вас пока нет серверов, где бот видит модераторские права.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Navigation({ instance, onNavigate }: SidebarContentProps) {
  const activeGuild = useAuthStore(selectActiveGuild);
  const canAdmin = activeGuild?.level === 'admin';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || canAdmin);
  const reduceMotion = useReducedMotion();
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34 };

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4 no-scrollbar" aria-label="Основная навигация">
      <p className="eyebrow mb-2 px-3">Навигация</p>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end
            onClick={onNavigate}
            className="focus-ring group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/[0.045] hover:text-foreground"
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId={`sidebar-pill-${instance}`}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/[0.20] via-accent/[0.13] to-accent/[0.07]"
                    transition={pillTransition}
                  />
                ) : null}
                {isActive ? (
                  <motion.span
                    layoutId={`sidebar-line-${instance}`}
                    className="absolute left-0.5 top-2.5 h-5 w-[2px] rounded-full bg-accent-soft"
                    transition={pillTransition}
                  />
                ) : null}
                <item.icon
                  className={cn(
                    'relative z-10 h-[18px] w-[18px] shrink-0 transition-[transform,color,filter] duration-200 group-hover:translate-x-0.5 group-hover:scale-105',
                    isActive
                      ? 'scale-110 text-accent-soft drop-shadow-[0_0_8px_rgba(102,115,255,0.45)]'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span
                  className={cn(
                    'relative z-10 transition-transform duration-200 group-hover:translate-x-0.5',
                    isActive && 'text-accent-soft',
                  )}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function SystemStatus() {
  const bot = useAuthStore((state) => state.bot);
  const tone = bot ? pingTone(bot.ping) : null;

  const toneText =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-muted-foreground';
  const toneDot =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-muted-foreground';

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.035]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Система
        </span>
        <span className={cn('flex items-center gap-1.5 text-[10px] font-semibold', toneText)}>
          <span className="relative flex h-1.5 w-1.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                toneDot,
              )}
            />
            <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', toneDot)} />
          </span>
          {tone ? 'онлайн' : 'нет данных'}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Пинг бота{' '}
        <span className="font-mono text-foreground/80">{bot ? `${bot.ping} ms` : '—'}</span>
      </p>
    </div>
  );
}

function UserCard() {
  const user = useAuthStore((state) => state.user);
  const activeGuild = useAuthStore(selectActiveGuild);
  const logout = useLogout();

  const role = activeGuild?.level === 'admin' ? 'Администратор' : 'Модератор';
  const displayName = user?.displayName ?? 'Пользователь';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus-ring group flex w-full items-center gap-2.5 rounded-xl border border-transparent p-1.5 text-left transition-colors duration-150 hover:border-white/[0.07] hover:bg-white/[0.04]"
        >
          <Avatar
            className="h-9 w-9 rounded-xl transition-transform duration-200 group-hover:scale-105"
            aria-hidden="true"
          >
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold leading-tight">{displayName}</p>
            <p className="mt-1 truncate text-[10px] leading-none text-muted-foreground">{role}</p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-[228px]">
        <DropdownMenuLabel>Аккаунт</DropdownMenuLabel>
        <div className="px-2.5 pb-2">
          <p className="truncate text-[13px] font-semibold">{displayName}</p>
          {user ? (
            <p className="truncate text-[11px] text-muted-foreground">@{user.username}</p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate()}
          disabled={logout.isPending}
          className="text-danger focus:bg-danger/10 focus:text-danger"
        >
          <LogOut className="h-4 w-4" />
          {logout.isPending ? 'Выходим…' : 'Выйти'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ instance, onNavigate }: SidebarContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[72px] shrink-0 items-center justify-between px-4">
        <Logo />
        {instance === 'mobile' ? (
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              aria-label="Закрыть меню"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        ) : null}
      </div>

      <div className="px-3 pb-4">
        <GuildSwitcher onNavigate={onNavigate} />
      </div>

      <Navigation instance={instance} onNavigate={onNavigate} />

      <div className="shrink-0 space-y-3 border-t border-white/[0.06] p-3">
        <SystemStatus />
        <UserCard />
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
          NEXUS v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <>
      <aside
        className="glass-sidebar fixed inset-y-0 left-0 z-40 hidden w-[252px] lg:block"
        aria-label="Боковое меню"
      >
        <SidebarContent instance="desktop" />
      </aside>

      <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#07090e]/75 backdrop-blur-sm data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out lg:hidden" />

          <Dialog.Content className="glass-sidebar fixed inset-y-0 left-0 z-50 w-[280px] max-w-[86vw] shadow-modal focus:outline-none data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out lg:hidden">
            <Dialog.Title className="sr-only">Навигация NEXUS</Dialog.Title>
            <Dialog.Description className="sr-only">
              Основное меню панели модерации. Выберите раздел или сервер.
            </Dialog.Description>
            <SidebarContent instance="mobile" onNavigate={() => setSidebarOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
