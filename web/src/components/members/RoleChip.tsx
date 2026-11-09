import type { MemberRole } from '@/api/types';
import { cn } from '@/lib/utils';

function roleHex(color: number): string | null {
  if (!color) return null;
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface RoleChipProps {
  role: MemberRole;
  className?: string;
}

/** Цвет роли из Discord — числовой 0xRRGGBB, поэтому красим точку и рамку inline */
export function RoleChip({ role, className }: RoleChipProps) {
  const hex = roleHex(role.color);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        !hex && 'border-white/[0.08] bg-white/[0.04] text-muted-foreground',
        className,
      )}
      style={hex ? { borderColor: `${hex}42`, backgroundColor: `${hex}14` } : undefined}
      title={role.name}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: hex ?? 'currentColor' }}
        aria-hidden
      />
      <span className="truncate text-foreground/85">{role.name}</span>
      {role.managed ? (
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          bot
        </span>
      ) : null}
    </span>
  );
}
