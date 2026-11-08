import crypto from 'node:crypto';

/**
 * Короткий случайный идентификатор (base64url, по умолчанию 12 символов ≈ 72 бита).
 * Используется для варнов, заметок, правил автонаказаний и подтверждений —
 * вместо `Math.random()`, где коллизия могла уронить INSERT.
 */
export function newId(bytes = 9): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
