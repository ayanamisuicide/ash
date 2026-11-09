import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  Bot,
  CalendarDays,
  Copy,
  Hammer,
  LogIn,
  Shield,
  ShieldAlert,
  ShieldPlus,
  StickyNote,
  Timer,
  TimerOff,
  Trash2,
  TriangleAlert,
  Undo2,
  UserCheck,
  UserMinus,
  UserX,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { deleteMemberNote, deleteMemberWarn } from '@/api/endpoints';
import type {
  MemberActionType,
  MemberNote,
  MemberProfile as MemberProfileData,
  MemberWarn,
} from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { RoleChip } from '@/components/members/RoleChip';
import { caseTypeBadgeClasses, caseTypeLabel } from '@/lib/cases';
import { formatDateTime, formatRelativeTime, getInitials, pluralizeRu } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

interface MemberProfileProps {
  guildId: string;
  profile: MemberProfileData;
  canModerate: boolean;
  canKick: boolean;
  canBan: boolean;
  canManageRoles: boolean;
  onAction: (action: MemberActionType) => void;
}

type TabKey = 'warns' | 'notes' | 'cases';
type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const BADGE_CLASSES: Record<BadgeTone, string> = {
  accent: 'border-accent/20 bg-accent/10 text-accent',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  muted: 'border-white/[0.08] bg-white/[0.04] text-muted-foreground',
};

