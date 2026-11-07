import type { Guild, GuildMember, PartialGuildMember, Role } from 'discord.js';
import { getModerationSettings } from './modSettings.js';
import { db, ensureGuild, transaction } from '../storage/sqlite.js';

interface RoleRow {
  role_id: string;
}

export function getPersistedRoles(guildId: string, userId: string): string[] {
  const rows = db
    .prepare(
      `
      SELECT role_id FROM persisted_roles
      WHERE guild_id = ? AND user_id = ?
      ORDER BY role_id
    `,
    )
    .all(guildId, userId) as unknown as RoleRow[];
  return rows.map((row) => row.role_id);
}

export function setPersistedRoles(guildId: string, userId: string, roleIds: string[]): void {
  ensureGuild(guildId);
  transaction(() => {
    db.prepare('DELETE FROM persisted_roles WHERE guild_id = ? AND user_id = ?').run(
      guildId,
      userId,
    );
    const insert = db.prepare(`
      INSERT OR IGNORE INTO persisted_roles (guild_id, user_id, role_id)
      VALUES (?, ?, ?)
    `);
    for (const roleId of [...new Set(roleIds)]) {
      insert.run(guildId, userId, roleId);
    }
  });
}

export function removePersistedRole(guildId: string, userId: string, roleId: string): boolean {
  const result = db
    .prepare(
      `
      DELETE FROM persisted_roles
      WHERE guild_id = ? AND user_id = ? AND role_id = ?
    `,
    )
    .run(guildId, userId, roleId);
  return Number(result.changes) > 0;
}

export function clearPersistedRoles(guildId: string, userId: string): void {
  db.prepare('DELETE FROM persisted_roles WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function manageableRoles(guild: Guild, member: GuildMember | PartialGuildMember): Role[] {
  const me = guild.members.me;
  if (!me) return [];
  const muteRoleId = getModerationSettings(guild.id).muteRoleId;

  return [...member.roles.cache.values()].filter(
    (role) =>
      role.id !== guild.id &&
      role.id !== muteRoleId &&
      !role.managed &&
      role.position < me.roles.highest.position,
  );
}

export function saveMemberRoles(guild: Guild, member: GuildMember | PartialGuildMember): void {
  if (member.user.bot) return;
  const roleIds = manageableRoles(guild, member).map((role) => role.id);
  if (roleIds.length === 0) {
    clearPersistedRoles(guild.id, member.id);
    return;
  }
  setPersistedRoles(guild.id, member.id, roleIds);
}

export async function restoreMemberRoles(guild: Guild, member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const stored = getPersistedRoles(guild.id, member.id);
  if (stored.length === 0) return;

  const me = guild.members.me;
  const muteRoleId = getModerationSettings(guild.id).muteRoleId;
  const roles = stored
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter(
      (role): role is Role =>
        role !== undefined &&
        role.id !== guild.id &&
        role.id !== muteRoleId &&
        !role.managed &&
        (!me || role.position < me.roles.highest.position),
    );

  if (roles.length > 0) {
    await member.roles
      .add(roles, 'Rolepersist: восстановление ролей после возврата')
      .catch(() => undefined);
  }

  clearPersistedRoles(guild.id, member.id);
}
