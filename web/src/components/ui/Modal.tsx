import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizeClasses;
  className?: string;
}

/**
 * Radix отвечает за фокус-трап и presence-жизненный цикл, а анимации заданы
 * CSS-keyframes с пружинной кривой. Это надёжнее ручного AnimatePresence:
 * Radix сам дожидается animationend и гарантированно удаляет слой из DOM.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#07090e]/70 backdrop-blur-sm data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />

        <Dialog.Content
          className={cn(
            // inset-0 + m-auto центрирует карточку без transform-утилит,
            // чтобы CSS-keyframes могли свободно анимировать scale/y.
            'glass-modal fixed inset-0 z-50 m-auto h-fit max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto p-5 focus:outline-none data-[state=open]:animate-modal-in data-[state=closed]:animate-modal-out sm:p-6',
            sizeClasses[size],
            className,
          )}
        >
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3 text-muted-foreground"
              aria-label="Закрыть"
            >
              <X />
            </Button>
          </Dialog.Close>

          <div className="pr-10">
            <Dialog.Title className="text-lg font-semibold tracking-[-0.02em]">
              {title}
            </Dialog.Title>
            <Dialog.Description
              className={cn(
                'mt-1.5 text-sm leading-relaxed text-muted-foreground',
                !description && 'sr-only',
              )}
            >
              {description ?? 'Диалоговое окно'}
            </Dialog.Description>
          </div>

          {children ? <div className="mt-5">{children}</div> : null}

          {footer ? (
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
