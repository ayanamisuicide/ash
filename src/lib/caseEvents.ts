import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';

export type CaseEventKind = 'created' | 'reason' | 'duration' | 'status';

export interface CaseEvent {
  id: number;
  guildId: string;
  caseId: number;
  actorId: string;
  kind: CaseEventKind;
  details: Record<string, unknown>;
  createdAt: number;
}

interface CaseEventRow {
  id: number;
  guild_id: string;
  case_id: number;
  actor_id: string;
  kind: string;
  details: string;
  created_at: number;
}

function rowToEvent(row: CaseEventRow): CaseEvent {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    caseId: Number(row.case_id),
    actorId: row.actor_id,
    kind: row.kind as CaseEventKind,
    details: parseJson<Record<string, unknown>>(row.details, {}),
    createdAt: Number(row.created_at),
  };
}

export function addCaseEvent(
  guildId: string,
  caseId: number,
  actorId: string,
  kind: CaseEventKind,
  details: Record<string, unknown> = {},
): void {
  ensureGuild(guildId);
  db.prepare(
    `
    INSERT INTO case_events (guild_id, case_id, actor_id, kind, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(guildId, caseId, actorId, kind, toJson(details), Date.now());
}

export function listCaseEvents(guildId: string, caseId: number, limit = 20): CaseEvent[] {
  const rows = db
    .prepare(
      `
      SELECT * FROM case_events
      WHERE guild_id = ? AND case_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    )
    .all(guildId, caseId, limit) as unknown as CaseEventRow[];
  return rows.map(rowToEvent);
}
