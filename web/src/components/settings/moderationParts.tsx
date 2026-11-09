import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

/** Общие презентационные части раздела настроек модерации. */

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}

export function SectionHeader({ icon: Icon, title, description, children }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
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

export function AutomodFilterCard({
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onChange,
  children,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        checked
          ? 'border-accent/20 bg-accent/[0.05]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
              checked
                ? 'border-accent/25 bg-accent/10 text-accent'
                : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={label}
        />
      </div>
      {checked && children ? (
        <div className="mt-3 border-t border-white/[0.06] pt-3">{children}</div>
      ) : null}
    </div>
  );
}
