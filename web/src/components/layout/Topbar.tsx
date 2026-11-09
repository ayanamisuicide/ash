import { useLocation } from 'react-router-dom';
import { Activity, ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { GuildAvatar } from '@/components/layout/GuildAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useLogout } from '@/hooks/useLogout';
import { isDemoGuildId } from '@/lib/demo-data';
import { formatMembers, formatUptime, pingTone } from '@/lib/format';
import { getPageMeta } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';

const pingToneClasses = {
  success: { text: 'text-success', dot: 'bg-success' },
  warning: { text: 'text-warning', dot: 'bg-warning' },
  danger: { text: 'text-danger', dot: 'bg-danger' },
} as const;

export function Topbar() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const bot = useAuthStore((state) => state.bot);
  const activeGuild = useAuthStore(selectActiveGuild);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const logout = useLogout();

  const pageMeta = getPageMeta(location.pathname);
  const isDemo = isDemoGuildId(activeGuild?.id);
  const tone = bot ? pingTone(bot.ping) : 'success';
  const toneClasses = pingToneClasses[tone];
  const role = activeGuild?.level === 'admin' ? 'Администратор' : 'Модератор';
  const displayName = user?.displayName ?? 'Пользователь';

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0c11]/70 backdrop-blur-[14px]">
      <div className="mx-auto flex h-[72px] w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Открыть меню"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {activeGuild ? (
            <GuildAvatar guild={activeGuild} size="md" className="hidden sm:flex" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {activeGuild?.name ?? 'NEXUS'}
              {activeGuild ? ` · ${formatMembers(activeGuild.memberCount)}` : ''}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="truncate text-[14px] font-semibold tracking-[-0.01em] sm:text-[15px]">
                {pageMeta.title}
              </p>
              {activeGuild ? (
                <span className="hidden rounded-md border border-white/[0.07] bg-white/[0.035] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:inline">
                  {activeGuild.level === 'admin' ? 'Админ' : 'Мод'}
                </span>
              ) : null}
              {isDemo ? (
                <span className="hidden rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-warning sm:inline">
                  Демо
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="hidden h-9 cursor-default items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 sm:flex"
              aria-label={bot ? `Пинг бота ${bot.ping} миллисекунд` : 'Пинг бота неизвестен'}
            >
              <Activity
                className={cn('h-3.5 w-3.5', bot ? toneClasses.text : 'text-muted-foreground')}
              />
              <span className="font-mono text-[11px] text-foreground/80">
                {bot ? `${bot.ping} ms` : '— ms'}
              </span>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  bot ? toneClasses.dot : 'bg-muted-foreground',
                )}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px]">
            {bot ? (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{bot.tag ?? 'Discord bot'}</p>
                <p>Пинг WebSocket: {bot.ping} ms</p>
                <p>Аптайм: {formatUptime(bot.uptime)}</p>
                <p>Серверов: {bot.guilds}</p>
              </div>
            ) : (
              'Данные о боте ещё не получены'
            )}
          </TooltipContent>
        </Tooltip>

        <div className="hidden h-7 w-px bg-white/[0.07] sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-2 rounded-xl border border-transparent p-1 pr-1.5 text-left transition-colors duration-150 hover:border-white/[0.08] hover:bg-white/[0.04] sm:gap-2.5 sm:pr-2.5"
            >
              <Avatar className="h-8 w-8 rounded-lg" aria-hidden="true">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback>
                  <User className="h-4 w-4 text-foreground/70" />
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 md:block">
                <p className="max-w-[140px] truncate text-[12px] font-semibold leading-tight">
                  {displayName}
                </p>
                <p className="mt-1 max-w-[140px] truncate text-[10px] leading-none text-muted-foreground">
                  {role}
                </p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180 sm:block" />
              <span className="sr-only">Меню пользователя</span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-[228px]">
            <DropdownMenuLabel>Аккаунт</DropdownMenuLabel>
            <div className="px-2.5 pb-2">
              <p className="truncate text-[13px] font-semibold">{displayName}</p>
              {user ? (
                <p className="truncate text-[11px] text-muted-foreground">@{user.username}</p>
              ) : null}
              {activeGuild ? (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {activeGuild.name}
                </p>
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
      </div>
    </header>
  );
}
