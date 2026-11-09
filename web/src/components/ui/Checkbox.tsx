import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Чекбокс в стиле Switch: нативный input остаётся внутри,
 * поэтому клик по label и клавиатура работают без дополнительной логики.
 */
const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className={cn('relative grid h-5 w-5 shrink-0 place-items-center', className)}>
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-md border border-white/[0.1] bg-white/[0.06] transition-colors',
          'checked:border-accent/50 checked:bg-accent/80',
          'focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...props}
      />
      <Check
        className="pointer-events-none h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
        strokeWidth={3}
        aria-hidden
      />
    </span>
  ),
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
