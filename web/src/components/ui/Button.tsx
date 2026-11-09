import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl',
    'text-sm font-semibold tracking-[-0.01em] transition-[color,background-color,border-color,box-shadow,filter] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-accent-gradient text-white shadow-button hover:shadow-glow-accent',
        secondary:
          'border border-white/[0.08] bg-white/[0.05] text-foreground shadow-inner-top hover:border-white/[0.14] hover:bg-white/[0.08]',
        outline:
          'border border-accent/30 bg-accent/[0.08] text-foreground hover:border-accent/50 hover:bg-accent/[0.14]',
        ghost: 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
        destructive:
          'bg-[linear-gradient(180deg,#ff7280,#f04e5e)] text-white shadow-[0_8px_22px_rgba(255,95,109,0.22)] hover:shadow-[0_0_28px_rgba(255,95,109,0.3)]',
        success:
          'bg-[linear-gradient(180deg,#4ce0a0,#2fbe7d)] text-[#04120b] shadow-[0_8px_22px_rgba(61,214,140,0.2)] hover:shadow-[0_0_28px_rgba(61,214,140,0.28)]',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-[15px]',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      return (
        <Slot
          ref={ref as React.ForwardedRef<HTMLElement>}
          // Для ссылок, стилизованных под кнопку, hover-масштаб задаём CSS:
          // Slot не умеет прокидывать whileHover в дочерний <a>.
          className={cn(classes, 'transition-transform hover:scale-[1.02] active:scale-[0.98]')}
          {...(props as unknown as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </Slot>
      );
    }

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={disabled}
        // Пружинная физика вместо линейного CSS-перехода — кнопка «отвечает» на палец.
        whileHover={disabled ? undefined : { scale: 1.03, filter: 'brightness(1.05)' }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
