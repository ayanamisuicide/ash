import type { Guild, GuildTextBasedChannel, Message } from 'discord.js';
import { db, ensureGuild } from '../storage/sqlite.js';
import type { Ticket } from './community.js';

const MAX_MESSAGES = 500;
const PAGE_SIZE = 100;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchAllMessages(channel: GuildTextBasedChannel): Promise<Message[]> {
  const collected: Message[] = [];
  let before: string | undefined;

  while (collected.length < MAX_MESSAGES) {
    const batch = await channel.messages
      .fetch(before ? { limit: PAGE_SIZE, before } : { limit: PAGE_SIZE })
      .catch(() => null);
    if (!batch || batch.size === 0) break;

    const values = [...batch.values()];
    values.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    collected.push(...values);
    before = values[0]?.id;
    if (batch.size < PAGE_SIZE) break;
  }

  return collected.slice(-MAX_MESSAGES);
}

function renderMessage(message: Message): string {
  const author = escapeHtml(message.author.tag);
  const avatar = message.author.displayAvatarURL({ size: 64, extension: 'png' });
  const time = formatDate(message.createdTimestamp);
  const body = message.content ? `<div class="text">${escapeHtml(message.content)}</div>` : '';

  const attachments = [...message.attachments.values()]
    .map(
      (attachment) =>
        `<div class="attachment">📎 <a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${escapeHtml(attachment.name)}</a></div>`,
    )
    .join('');

  return `<div class="message">
    <img class="avatar" src="${escapeHtml(avatar)}" alt="">
    <div class="body">
      <div class="meta"><span class="author">${author}</span><span class="time">${time}</span></div>
      ${body}${attachments}
    </div>
  </div>`;
}

export function renderTranscript(guild: Guild, ticket: Ticket, messages: Message[]): string {
  const rows = messages.map(renderMessage).join('\n');
  const opened = formatDate(ticket.createdAt);
  const closed = ticket.closedAt ? formatDate(ticket.closedAt) : '—';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Тикет ${escapeHtml(ticket.channelId)} · ${escapeHtml(guild.name)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #0b0d12; color: #e8ebf2; font: 14px/1.55 "Inter", "Segoe UI", sans-serif; }
  .wrap { max-width: 920px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #8d97ac; font-size: 12px; margin-bottom: 18px; }
  .message { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,.06); }
  .avatar { width: 36px; height: 36px; border-radius: 50%; flex: none; background: #1a1d26; }
  .body { min-width: 0; }
  .meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 2px; }
  .author { font-weight: 600; }
  .time { color: #8d97ac; font-size: 11px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .attachment { margin-top: 4px; font-size: 12px; }
  a { color: #7c8cff; }
  .empty { color: #8d97ac; padding: 24px 0; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Тикет · ${escapeHtml(guild.name)}</h1>
    <div class="sub">Автор: ${escapeHtml(ticket.userId)} · Открыт: ${opened} · Закрыт: ${closed} · Сообщений: ${messages.length}</div>
    ${rows || '<div class="empty">В тикете не было сообщений.</div>'}
  </div>
</body>
</html>`;
}

/** Сохраняет HTML-транскрипт тикета перед удалением канала. */
export async function archiveTicketTranscript(guild: Guild, ticket: Ticket): Promise<boolean> {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel?.isTextBased()) return false;

  try {
    const messages = await fetchAllMessages(channel);
    const html = renderTranscript(guild, ticket, messages);
    ensureGuild(guild.id);
    db.prepare(
      `
      INSERT INTO ticket_transcripts (guild_id, channel_id, html, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET html = excluded.html, created_at = excluded.created_at
    `,
    ).run(guild.id, ticket.channelId, html, Date.now());
    return true;
  } catch (error) {
    console.error(`[tickets] не удалось сохранить транскрипт ${ticket.channelId}:`, error);
    return false;
  }
}

export function getTicketTranscript(guildId: string, channelId: string): string | null {
  const row = db
    .prepare('SELECT html FROM ticket_transcripts WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId) as { html: string } | undefined;
  return row?.html ?? null;
}

export function hasTicketTranscript(guildId: string, channelId: string): boolean {
  const row = db
    .prepare('SELECT 1 AS ok FROM ticket_transcripts WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId) as { ok: number } | undefined;
  return Boolean(row);
}
