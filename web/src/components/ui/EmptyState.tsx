import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateTone = 'danger' | 'info' | 'muted';
type EmptyStateSize = 'page' | 'table' | 'inline';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  /** page — самостоятельная карточка, table/inline — блок внутри существующей карточки */
  size?: EmptyStateSize;
  className?: string;
}

const sizeClasses: Record<
  EmptyStateSize,
  { wrapper: string; icon: string; iconSize: string; title: string; desc: string; action: string }
> = {
  page: {
    wrapper: 'px-6 py-12 sm:py-16',
    icon: 'mb-5 h-14 w-14 rounded-2xl',
    iconSize: 'h-6 w-6',
    title: 'text-lg',
    desc: 'mt-2 max-w-md text-sm',
    action: 'mt-6',
  },
  table: {
    wrapper: 'px-5 py-14',
    icon: 'mb-4 h-14 w-14 rounded-2xl',
    iconSize: 'h-6 w-6',
    title: 'text-sm',
    desc: 'mt-1.5 max-w-sm text-xs',
    action: 'mt-5',
  },
  inline: {
    wrapper: 'px-4 py-9',
    icon: 'mb-3 h-11 w-11 rounded-xl',
    iconSize: 'h-4 w-4',
    title: 'text-xs',
    desc: 'mt-1 max-w-xs text-xs',
    action: 'mt-4',
  },
};

const toneClasses: Record<EmptyStateTone, { icon: string; halo: string; ring: string }> = {
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
  size = 'page',
  className,
}: EmptyStateProps) {
  const styles = toneClasses[tone];
  const layout = sizeClasses[size];
  const TitleTag = size === 'page' ? 'h2' : 'p';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center text-center',
        size === 'page' && 'glass-card overflow-hidden',
        layout.wrapper,
        className,
      )}
    >
      {size === 'page' ? (
        <div
          className={cn(
            'pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl',
            styles.halo,
          )}
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          'relative grid place-items-center border motion-safe:animate-float',
          layout.icon,
          styles.icon,
          styles.ring,
        )}
      >
        <Icon className={layout.iconSize} strokeWidth={1.8} />
      </div>

      <TitleTag className={cn('font-semibold tracking-[-0.02em]', layout.title)}>{title}</TitleTag>
      {description ? (
        <p className={cn('leading-relaxed text-muted-foreground', layout.desc)}>{description}</p>
      ) : null}
      {action ? (
        <div className={cn('flex flex-wrap justify-center gap-2', layout.action)}>{action}</div>
      ) : null}
    </div>
  );
}
