import {
  Events,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type Role,
} from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { getCommunitySettings, recordMessage } from '../lib/community.js';
import { sendCommunityTemplate } from '../lib/communityMessages.js';
import { applyLevelRewards } from '../lib/levelRewards.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
      const settings = getCommunitySettings(member.guild.id);

      if (settings.autoroleIds.length > 0) {
        const me = member.guild.members.me;
        const roles = settings.autoroleIds
          .map((roleId) => member.guild.roles.cache.get(roleId))
          .filter(
            (role): role is Role =>
              role !== undefined &&
              !role.managed &&
              role.id !== member.guild.id &&
              (!me || role.position < me.roles.highest.position),
          );
        if (roles.length > 0) {
          await member.roles.add(roles, 'Autorole').catch(() => undefined);
        }
      }

      await sendCommunityTemplate(
        settings.welcomeChannelId,
        member.guild,
        settings.welcomeMessage,
        member,
        'welcome',
      );
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember | PartialGuildMember) {
      const settings = getCommunitySettings(member.guild.id);
      await sendCommunityTemplate(
        settings.goodbyeChannelId,
        member.guild,
        settings.goodbyeMessage,
        member as GuildMember,
        'goodbye',
      );
    },
  },
  {
    name: Events.MessageCreate,
    async execute(message: Message) {
      const guild = message.guild;
      if (!guild || message.author.bot) return;

      const settings = getCommunitySettings(guild.id);

      // Статистика сообщений ведётся всегда, XP — только по настройкам уровней.
      const gained = recordMessage(
        guild.id,
        message.author.id,
        settings.levelingEnabled ? settings.messageXp : 0,
        Math.max(0, settings.messageCooldownSec) * 1_000,
      );
      if (!gained.gained) return;
      if (gained.after.level <= gained.before.level) return;

      const member =
        message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return;

      await applyLevelRewards(guild, member, gained.before.level, gained.after.level);

      await sendCommunityTemplate(
        settings.levelupChannelId ?? message.channelId,
        guild,
        settings.levelupMessage,
        member,
        'levelup',
        { level: gained.after.level, xp: gained.after.xp },
      );
    },
  },
];

export default events;
