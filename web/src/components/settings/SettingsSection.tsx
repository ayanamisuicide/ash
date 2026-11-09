import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Info, ShieldAlert, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  className?: string;
}

/** Единая стеклянная секция настроек с иконкой, заголовком и действиями. */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  actions,
  badge,
  children,
  contentClassName,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn('glass-card overflow-hidden', className)}>
      <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
              {badge}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </section>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {children}
      </label>
      {hint ? <span className="text-[11px] text-muted-foreground/70">{hint}</span> : null}
    </div>
  );
}

type NoticeTone = 'info' | 'warn' | 'success' | 'danger';

const NOTICE_STYLES: Record<NoticeTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'border-info/20 bg-info/[0.06] text-info' },
  warn: { icon: TriangleAlert, className: 'border-warning/20 bg-warning/[0.07] text-warning' },
  success: { icon: ShieldCheck, className: 'border-success/20 bg-success/[0.07] text-success' },
  danger: { icon: ShieldAlert, className: 'border-danger/20 bg-danger/[0.07] text-danger' },
};

export function SettingsNotice({
  tone = 'info',
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
}) {
  const style = NOTICE_STYLES[tone];
  const Icon = style.icon;

  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3', style.className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 text-[11px] leading-relaxed">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className={cn(title && 'mt-0.5', 'text-muted-foreground')}>{children}</div>
      </div>
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Компактная строка «название + переключатель» для длинных списков. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SwitchRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors',
        checked
          ? 'border-accent/15 bg-accent/[0.04]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

export function SettingsChip({
  children,
  onRemove,
  removeLabel,
  icon,
  disabled,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-1 text-[11px] text-foreground/85">
      {icon}
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeLabel ?? 'Удалить'}
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
