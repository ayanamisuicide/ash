import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateTone = 'danger' | 'info' | 'muted';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}

const toneClasses: Record<
  EmptyStateTone,
  { icon: string; halo: string; ring: string }
> = {
  danger: {
    icon: 'border-danger/20 bg-danger/10 text-danger',
    halo: 'bg-danger/15',
    ring: 'shadow-[0_0_40px_rgba(255,95,109,0.12)]',
  },
  info: {
    icon: 'border-accent/20 bg-accent/10 text-accent',
    halo: 'bg-accent/15',
    ring: 'shadow-glow-card',
  },
  muted: {
    icon: 'border-white/[0.08] bg-white/[0.04] text-muted-foreground',
    halo: 'bg-white/[0.05]',
    ring: '',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'info',
  className,
}: EmptyStateProps) {
  const styles = toneClasses[tone];

  return (
    <div
      className={cn(
        'glass-card relative flex flex-col items-center overflow-hidden px-6 py-12 text-center sm:py-16',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl',
          styles.halo,
        )}
        aria-hidden
      />

      <div
        className={cn(
          'relative mb-5 grid h-14 w-14 place-items-center rounded-2xl border',
          styles.icon,
          styles.ring,
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </div>

      <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
