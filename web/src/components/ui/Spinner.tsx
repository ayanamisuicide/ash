import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Спиннер из дизайн-системы: 360° за 0.7s, без рывков */
export function Spinner({ className, label = 'Загрузка' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center justify-center">
      <Loader2 className={cn('h-4 w-4 animate-[spin_0.7s_linear_infinite]', className)} />
    </span>
  );
}
