import { AuditLogEvent, Events, type VoiceState } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import { isLogEventEnabled, fmtUser, reasonValue, sendLog } from '../../lib/logging.js';

const events: AnyBotEvent[] = [
  {
    name: Events.VoiceStateUpdate,
    async execute(oldState: VoiceState, newState: VoiceState) {
      const member = newState.member ?? oldState.member;
      if (!member) return;

      const guild = newState.guild ?? oldState.guild;
      if (!isLogEventEnabled(guild.id, 'voiceStateUpdate')) return;
      const changes: string[] = [];

      if (!oldState.channelId && newState.channelId) {
        changes.push(`**Подключился:** <#${newState.channelId}>`);
      } else if (oldState.channelId && !newState.channelId) {
        changes.push(`**Отключился:** <#${oldState.channelId}>`);
      } else if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId
      ) {
        changes.push(`**Перешёл:** <#${oldState.channelId}> → <#${newState.channelId}>`);
      }

      const flagChanges: Array<[string, boolean, boolean]> = [
        ['Микрофон выключен', oldState.selfMute ?? false, newState.selfMute ?? false],
        ['Наушники выключены', oldState.selfDeaf ?? false, newState.selfDeaf ?? false],
        ['Заглушен сервером', oldState.serverMute ?? false, newState.serverMute ?? false],
        ['Оглушён сервером', oldState.serverDeaf ?? false, newState.serverDeaf ?? false],
        ['Камера', oldState.selfVideo ?? false, newState.selfVideo ?? false],
        ['Стрим', oldState.streaming ?? false, newState.streaming ?? false],
      ];

      for (const [label, before, after] of flagChanges) {
        if (before !== after) {
          changes.push(`**${label}:** ${before ? 'да' : 'нет'} → ${after ? 'да' : 'нет'}`);
        }
      }

      if (changes.length === 0) return;

      // Причину можно достать из аудита только для действий модератора:
      // перемещение/отключение из голосового канала и server mute/deaf.
      const moved = Boolean(
        oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId,
      );
      const disconnected = Boolean(oldState.channelId && !newState.channelId);
      const serverAudioChanged =
        oldState.serverMute !== newState.serverMute || oldState.serverDeaf !== newState.serverDeaf;

      let audit: Awaited<ReturnType<typeof auditInfo>> | null = null;
      if (moved || disconnected) {
        audit = await auditInfo(
          guild,
          moved ? AuditLogEvent.MemberMove : AuditLogEvent.MemberDisconnect,
          member.id,
        );
      } else if (serverAudioChanged) {
        audit = await auditInfo(guild, AuditLogEvent.MemberUpdate, member.id);
      }

      const fields = [{ name: 'Участник', value: fmtUser(member.user), inline: true }];
      if (audit?.executor) {
        fields.push({ name: 'Кем', value: fmtUser(audit.executor), inline: true });
      }
      fields.push({ name: 'Причина', value: reasonValue(audit?.reason), inline: false });

      const embed = logCard(guild, {
        title: '🔊 Голосовое состояние',
        color: COLORS.primary,
        actor: {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        },
        description: changes.join('\n'),
        fields,
        footer: `ID: ${member.id}`,
      });

      await sendLog(guild, embed, 'voiceStateUpdate');
    },
  },
];

export default events;
