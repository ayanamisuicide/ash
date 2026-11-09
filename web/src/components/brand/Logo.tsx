import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  /** Скрыть текстовый блок (например, в компактном topbar) */
  markOnly?: boolean;
  size?: 'default' | 'lg';
}

export function Logo({ className, markOnly = false, size = 'default' }: LogoProps) {
  const markSize = size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const svgSize = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('relative grid shrink-0 place-items-center', markSize)}>
        <div className="absolute inset-0 rounded-[inherit] bg-accent/40 blur-lg" aria-hidden />
        <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-[inherit] bg-accent-gradient shadow-button ring-1 ring-inset ring-white/25">
          <svg
            viewBox="0 0 32 32"
            className={cn('text-white', svgSize)}
            fill="none"
            aria-hidden
          >
            <path
              d="M9.5 22.5v-13l13 13v-13"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="25" cy="7" r="1.7" fill="currentColor" fillOpacity="0.85" />
          </svg>
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
            aria-hidden
          />
        </div>
      </div>

      {!markOnly ? (
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-none tracking-[0.18em] text-foreground">
            {APP_NAME}
          </p>
          <p className="mt-1 text-[9px] font-medium uppercase leading-none tracking-[0.2em] text-muted-foreground">
            {APP_SUBTITLE}
          </p>
        </div>
      ) : null}
    </div>
  );
}
