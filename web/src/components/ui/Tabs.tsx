import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function sameRect(a: IndicatorRect | null, b: IndicatorRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, forwardedRef) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = React.useState<IndicatorRect | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef],
  );

  const measure = React.useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) {
      setIndicator((current) => (current === null ? current : null));
      return;
    }

    const listRect = list.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    // left-0/top-0 у абсолютного индикатора отсчитываются от padding box,
    // поэтому компенсируем толщину рамки и скролл списка (например, в
    // профиле участника вкладки прокручиваются по горизонтали).
    const next: IndicatorRect = {
      left: rect.left - listRect.left + list.scrollLeft - list.clientLeft,
      top: rect.top - listRect.top + list.scrollTop - list.clientTop,
      width: rect.width,
      height: rect.height,
    };

    setIndicator((current) => (sameRect(current, next) ? current : next));
  }, []);

  // Radix переключает data-state на триггерах — ловим это и плавно
  // перевозим подсветку к активной вкладке вместо мгновенной смены фона.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    measure();

    const observer = new MutationObserver(measure);
    observer.observe(list, {
      attributes: true,
      attributeFilter: ['data-state'],
      childList: true,
      characterData: true,
      subtree: true,
    });

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(list);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn(
        'relative flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1',
        className,
      )}
      {...props}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          style={{
            width: indicator.width,
            height: indicator.height,
            transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
          }}
          className="pointer-events-none absolute left-0 top-0 rounded-lg border border-accent/20 bg-accent/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,width,height] duration-300 ease-out-soft"
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'focus-ring relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors duration-200',
      'hover:bg-white/[0.04] hover:text-foreground',
      'data-[state=active]:text-accent-soft data-[state=active]:hover:bg-transparent',
      'disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
    // Панели рендерятся отдельно; не оставляем aria-controls на несуществующий id.
    aria-controls={undefined}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = TabsPrimitive.Content;

export { Tabs, TabsList, TabsTrigger, TabsContent };
