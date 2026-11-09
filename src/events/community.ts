import {
  Events,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type Role,
} from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { V2 } from '../lib/card.js';
import { addXp, getCommunitySettings, renderTemplate } from '../lib/community.js';
import { goodbyeMessage, levelUpMessage, welcomeMessage } from '../lib/responses.js';

type TemplateKind = 'welcome' | 'goodbye' | 'levelup';

async function sendTemplate(
  channelId: string | null,
  guild: GuildMember['guild'],
  template: string,
  member: GuildMember,
  kind: TemplateKind,
  extra: Record<string, string | number> = {},
): Promise<void> {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const content = renderTemplate(template, {
    user: `${member}`,
    guild: guild.name,
    memberCount: guild.memberCount,
    ...extra,
  });

  const view =
    kind === 'welcome'
      ? welcomeMessage(member.user, guild, guild.memberCount, content)
      : kind === 'goodbye'
        ? goodbyeMessage(member.user, guild, content)
        : levelUpMessage(member.user, Number(extra.level ?? 0), Number(extra.xp ?? 0), content);

  await channel
    .send({
      components: [view],
      flags: V2,
    })
    .catch(() => undefined);
}

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

      await sendTemplate(
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
      await sendTemplate(
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
      if (!settings.levelingEnabled) return;

      const gained = addXp(
        guild.id,
        message.author.id,
        15 + Math.floor(Math.random() * 11),
        60_000,
      );
      if (!gained.gained) return;
      if (gained.after.level <= gained.before.level) return;

      const member =
        message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return;

      await sendTemplate(
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
