import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import type { GuildSummary } from '@/api/types';
import { cn } from '@/lib/utils';

interface GuildAvatarProps {
  guild: Pick<GuildSummary, 'name' | 'iconUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 rounded-lg text-xs',
  md: 'h-9 w-9 rounded-xl text-xs',
  lg: 'h-10 w-10 rounded-xl text-sm',
} as const;

export function GuildAvatar({ guild, size = 'md', className }: GuildAvatarProps) {
  return (
    <Avatar className={cn(sizeClasses[size], className)} aria-hidden="true">
      {guild.iconUrl ? <AvatarImage src={guild.iconUrl} alt="" /> : null}
      <AvatarFallback className="rounded-[inherit]">
        {guild.name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
