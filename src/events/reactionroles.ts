import {
  Events,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { getReactionRole } from '../lib/community.js';

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | PartialMessageReaction> {
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message.partial) await reaction.message.fetch().catch(() => null);
  return reaction;
}

function findRole(
  guildId: string,
  messageId: string,
  emoji: string,
  emojiName: string | null,
): string | null {
  const exact = getReactionRole(guildId, messageId, emoji);
  if (exact) return exact.roleId;
  if (emojiName) {
    const byName = getReactionRole(guildId, messageId, emojiName);
    if (byName) return byName.roleId;
  }
  return null;
}

async function apply(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  add: boolean,
): Promise<void> {
  const resolved = await resolveReaction(reaction);
  const guild = resolved.message.guild;
  if (!guild) return;
  if (user.bot) return;

  const roleId = findRole(
    guild.id,
    resolved.message.id,
    resolved.emoji.toString(),
    resolved.emoji.name,
  );
  if (!roleId) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (add) {
    await member.roles.add(roleId, 'Reaction role').catch(() => undefined);
  } else {
    await member.roles.remove(roleId, 'Reaction role').catch(() => undefined);
  }
}

const events: AnyBotEvent[] = [
  {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
      await apply(reaction, user, true);
    },
  },
  {
    name: Events.MessageReactionRemove,
    async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
      await apply(reaction, user, false);
    },
  },
];

export default events;
