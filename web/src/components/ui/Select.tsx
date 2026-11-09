import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { fieldClasses } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Нативный select в стиле дизайн-системы. Нативный элемент выбран осознанно:
 * он бесплатно даёт клавиатуру, мобильные шторки и доступность, а кастомный
 * список Radix здесь избыточен.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="group relative">
      <select
        ref={ref}
        className={cn(fieldClasses, 'h-10 cursor-pointer appearance-none px-3 pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-[transform,color] duration-200 group-focus-within:-rotate-180 group-focus-within:text-accent-soft"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
