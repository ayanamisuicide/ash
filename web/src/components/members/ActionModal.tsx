import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Info,
  ShieldPlus,
  StickyNote,
  Timer,
  TimerOff,
  TriangleAlert,
  Undo2,
  UserMinus,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { performMemberAction } from '@/api/endpoints';
import type { GuildMetaRole, MemberActionBody, MemberActionType } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { getInitials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

/** Минимальные данные для шапки модалки: профиль или кейс без аватара. */
export interface ActionTarget {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface ActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string | null;
  member: ActionTarget | null;
  action: MemberActionType | null;
  roles: GuildMetaRole[];
}

interface ActionMeta {
  title: string;
  description: string;
  submitLabel: string;
  icon: LucideIcon;
  danger?: boolean;
}

const ACTION_META: Record<MemberActionType, ActionMeta> = {
  warn: {
    title: 'Выдать предупреждение',
    description: 'Варн сохранится в профиле и будет учитываться в автонаказаниях.',
    submitLabel: 'Выдать варн',
    icon: TriangleAlert,
  },
  timeout: {
    title: 'Выдать таймаут',
    description: 'Участник не сможет писать и говорить до истечения срока.',
    submitLabel: 'Выдать таймаут',
    icon: Timer,
  },
  untimeout: {
    title: 'Снять таймаут',
    description: 'Бот снимет активный таймаут с участника.',
    submitLabel: 'Снять таймаут',
    icon: TimerOff,
  },
  mute: {
    title: 'Выдать мут',
    description: 'Бот выдаст роль Muted. Пустая длительность означает бессрочный мут.',
    submitLabel: 'Выдать мут',
    icon: VolumeX,
  },
  unmute: {
    title: 'Снять мут',
    description: 'Бот снимет роль Muted с участника.',
    submitLabel: 'Снять мут',
    icon: Volume2,
  },
  kick: {
    title: 'Кикнуть участника',
    description: 'Участник будет исключён с сервера и сможет вернуться по инвайту.',
    submitLabel: 'Кикнуть',
    icon: UserMinus,
    danger: true,
  },
  ban: {
    title: 'Забанить участника',
    description: 'Бот попытается забанить участника и закрыть его активные кейсы.',
    submitLabel: 'Забанить',
    icon: Ban,
    danger: true,
  },
  unban: {
    title: 'Разбанить участника',
    description: 'Бот попытается снять бан и уведомить пользователя.',
    submitLabel: 'Разбанить',
    icon: Undo2,
  },
  role: {
    title: 'Изменить роли',
    description: 'Выдайте или снимите роль. Изменение применится сразу.',
    submitLabel: 'Применить роль',
    icon: ShieldPlus,
  },
  note: {
    title: 'Добавить заметку',
    description: 'Заметка видна модераторам и хранится в профиле участника.',
    submitLabel: 'Добавить заметку',
    icon: StickyNote,
  },
};

const DURATION_PRESETS: Partial<Record<MemberActionType, string[]>> = {
  timeout: ['10m', '1h', '1d', '7d', '28d'],
  mute: ['10m', '1h', '1d', '7d', '30d'],
  ban: ['1h', '1d', '7d', '30d'],
};

const DELETE_OPTIONS = [
  { value: 0, label: 'Не удалять' },
  { value: 3_600, label: 'За последний час' },
  { value: 21_600, label: 'За 6 часов' },
  { value: 86_400, label: 'За 1 день' },
  { value: 259_200, label: 'За 3 дня' },
  { value: 604_800, label: 'За 7 дней' },
];

interface FieldLabelProps {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}

function FieldLabel({ htmlFor, children, hint }: FieldLabelProps) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {children}
      </label>
      {hint ? <span className="text-[10px] text-muted-foreground/70">{hint}</span> : null}
    </div>
  );
}

