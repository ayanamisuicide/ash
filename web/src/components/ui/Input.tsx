import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldClasses =
  'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm text-foreground ' +
  'shadow-inner-top transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 ' +
  'hover:border-white/[0.13] focus:border-accent/45 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(102,115,255,0.06)] focus:outline-none ' +
  'focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-55';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldClasses, 'h-10 px-3', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldClasses, 'min-h-24 px-3 py-2.5', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Input, Textarea, fieldClasses };
