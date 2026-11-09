import { closeActiveCases, closeWarnCases, type CaseType } from './cases.js';
import { clearWarns } from './warns.js';

export const MEMBER_LEFT_REASON = 'Участник покинул сервер';

/**
 * Наказания, которые имеют смысл только пока участник находится на сервере.
 * Бан сюда не входит: он продолжает действовать в Discord, даже когда
 * участник уже не состоит в гильдии.
 */
const PRESENCE_PUNISHMENTS: CaseType[] = ['mute', 'timeout', 'temprole'];

/**
 * Сбрасывает накопленные предупреждения и активные наказания участника.
 * Вызывается, когда участник покидает сервер (сам, кикнут или забанен),
 * чтобы при возврате он начинал с чистого листа.
 */
export function clearMemberPunishments(guildId: string, userId: string): number {
  const warns = clearWarns(guildId, userId);
  closeWarnCases(guildId, userId, MEMBER_LEFT_REASON);
  closeActiveCases(guildId, userId, PRESENCE_PUNISHMENTS, MEMBER_LEFT_REASON);
  return warns.length;
}