export function ActionModal({
  open,
  onOpenChange,
  guildId,
  member,
  action,
  roles,
}: ActionModalProps) {
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [deleteSeconds, setDeleteSeconds] = useState(0);
  const [roleMode, setRoleMode] = useState<'add' | 'remove'>('add');
  const [roleId, setRoleId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const meta = action ? ACTION_META[action] : null;
  const ActionIcon = meta?.icon;
  const availableRoles = roles.filter((role) => !role.isEveryone && !role.managed);
  const presets = action ? (DURATION_PRESETS[action] ?? []) : [];
  const requiresDuration = action === 'timeout';

  const mutation = useMutation({
    mutationFn: (body: MemberActionBody) => {
      if (!guildId || !action) throw new Error('Действие не выбрано.');
      return performMemberAction(guildId, action, body);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['guild', guildId] });

      // Бэкенд отдаёт ok:false с HTTP 200 — это бизнес-ошибка, а не сбой сети.
      if (!result.ok) {
        setActionError(result.message);
        toast.error('Действие не выполнено', result.message);
        return;
      }

      toast.success('Готово', result.message);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    setReason(
      action === 'unban'
        ? 'Разбан через веб-панель'
        : action === 'unmute' || action === 'untimeout'
          ? 'Снятие наказания через веб-панель'
          : '',
    );
    setDuration('');
    setDeleteSeconds(0);
    setRoleMode('add');
    setRoleId('');
    setNoteText('');
    setActionError(null);
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action, member?.id]);

  const reasonValid = reason.trim().length >= 2 && reason.trim().length <= 500;
  const noteValid = noteText.trim().length >= 2 && noteText.trim().length <= 500;
  const durationValid = !requiresDuration || duration.trim().length > 0;
  const roleValid = action !== 'role' || Boolean(roleId);
  const contentValid = action === 'note' ? noteValid : reasonValid;
  const canSubmit = Boolean(
    action && member && contentValid && durationValid && roleValid && !mutation.isPending,
  );
  const errorText = actionError ?? (mutation.isError ? getErrorMessage(mutation.error) : null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !action || !member) return;

    const base = { userId: member.id };
    let body: MemberActionBody;

    switch (action) {
      case 'warn':
        body = { ...base, reason: reason.trim() };
        break;
      case 'timeout':
        body = { ...base, duration: duration.trim(), reason: reason.trim() };
        break;
      case 'untimeout':
        body = { ...base, reason: reason.trim() };
        break;
      case 'mute':
        body = { ...base, duration: duration.trim() || null, reason: reason.trim() };
        break;
      case 'unmute':
        body = { ...base, reason: reason.trim() };
        break;
      case 'kick':
        body = { ...base, reason: reason.trim() };
        break;
      case 'ban':
        body = {
          ...base,
          reason: reason.trim(),
          duration: duration.trim() || null,
          deleteSeconds,
        };
        break;
      case 'unban':
        body = { ...base, reason: reason.trim() };
        break;
      case 'role':
        body = { ...base, action: roleMode, roleId, reason: reason.trim() };
        break;
      case 'note':
        body = { ...base, text: noteText.trim() };
        break;
    }

    setActionError(null);
    mutation.mutate(body);
  };

  return (
    <Modal
      open={Boolean(open && action && member)}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title={
        meta && ActionIcon ? (
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg border',
                meta.danger
                  ? 'border-danger/20 bg-danger/10 text-danger'
                  : 'border-accent/20 bg-accent/10 text-accent',
              )}
            >
              <ActionIcon className="h-4 w-4" />
            </span>
            {meta.title}
          </span>
        ) : (
          'Действие'
        )
      }
      description={meta?.description}
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Отмена
          </Button>
          {meta && ActionIcon && member ? (
            <Button
              type="submit"
              form="member-action-form"
              variant={meta.danger ? 'destructive' : 'default'}
              disabled={!canSubmit}
            >
              {mutation.isPending ? <Spinner /> : <ActionIcon />}
              {mutation.isPending ? 'Выполняем…' : meta.submitLabel}
            </Button>
          ) : null}
        </>
      }
    >
      {member && action ? (
        <form id="member-action-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <Avatar className="h-10 w-10 rounded-xl">
              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
              <AvatarFallback>{getInitials(member.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{member.displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                @{member.username} · {member.id}
              </p>
            </div>
          </div>

          {action === 'ban' || action === 'kick' ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/[0.06] px-3.5 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="text-xs leading-relaxed text-danger/90">
                {action === 'ban'
                  ? 'Бан закроет активные кейсы участника. Если указать длительность, бот выдаст временный бан.'
                  : 'Кик завершит текущую сессию участника на сервере. Вернуться можно будет по новому инвайту.'}
              </p>
            </div>
          ) : null}

          {action === 'role' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="action-role-mode">Действие</FieldLabel>
                <Select
                  id="action-role-mode"
                  value={roleMode}
                  onChange={(event) => setRoleMode(event.target.value as 'add' | 'remove')}
                  disabled={mutation.isPending}
                >
                  <option value="add">Выдать роль</option>
                  <option value="remove">Снять роль</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="action-role">Роль</FieldLabel>
                <Select
                  id="action-role"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  disabled={mutation.isPending || availableRoles.length === 0}
                >
                  <option value="">Выберите роль</option>
                  {availableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </div>
              {availableRoles.length === 0 ? (
                <p className="text-[11px] text-warning sm:col-span-2">
                  Нет доступных ролей: meta-данные ещё не загрузились или все роли управляются
                  интеграциями.
                </p>
              ) : null}
            </div>
          ) : null}

          {action === 'timeout' || action === 'mute' || action === 'ban' ? (
            <div>
              <FieldLabel
                htmlFor="action-duration"
                hint={action === 'timeout' ? 'макс. 28 дней' : 'пусто — навсегда'}
              >
                Длительность
              </FieldLabel>
              <Input
                id="action-duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="10m, 1h, 2d, 1w"
                disabled={mutation.isPending}
              />
              {presets.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDuration(preset)}
                      disabled={mutation.isPending}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50',
                        duration === preset
                          ? 'border-accent/30 bg-accent/[0.14] text-accent'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-white/[0.14] hover:text-foreground',
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {action === 'ban' ? (
            <div>
              <FieldLabel htmlFor="action-delete-seconds">Удалить сообщения</FieldLabel>
              <Select
                id="action-delete-seconds"
                value={String(deleteSeconds)}
                onChange={(event) => setDeleteSeconds(Number(event.target.value))}
                disabled={mutation.isPending}
              >
                {DELETE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {action === 'note' ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="action-note"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Текст заметки
                </label>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {noteText.length}/500
                </span>
              </div>
              <Textarea
                id="action-note"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Например: участник предупреждён о правилах канала"
                disabled={mutation.isPending}
                aria-invalid={!noteValid && noteText.length > 0}
              />
            </div>
          ) : (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="action-reason"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Причина
                </label>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {reason.length}/500
                </span>
              </div>
              <Textarea
                id="action-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Опишите причину действия"
                disabled={mutation.isPending}
                aria-invalid={!reasonValid && reason.length > 0}
              />
              {!reasonValid && reason.length > 0 ? (
                <p className="mt-1.5 text-[11px] text-warning">
                  Причина должна содержать от 2 до 500 символов.
                </p>
              ) : null}
            </div>
          )}

          {errorText ? (
            <p className="rounded-lg border border-danger/20 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
              {errorText}
            </p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
