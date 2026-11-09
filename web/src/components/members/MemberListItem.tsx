import type { ReactNode } from 'react';
import { Bot, ChevronRight, Timer, VolumeX } from 'lucide-react';
import type { MemberSummary } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { getInitials } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MemberListItemProps {
  member: MemberSummary;
  selected: boolean;
  onSelect: (member: MemberSummary) => void;
}

function MiniBadge({ children, tone }: { children: ReactNode; tone: 'warning' | 'info' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none',
        tone === 'warning'
          ? 'border-warning/20 bg-warning/10 text-warning'
          : 'border-info/20 bg-info/10 text-info',
      )}
    >
      {children}
    </span>
  );
}

export function MemberListItem({ member, selected, onSelect }: MemberListItemProps) {
  const timeoutActive = Boolean(member.timeoutUntil && member.timeoutUntil > Date.now());

  return (
    <button
      type="button"
      onClick={() => onSelect(member)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selected
          ? 'border-accent/30 bg-accent/[0.12]'
          : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.04]',
      )}
    >
      <Avatar className="h-10 w-10 rounded-xl">
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
        <AvatarFallback>{getInitials(member.displayName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold leading-tight">{member.displayName}</p>
          {member.bot ? <Bot className="h-3 w-3 shrink-0 text-info" aria-label="Бот" /> : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">
          @{member.username}
        </p>

        {member.muted || timeoutActive || member.highestRole ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {member.muted ? (
              <MiniBadge tone="warning">
                <VolumeX className="h-2.5 w-2.5" />
                мут
              </MiniBadge>
            ) : null}
            {timeoutActive ? (
              <MiniBadge tone="info">
                <Timer className="h-2.5 w-2.5" />
                таймаут
              </MiniBadge>
            ) : null}
            {member.highestRole ? (
              <span className="truncate text-[11px] text-muted-foreground/80">
                {member.highestRole}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ChevronRight
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-opacity',
          selected
            ? 'text-accent opacity-100'
            : 'text-muted-foreground opacity-0 group-hover:opacity-70',
        )}
        aria-hidden
      />
    </button>
  );
}