function ProfileBadge({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]',
        BADGE_CLASSES[tone],
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[12px] font-medium" title={value}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'secondary',
  disabled = false,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: ComponentProps<typeof Button>['variant'];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="justify-start gap-2"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function TabEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-9 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function MemberProfile({
  guildId,
  profile,
  canModerate,
  canKick,
  canBan,
  canManageRoles,
  onAction,
}: MemberProfileProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('warns');

  useEffect(() => {
    setTab('warns');
  }, [profile.id]);

  const deleteWarnMutation = useMutation({
    mutationFn: (warnId: string) => deleteMemberWarn(guildId, profile.id, warnId),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('Не удалось удалить варн', result.message);
        return;
      }
      toast.success('Варн удалён', result.message);
      void queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteMemberNote(guildId, profile.id, noteId),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('Не удалось удалить заметку', result.message);
        return;
      }
      toast.success('Заметка удалена', result.message);
      void queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
  });

  const copyId = async () => {
    if (!navigator.clipboard) {
      toast.error('Буфер обмена недоступен', 'Скопируйте ID вручную.');
      return;
    }
    try {
      await navigator.clipboard.writeText(profile.id);
      toast.success('ID скопирован', profile.id);
    } catch {
      toast.error('Не удалось скопировать ID', 'Разрешите доступ к буферу обмена.');
    }
  };

  const timeoutUntil = profile.timeoutUntil;
  const timeoutActive = Boolean(timeoutUntil && timeoutUntil > Date.now());
  const timeoutHint = timeoutUntil
    ? timeoutActive
      ? formatRelativeTime(timeoutUntil)
      : 'уже истёк'
    : undefined;

  const memberMissing = !profile.inGuild;
  const cannotModerateTarget = memberMissing || !profile.moderatable;
  const cannotKickTarget = memberMissing || !profile.kickable;
  const cannotWarnTarget = cannotModerateTarget || profile.bot;
  const cannotBanTarget = profile.inGuild && !profile.bannable;
  const showActions = canModerate || canKick || canBan || canManageRoles;

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'warns', label: 'Варны', count: profile.warnings.length },
    { key: 'notes', label: 'Заметки', count: profile.notes.length },
    { key: 'cases', label: 'Кейсы', count: profile.cases.length },
  ];

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-panel-gradient p-5 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.9)] backdrop-blur-[14px]">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-20 w-20 rounded-2xl ring-2 ring-white/[0.09]">
            {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xl">{getInitials(profile.displayName)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="max-w-full truncate text-xl font-bold tracking-[-0.02em]">
                {profile.displayName}
              </h2>
              {profile.bot ? (
                <ProfileBadge icon={Bot} tone="accent">
                  бот
                </ProfileBadge>
              ) : null}
              {profile.banned ? (
                <ProfileBadge icon={Hammer} tone="danger">
                  забанен
                </ProfileBadge>
              ) : null}
              {profile.muted ? (
                <ProfileBadge icon={VolumeX} tone="warning">
                  мут
                </ProfileBadge>
              ) : null}
              <ProfileBadge
                icon={profile.inGuild ? UserCheck : UserX}
                tone={profile.inGuild ? 'success' : 'muted'}
              >
                {profile.inGuild ? 'на сервере' : 'не на сервере'}
              </ProfileBadge>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {profile.id}
              </code>
              <button
                type="button"
                onClick={() => void copyId()}
                className="rounded-md border border-white/[0.08] bg-white/[0.03] p-1.5 text-muted-foreground transition-colors hover:border-accent/25 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label="Скопировать ID"
                title="Скопировать ID"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Detail
          icon={LogIn}
          label="Вход на сервер"
          value={profile.joinedAt ? formatDateTime(profile.joinedAt) : 'Не на сервере'}
          hint={profile.joinedAt ? formatRelativeTime(profile.joinedAt) : undefined}
        />
        <Detail
          icon={CalendarDays}
          label="Аккаунт создан"
          value={profile.createdAt ? formatDateTime(profile.createdAt) : '—'}
          hint={profile.createdAt ? formatRelativeTime(profile.createdAt) : undefined}
        />
        <Detail
          icon={Timer}
          label="Таймаут до"
          value={timeoutUntil ? formatDateTime(timeoutUntil) : 'Нет'}
          hint={timeoutHint}
        />
        <Detail
          icon={ShieldAlert}
          label="Активные кейсы"
          value={`${profile.activeCases.length} ${pluralizeRu(
            profile.activeCases.length,
            'кейс',
            'кейса',
            'кейсов',
          )}`}
        />
      </div>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Роли
          </h3>
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {profile.roles.length}
          </span>
        </div>
        {profile.roles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.roles.map((role) => (
              <RoleChip key={role.id} role={role} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Ролей нет или участник не на сервере.</p>
        )}
      </section>

      {showActions ? (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-accent" />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Действия
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {canModerate ? (
              <ActionButton
                icon={TriangleAlert}
                label="Варн"
                onClick={() => onAction('warn')}
                disabled={cannotWarnTarget}
                title={
                  profile.bot
                    ? 'Ботам предупреждения не выдаются'
                    : cannotModerateTarget
                      ? 'Участник недоступен для модерации'
                      : undefined
                }
              />
            ) : null}

            {canModerate ? (
              timeoutActive ? (
                <ActionButton
                  icon={TimerOff}
                  label="Снять таймаут"
                  onClick={() => onAction('untimeout')}
                  variant="success"
                  disabled={cannotModerateTarget}
                  title={cannotModerateTarget ? 'Участник недоступен для модерации' : undefined}
                />
              ) : (
                <ActionButton
                  icon={Timer}
                  label="Таймаут"
                  onClick={() => onAction('timeout')}
                  disabled={cannotModerateTarget}
                  title={cannotModerateTarget ? 'Участник недоступен для модерации' : undefined}
                />
              )
            ) : null}

            {canModerate ? (
              profile.muted ? (
                <ActionButton
                  icon={Volume2}
                  label="Снять мут"
                  onClick={() => onAction('unmute')}
                  variant="success"
                  disabled={cannotModerateTarget}
                  title={cannotModerateTarget ? 'Участник недоступен для модерации' : undefined}
                />
              ) : (
                <ActionButton
                  icon={VolumeX}
                  label="Мут"
                  onClick={() => onAction('mute')}
                  disabled={cannotModerateTarget}
                  title={cannotModerateTarget ? 'Участник недоступен для модерации' : undefined}
                />
              )
            ) : null}

            {canKick ? (
              <ActionButton
                icon={UserMinus}
                label="Кик"
                onClick={() => onAction('kick')}
                variant="destructive"
                disabled={cannotKickTarget}
                title={cannotKickTarget ? 'Бот не может кикнуть этого участника' : undefined}
              />
            ) : null}

            {canBan ? (
              profile.banned ? (
                <ActionButton
                  icon={Undo2}
                  label="Разбан"
                  onClick={() => onAction('unban')}
                  variant="outline"
                />
              ) : (
                <ActionButton
                  icon={Ban}
                  label="Бан"
                  onClick={() => onAction('ban')}
                  variant="destructive"
                  disabled={cannotBanTarget}
                  title={cannotBanTarget ? 'Бот не может забанить этого участника' : undefined}
                />
              )
            ) : null}

            {canManageRoles ? (
              <ActionButton
                icon={ShieldPlus}
                label="Роль"
                onClick={() => onAction('role')}
                variant="outline"
                disabled={cannotModerateTarget}
                title={cannotModerateTarget ? 'Участник недоступен для модерации' : undefined}
              />
            ) : null}

            {canModerate ? (
              <ActionButton icon={StickyNote} label="Заметка" onClick={() => onAction('note')} />
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <div
          className="flex gap-1 overflow-x-auto border-b border-white/[0.06] p-1.5 no-scrollbar"
          role="tablist"
          aria-label="Данные участника"
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                tab === item.key
                  ? 'bg-accent/[0.14] text-accent'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] leading-none',
                  tab === item.key
                    ? 'bg-accent/20 text-accent'
                    : 'bg-white/[0.05] text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role="tabpanel"
            >
              {tab === 'warns' ? (
                profile.warnings.length === 0 ? (
                  <TabEmpty
                    icon={TriangleAlert}
                    title="Варнов нет"
                    description="Предупреждения появятся здесь после первого варна."
                  />
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {profile.warnings.map((warn: MemberWarn) => (
                      <li
                        key={warn.id}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-warning/20 bg-warning/10 text-warning">
                          <TriangleAlert className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
                            {warn.reason}
                          </p>
                          <p className="mt-1 text-[9px] text-muted-foreground">
                            #{warn.id} · модератор{' '}
                            <span className="font-mono">{warn.moderatorId}</span> ·{' '}
                            {formatDateTime(warn.createdAt)}
                          </p>
                        </div>
                        {canModerate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteWarnMutation.mutate(warn.id)}
                            disabled={deleteWarnMutation.isPending}
                            aria-label={`Удалить варн ${warn.id}`}
                            title="Удалить варн"
                            className="shrink-0 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          >
                            {deleteWarnMutation.isPending &&
                            deleteWarnMutation.variables === warn.id ? (
                              <Spinner />
                            ) : (
                              <Trash2 />
                            )}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {tab === 'notes' ? (
                profile.notes.length === 0 ? (
                  <TabEmpty
                    icon={StickyNote}
                    title="Заметок нет"
                    description="Добавьте заметку, чтобы сохранить контекст для других модераторов."
                  />
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {profile.notes.map((note: MemberNote) => (
                      <li
                        key={note.id}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-info/20 bg-info/10 text-info">
                          <StickyNote className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
                            {note.text}
                          </p>
                          <p className="mt-1 text-[9px] text-muted-foreground">
                            #{note.id} · автор <span className="font-mono">{note.authorId}</span> ·{' '}
                            {formatDateTime(note.createdAt)}
                          </p>
                        </div>
                        {canModerate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteNoteMutation.mutate(note.id)}
                            disabled={deleteNoteMutation.isPending}
                            aria-label={`Удалить заметку ${note.id}`}
                            title="Удалить заметку"
                            className="shrink-0 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          >
                            {deleteNoteMutation.isPending &&
                            deleteNoteMutation.variables === note.id ? (
                              <Spinner />
                            ) : (
                              <Trash2 />
                            )}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {tab === 'cases' ? (
                profile.cases.length === 0 ? (
                  <TabEmpty
                    icon={ShieldAlert}
                    title="Кейсов нет"
                    description="История наказаний участника будет собираться здесь."
                  />
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {profile.cases.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span
                          className={cn(
                            'mt-0.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[9px] font-semibold',
                            caseTypeBadgeClasses(item.type),
                          )}
                        >
                          <span className="h-1 w-1 rounded-full bg-current" />
                          {caseTypeLabel(item.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{item.id}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em]',
                                item.active
                                  ? 'border-success/20 bg-success/10 text-success'
                                  : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
                              )}
                            >
                              {item.active ? 'активен' : 'закрыт'}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
                            {item.reason || 'Без причины'}
                          </p>
                          <p className="mt-1 text-[9px] text-muted-foreground">
                            {formatDateTime(item.createdAt)} · модератор{' '}
                            {item.moderatorName ?? item.moderatorId}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
