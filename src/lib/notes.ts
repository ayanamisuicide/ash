import { db, ensureGuild } from '../storage/sqlite.js';

/** Заметка о пользователе: не наказание, а внутренняя информация для staff */
export interface Note {
  id: string;
  text: string;
  authorId: string;
  createdAt: number;
}

interface NoteRow {
  id: string;
  text: string;
  author_id: string;
  created_at: number;
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    text: row.text,
    authorId: row.author_id,
    createdAt: Number(row.created_at),
  };
}

export function getNotes(guildId: string, userId: string): Note[] {
  const rows = db
    .prepare(`
      SELECT id, text, author_id, created_at
      FROM notes
      WHERE guild_id = ? AND user_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .all(guildId, userId) as unknown as NoteRow[];

  return rows.map(rowToNote);
}

export function addNote(
  guildId: string,
  userId: string,
  authorId: string,
  text: string,
): Note {
  ensureGuild(guildId);
  const note: Note = {
    id: Math.random().toString(36).slice(2, 8),
    text,
    authorId,
    createdAt: Date.now(),
  };

  db.prepare(`
    INSERT INTO notes (guild_id, user_id, id, text, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, note.id, note.text, note.authorId, note.createdAt);

  return note;
}

export function removeNote(guildId: string, userId: string, noteId: string): Note | null {
  const row = db
    .prepare(`
      SELECT id, text, author_id, created_at
      FROM notes
      WHERE guild_id = ? AND user_id = ? AND id = ?
    `)
    .get(guildId, userId, noteId) as NoteRow | undefined;

  if (!row) return null;

  db.prepare('DELETE FROM notes WHERE guild_id = ? AND user_id = ? AND id = ?').run(
    guildId,
    userId,
    noteId,
  );
  return rowToNote(row);
}

export function clearNotes(guildId: string, userId: string): Note[] {
  const notes = getNotes(guildId, userId);
  db.prepare('DELETE FROM notes WHERE guild_id = ? AND user_id = ?').run(
    guildId,
    userId,
  );
  return notes;
}
