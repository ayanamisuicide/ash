import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Timer } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { addWarnAction } from '@/api/endpoints';
import type { AddWarnActionInput, WarnActionType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { WARN_ACTION_LABELS, warnActionNeedsDuration } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

interface WarnActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
}

const ACTIONS: WarnActionType[] = ['timeout', 'mute', 'kick', 'ban', 'tempban'];

const DURATION_PRESETS: Partial<Record<WarnActionType, string[]>> = {
  timeout: ['10m', '1h', '1d', '7d', '28d'],
  mute: ['10m', '1h', '1d', '7d', '30d'],
  tempban: ['1h', '1d', '7d', '30d'],
};

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {children}
      </label>
      {hint ? <span className="text-xs text-muted-foreground/70">{hint}</span> : null}
    </div>
  );
}

export function WarnActionModal({ open, onOpenChange, guildId }: WarnActionModalProps) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState('3');
  const [windowDays, setWindowDays] = useState('30');
  const [action, setAction] = useState<WarnActionType>('timeout');
  const [duration, setDuration] = useState('');

  const mutation = useMutation({
    mutationFn: (input: AddWarnActionInput) => addWarnAction(guildId, input),
    onSuccess: () => {
      toast.success('Правило добавлено', 'Автонаказания по варнам обновлены.');
      void queryClient.invalidateQueries({ queryKey: ['guild', guildId, 'settings'] });
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    setCount('3');
    setWindowDays('30');
    setAction('timeout');
    setDuration('');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countNumber = Number(count);
  const windowNumber = Number(windowDays);
  const countValid = Number.isInteger(countNumber) && countNumber >= 1 && countNumber <= 100;
  const windowValid = Number.isInteger(windowNumber) && windowNumber >= 1 && windowNumber <= 365;
  const needsDuration = warnActionNeedsDuration(action);
  const durationValid = !needsDuration || duration.trim().length > 0;
  const canSubmit = countValid && windowValid && durationValid && !mutation.isPending;
  const errorText = mutation.isError ? getErrorMessage(mutation.error) : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    mutation.mutate({
      count: countNumber,
      windowDays: windowNumber,
      action,
      duration: needsDuration ? duration.trim() : null,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title={
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-warning/20 bg-warning/10 text-warning">
            <Timer className="h-4 w-4" />
          </span>
          Новое правило автонаказания
        </span>
      }
      description="Когда за указанное окно наберётся нужное число варнов, бот применит действие автоматически."
      size="md"
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
          <Button type="submit" form="warn-action-form" disabled={!canSubmit}>
            {mutation.isPending ? <Spinner /> : <Plus />}
            {mutation.isPending ? 'Добавляем…' : 'Добавить правило'}
          </Button>
        </>
      }
    >
      <form id="warn-action-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="warn-action-count" hint="1–100">
              Количество варнов
            </FieldLabel>
            <Input
              id="warn-action-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              disabled={mutation.isPending}
              aria-invalid={!countValid}
            />
            {!countValid ? (
              <p className="mt-1.5 text-[11px] text-warning">Введите целое число от 1 до 100.</p>
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="warn-action-window" hint="1–365">
              Окно в днях
            </FieldLabel>
            <Input
              id="warn-action-window"
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
              disabled={mutation.isPending}
              aria-invalid={!windowValid}
            />
            {!windowValid ? (
              <p className="mt-1.5 text-[11px] text-warning">Введите целое число от 1 до 365.</p>
            ) : null}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="warn-action-type">Действие</FieldLabel>
          <Select
            id="warn-action-type"
            value={action}
            onChange={(event) => setAction(event.target.value as WarnActionType)}
            disabled={mutation.isPending}
          >
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {WARN_ACTION_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {needsDuration ? (
          <div>
            <FieldLabel htmlFor="warn-action-duration" hint="например, 1h или 7d">
              Длительность
            </FieldLabel>
            <Input
              id="warn-action-duration"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="10m, 1h, 2d, 1w"
              disabled={mutation.isPending}
              aria-invalid={!durationValid}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(DURATION_PRESETS[action] ?? []).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDuration(preset)}
                  disabled={mutation.isPending}
                  className={cn(
                    'focus-ring rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50',
                    duration === preset
                      ? 'border-accent/30 bg-accent/[0.14] text-accent-soft'
                      : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-white/[0.14] hover:text-foreground',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            {!durationValid ? (
              <p className="mt-1.5 text-[11px] text-warning">
                Для таймаута, мута и временного бана укажите длительность.
              </p>
            ) : null}
          </div>
        ) : null}

        {errorText ? (
          <p className="rounded-lg border border-danger/20 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
            {errorText}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
