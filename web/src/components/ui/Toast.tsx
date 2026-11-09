import { forwardRef, useEffect, type ForwardedRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { useUiStore, type ToastItem, type ToastVariant } from '@/store/ui';
import { cn } from '@/lib/utils';

const toastConfig: Record<
  ToastVariant,
  { icon: LucideIcon; iconClass: string; barClass: string; borderClass: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-success',
    barClass: 'bg-success',
    borderClass: 'border-success/20',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-danger',
    barClass: 'bg-danger',
    borderClass: 'border-danger/25',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    barClass: 'bg-warning',
    borderClass: 'border-warning/20',
  },
  info: {
    icon: Info,
    iconClass: 'text-info',
    barClass: 'bg-info',
    borderClass: 'border-info/20',
  },
};

interface ToastCardProps {
  toast: ToastItem;
}

function ToastCardInner({ toast }: ToastCardProps, ref: ForwardedRef<HTMLDivElement>) {
  const dismissToast = useUiStore((state) => state.dismissToast);
  const config = toastConfig[toast.variant];
  const Icon = config.icon;
  const duration = toast.duration ?? 4500;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, dismissToast, toast.id]);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: 100, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'glass-modal pointer-events-auto relative overflow-hidden rounded-xl border p-3.5 pr-10 shadow-modal',
        config.borderClass,
      )}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <div className="flex gap-3">
        <div className={cn('mt-0.5 shrink-0', config.iconClass)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-snug">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{toast.description}</p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-label="Закрыть уведомление"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {duration > 0 ? (
        <motion.div
          className={cn('absolute bottom-0 left-0 h-[2px] w-full origin-left', config.barClass)}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          style={{ opacity: 0.7 }}
        />
      ) : null}
    </motion.div>
  );
}

const ToastCard = forwardRef<HTMLDivElement, ToastCardProps>(ToastCardInner);
ToastCard.displayName = 'ToastCard';

/** Глобальный контейнер тостов: новые появляются справа, старые плавно уезжают */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
