import type { Guild } from 'discord.js';
import { createCase } from '../cases.js';
import { COLORS } from '../embeds.js';
import { logCard } from '../logCard.js';
import { sendLog } from '../logger.js';
import { addNote, clearNotes, removeNote } from '../notes.js';
import {
  fail,
  fetchUser,
  ok,
  type ActionResult,
} from './helpers.js';

export async function noteAddAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
  text: string,
): Promise<ActionResult> {
  const target = await fetchUser(guild, userId);
  const note = addNote(guild.id, userId, moderatorId, text);
  const modCase = createCase({
    guildId: guild.id,
    type: 'note',
    userId,
    moderatorId,
    reason: text,
    active: false,
    extra: { noteId: note.id },
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: '📝 Заметка добавлена',
      color: COLORS.primary,
      actor: target
        ? { name: target.tag, iconURL: target.displayAvatarURL() }
        : undefined,
      fields: [
        { name: 'Кому', value: target ? `${target}` : `<@${userId}>`, inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Кейс', value: `#${modCase.id}`, inline: true },
        { name: 'Текст', value: text },
      ],
      footer: `ID: ${userId}`,
    }),
    'noteAdd',
  );

  return ok(`Заметка \`${note.id}\` добавлена.`, modCase.id);
}

export async function noteRemoveAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
  noteId: string,
): Promise<ActionResult> {
  const removed = removeNote(guild.id, userId, noteId);
  if (!removed) return fail(`Заметка \`${noteId}\` не найдена.`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'noteRemove',
    userId,
    moderatorId,
    reason: removed.text,
    active: false,
    extra: { noteId },
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: '🗑️ Заметка удалена',
      color: COLORS.gray,
      fields: [
        { name: 'Кому', value: `<@${userId}>`, inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Кейс', value: `#${modCase.id}`, inline: true },
        { name: 'Текст', value: removed.text },
      ],
      footer: `ID: ${userId}`,
    }),
    'noteRemove',
  );

  return ok(`Заметка \`${noteId}\` удалена.`, modCase.id);
}

export async function noteClearAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
): Promise<ActionResult> {
  const removed = clearNotes(guild.id, userId);
  if (removed.length === 0) return fail('У этого участника нет заметок.');

  const modCase = createCase({
    guildId: guild.id,
    type: 'noteRemove',
    userId,
    moderatorId,
    reason: `Удалено заметок: ${removed.length}`,
    active: false,
    extra: { count: removed.length },
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: '🗑️ Заметки удалены',
      color: COLORS.gray,
      fields: [
        { name: 'Кому', value: `<@${userId}>`, inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Кейс', value: `#${modCase.id}`, inline: true },
        { name: 'Удалено', value: String(removed.length), inline: true },
      ],
      footer: `ID: ${userId}`,
    }),
    'noteRemove',
  );

  return ok(`Удалено заметок: **${removed.length}**.`, modCase.id);
}
