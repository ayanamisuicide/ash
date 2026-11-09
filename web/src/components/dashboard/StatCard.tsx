import { useEffect, useRef } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'success' | 'danger' | 'warn' | 'info';

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  note?: string;
  tone?: StatTone;
}

const toneStyles: Record<
  StatTone,
  { icon: string; halo: string; hover: string; line: string }
> = {
  default: {
    icon: 'border-accent/20 bg-accent/10 text-accent',
    halo: 'bg-accent/10',
    hover: 'hover:border-accent/30 hover:shadow-[0_0_40px_rgba(102,115,255,0.15)]',
    line: 'bg-gradient-to-r from-transparent via-accent/70 to-transparent',
  },
  success: {
    icon: 'border-success/20 bg-success/10 text-success',
    halo: 'bg-success/10',
    hover: 'hover:border-success/30 hover:shadow-[0_0_40px_rgba(61,214,140,0.15)]',
    line: 'bg-gradient-to-r from-transparent via-success/70 to-transparent',
  },
  danger: {
    icon: 'border-danger/20 bg-danger/10 text-danger',
    halo: 'bg-danger/10',
    hover: 'hover:border-danger/30 hover:shadow-[0_0_40px_rgba(255,95,109,0.15)]',
    line: 'bg-gradient-to-r from-transparent via-danger/70 to-transparent',
  },
  warn: {
    icon: 'border-warning/20 bg-warning/10 text-warning',
    halo: 'bg-warning/10',
    hover: 'hover:border-warning/30 hover:shadow-[0_0_40px_rgba(255,176,32,0.15)]',
    line: 'bg-gradient-to-r from-transparent via-warning/70 to-transparent',
  },
  info: {
    icon: 'border-info/20 bg-info/10 text-info',
    halo: 'bg-info/10',
    hover: 'hover:border-info/30 hover:shadow-[0_0_40px_rgba(84,184,255,0.15)]',
    line: 'bg-gradient-to-r from-transparent via-info/70 to-transparent',
  },
};

/**
 * Карточка метрики с count-up при попадании во viewport.
 * Анимация идёт через MotionValue, поэтому не вызывает React-перерендеры на каждом кадре.
 */
export function StatCard({ icon: Icon, label, value, note, tone = 'default' }: StatCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const count = useMotionValue(0);
  const display = useTransform(count, (latest) => formatNumber(Math.round(latest)));
  const styles = toneStyles[tone];

  useEffect(() => {
    if (!inView) return;

    if (reduceMotion) {
      count.set(value);
      return;
    }

    const controls = animate(count, value, {
      duration: 1.2,
      ease: 'easeOut',
    });

    return () => controls.stop();
  }, [count, inView, reduceMotion, value]);

  return (
    <motion.div
      ref={ref}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'glass-card group relative overflow-hidden p-4 transition-[border-color,box-shadow] duration-200',
        styles.hover,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
          styles.halo,
        )}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
            {label}
          </p>
          <motion.p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.03em] sm:text-[26px]">
            {display}
          </motion.p>
          {note ? (
            <p className="mt-1.5 truncate text-[10px] leading-none text-muted-foreground">{note}</p>
          ) : null}
        </div>

        <div
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-transform duration-200 group-hover:scale-105',
            styles.icon,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
      </div>

      <span
        className={cn(
          'absolute bottom-0 left-0 h-px w-0 transition-all duration-500 group-hover:w-full',
          styles.line,
        )}
        aria-hidden
      />
    </motion.div>
  );
}
