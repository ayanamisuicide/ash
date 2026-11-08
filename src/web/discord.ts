import { config } from '../config.js';

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

interface DiscordUserResponse {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

const DISCORD_API = 'https://discord.com/api/v10';

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.web.oauthRedirectUrl,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.web.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.web.oauthRedirectUrl,
  });

  const token = await fetchJson<TokenResponse>(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!token.access_token) throw new Error('Discord не вернул access_token');
  return token.access_token;
}

export async function fetchCurrentUser(accessToken: string): Promise<DiscordUser> {
  const raw = await fetchJson<DiscordUserResponse>(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!raw.id || !raw.username) throw new Error('Discord вернул некорректный профиль');
  return {
    id: raw.id,
    username: raw.username,
    globalName: raw.global_name ?? null,
    avatar: raw.avatar ?? null,
  };
}

function defaultAvatarIndex(id: string): number {
  try {
    return Number((BigInt(id) >> 22n) % 6n);
  } catch {
    return 0;
  }
}

export function avatarUrl(user: DiscordUser, size = 64): string {
  if (!user.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex(user.id)}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
}

export function guildIconUrl(guildId: string, icon: string | null, size = 64): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=${size}`;
}
