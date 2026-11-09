import { create } from 'zustand';
import type { AuthUser, BotInfo, GuildAccess, GuildSummary, MeResponse } from '@/api/types';
import { ACTIVE_GUILD_STORAGE_KEY } from '@/lib/constants';

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'guest';

export interface AuthState {
  user: AuthUser | null;
  guilds: GuildSummary[];
  activeGuildId: string | null;
  /** Права на активном сервере. Заполняются из overview на шаге 2. */
  access: GuildAccess | null;
  csrf: string | null;
  bot: BotInfo | null;
  status: SessionStatus;
  sessionError: string | null;

  setSession: (session: MeResponse) => void;
  setStatus: (status: SessionStatus) => void;
  setSessionError: (error: string | null) => void;
  setActiveGuild: (guildId: string) => void;
  setAccess: (access: GuildAccess | null) => void;
  clearSession: () => void;
}

function readStoredGuildId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_GUILD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredGuildId(guildId: string | null): void {
  try {
    if (guildId) {
      window.localStorage.setItem(ACTIVE_GUILD_STORAGE_KEY, guildId);
    } else {
      window.localStorage.removeItem(ACTIVE_GUILD_STORAGE_KEY);
    }
  } catch {
    // Приватный режим/запрет storage не должны ломать панель.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  guilds: [],
  activeGuildId: null,
  access: null,
  csrf: null,
  bot: null,
  status: 'idle',
  sessionError: null,

  setSession: (session) => {
    const preferredGuildId = get().activeGuildId ?? readStoredGuildId();
    const activeGuildId =
      session.guilds.find((guild) => guild.id === preferredGuildId)?.id ??
      session.guilds[0]?.id ??
      null;

    writeStoredGuildId(activeGuildId);
    set({
      user: session.user,
      guilds: session.guilds,
      activeGuildId,
      csrf: session.csrf,
      bot: session.bot,
      status: 'authenticated',
      sessionError: null,
    });
  },

  setStatus: (status) => set({ status }),
  setSessionError: (sessionError) => set({ sessionError }),

  setActiveGuild: (guildId) => {
    writeStoredGuildId(guildId);
    // Права привязаны к конкретному серверу — сбрасываем до нового overview.
    set({ activeGuildId: guildId, access: null });
  },

  setAccess: (access) => set({ access }),

  clearSession: () => {
    writeStoredGuildId(null);
    set({
      user: null,
      guilds: [],
      activeGuildId: null,
      access: null,
      csrf: null,
      bot: null,
      status: 'guest',
      sessionError: null,
    });
  },
}));

export const selectActiveGuild = (state: AuthState): GuildSummary | null =>
  state.guilds.find((guild) => guild.id === state.activeGuildId) ?? null;

export const selectCanAdmin = (state: AuthState): boolean =>
  selectActiveGuild(state)?.level === 'admin';
