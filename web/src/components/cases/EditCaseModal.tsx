import { useEffect, useState, type ComponentProps, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Eye,
  Save,
  ShieldAlert,
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
import { updateCase } from '@/api/endpoints';
import type {
  GuildAccess,
  MemberActionType,
  MemberProfile,
  RecentCase,
  UpdateCaseInput,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Input';
import { caseTypeBadgeClasses, caseTypeLabel } from '@/lib/cases';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

interface EditCaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string | null;
  item: RecentCase | null;
  /** access.admin || access.moderate */
  canEdit: boolean;
  access?: GuildAccess | null;
  profile?: MemberProfile | null;
  profileLoading?: boolean;
  onAction?: (action: MemberActionType) => void;
  /** В демо-режиме форма только для просмотра, но это не ограничение прав. */
  demo?: boolean;
}

interface CaseActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: ComponentProps<typeof Button>['variant'];
  disabled?: boolean;
  title?: string;
}

function CaseActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'secondary',
  disabled = false,
  title,
}: CaseActionButtonProps) {
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

interface CaseMetaProps {
  label: string;
  value: string;
  mono?: boolean;
}

function CaseMeta({ label, value, mono = false }: CaseMetaProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-[12px] text-foreground/90',
          mono && 'font-mono text-[11px] text-muted-foreground',
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function EditCaseModal({
  open,
  onOpenChange,
  guildId,
  item,
  canEdit,
  access = null,
  profile = null,
  profileLoading = false,
  onAction,
  demo = false,
}: EditCaseModalProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [active, setActive] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: UpdateCaseInput) => {
      if (!guildId || !item) throw new Error('Кейс не выбран.');
      return updateCase(guildId, item.id, input);
    },
    onSuccess: (response) => {
      toast.success('Кейс обновлён', `#${response.case.id} · ${caseTypeLabel(response.case.type)}`);
      void queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
      onOpenChange(false);
    },
  });

  // Сбрасываем черновик при открытии другого кейса, не затирая ввод при рефетче.
  useEffect(() => {
    if (!open || !item) return;
    setReason(item.reason);
    setActive(item.active);
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 2 && trimmedReason.length <= 500;
  const isDirty = Boolean(item) && (trimmedReason !== item?.reason || active !== item?.active);
  const canSave = canEdit && isDirty && reasonValid && !mutation.isPending;

  const canModerate = Boolean(access?.admin || access?.moderate);
  const canKick = Boolean(access?.admin || access?.kick);
  const canBan = Boolean(access?.admin || access?.ban);
  const canManageRoles = Boolean(access?.admin || access?.manageRoles);
  const showActions = Boolean(
    item?.userId && onAction && (canModerate || canKick || canBan || canManageRoles),
  );

  const caseIsActiveBan = Boolean(item?.active && (item.type === 'ban' || item.type === 'tempban'));
  const banned = profile ? profile.banned : caseIsActiveBan;
  const muted = profile ? profile.muted : Boolean(item?.active && item.type === 'mute');
  const timeoutActive = profile
    ? Boolean(profile.timeoutUntil && profile.timeoutUntil > Date.now())
    : Boolean(item?.active && item.type === 'timeout');
  const memberInGuild = profile ? profile.inGuild : !caseIsActiveBan;
  const memberActionsDisabled = !memberInGuild;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    mutation.mutate({ reason: trimmedReason, active });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title={item ? `Кейс #${item.id}` : 'Кейс'}
      description="Причина, статус и быстрые действия по этому наказанию."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {canEdit ? 'Отмена' : 'Закрыть'}
          </Button>
          {canEdit ? (
            <Button type="submit" form="edit-case-form" disabled={!canSave}>
              {mutation.isPending ? <Spinner /> : <Save />}
              {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          ) : null}
        </>
      }
    >
      {item ? (
        <div className="space-y-4">
          <form id="edit-case-form" onSubmit={handleSubmit} className="space-y-4">
            {!canEdit ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {demo
                    ? 'Демо-режим: изменения отключены, данные сервера ненастоящие.'
                    : 'Только просмотр. Чтобы менять кейсы, нужно право «Заглушать участников» или «Управление сервером».'}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                  caseTypeBadgeClasses(item.type),
                )}
              >
                <span className="h-1 w-1 rounded-full bg-current" />
                {caseTypeLabel(item.type)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
                  item.active
                    ? 'border-success/20 bg-success/10 text-success'
                    : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
                )}
              >
                {item.active ? 'Активен' : 'Закрыт'}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <CaseMeta label="Участник" value={item.userName ?? item.userId ?? '—'} />
              <CaseMeta label="Модератор" value={item.moderatorName ?? item.moderatorId} />
              <CaseMeta label="Создан" value={formatDateTime(item.createdAt)} />
              <CaseMeta label="ID кейса" value={`#${item.id}`} mono />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="edit-case-reason"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Причина
                </label>
                <span className="font-mono text-xs text-muted-foreground/70">
                  {reason.length}/500
                </span>
              </div>
              <Textarea
                id="edit-case-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={!canEdit || mutation.isPending}
                maxLength={500}
                rows={4}
                placeholder="Опишите причину наказания"
                aria-invalid={canEdit && !reasonValid}
              />
              {canEdit && !reasonValid ? (
                <p className="mt-1.5 text-[11px] text-warning">
                  Причина должна содержать от 2 до 500 символов.
                </p>
              ) : null}
            </div>

            <label
              className={cn(
                'flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-colors',
                canEdit && !mutation.isPending
                  ? 'cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]'
                  : 'opacity-70',
              )}
            >
              <Checkbox
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                disabled={!canEdit || mutation.isPending}
                className="mt-0.5"
                aria-label="Кейс активен"
              />
              <span>
                <span className="block text-sm font-medium">Кейс активен</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Активные кейсы учитываются в статистике и действующих наказаниях. Снимите галочку,
                  чтобы закрыть кейс.
                </span>
              </span>
            </label>

            {mutation.isError ? (
              <p className="rounded-lg border border-danger/20 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
                {getErrorMessage(mutation.error)}
              </p>
            ) : null}
          </form>

          {showActions ? (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Действия с участником
                </h3>
                {profileLoading ? <Spinner className="h-3 w-3 text-muted-foreground" /> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {canBan ? (
                  banned ? (
                    <CaseActionButton
                      icon={Undo2}
                      label="Разбанить"
                      variant="success"
                      onClick={() => onAction?.('unban')}
                    />
                  ) : (
                    <CaseActionButton
                      icon={Ban}
                      label="Забанить"
                      variant="destructive"
                      onClick={() => onAction?.('ban')}
                    />
                  )
                ) : null}

                {canModerate ? (
                  muted ? (
                    <CaseActionButton
                      icon={Volume2}
                      label="Снять мут"
                      variant="success"
                      onClick={() => onAction?.('unmute')}
                      disabled={memberActionsDisabled}
                      title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                    />
                  ) : (
                    <CaseActionButton
                      icon={VolumeX}
                      label="Замутить"
                      onClick={() => onAction?.('mute')}
                      disabled={memberActionsDisabled}
                      title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                    />
                  )
                ) : null}

                {canModerate ? (
                  timeoutActive ? (
                    <CaseActionButton
                      icon={TimerOff}
                      label="Снять таймаут"
                      variant="success"
                      onClick={() => onAction?.('untimeout')}
                      disabled={memberActionsDisabled}
                      title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                    />
                  ) : (
                    <CaseActionButton
                      icon={Timer}
                      label="Таймаут"
                      onClick={() => onAction?.('timeout')}
                      disabled={memberActionsDisabled}
                      title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                    />
                  )
                ) : null}

                {canModerate ? (
                  <CaseActionButton
                    icon={TriangleAlert}
                    label="Варн"
                    onClick={() => onAction?.('warn')}
                    disabled={memberActionsDisabled || Boolean(profile?.bot)}
                    title={
                      profile?.bot
                        ? 'Ботам предупреждения не выдаются'
                        : memberActionsDisabled
                          ? 'Участник не на сервере'
                          : undefined
                    }
                  />
                ) : null}

                {canKick ? (
                  <CaseActionButton
                    icon={UserMinus}
                    label="Кик"
                    variant="destructive"
                    onClick={() => onAction?.('kick')}
                    disabled={memberActionsDisabled}
                    title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                  />
                ) : null}

                {canManageRoles ? (
                  <CaseActionButton
                    icon={ShieldPlus}
                    label="Роль"
                    variant="outline"
                    onClick={() => onAction?.('role')}
                    disabled={memberActionsDisabled}
                    title={memberActionsDisabled ? 'Участник не на сервере' : undefined}
                  />
                ) : null}

                {canModerate ? (
                  <CaseActionButton
                    icon={StickyNote}
                    label="Заметка"
                    onClick={() => onAction?.('note')}
                  />
                ) : null}
              </div>

              {profile && !profile.inGuild ? (
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  Участник не на сервере: кик, мут, таймаут, варн и роли недоступны.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
