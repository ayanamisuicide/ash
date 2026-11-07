import {
  Events,
  type DMChannel,
  type ForumChannel,
  type GuildBan,
  type GuildEmoji,
  type GuildMember,
  type MediaChannel,
  type NewsChannel,
  type NonThreadGuildBasedChannel,
  type PartialGuildMember,
  type Role,
  type Sticker,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { recordNuke } from '../lib/nuke.js';

type WebhookChannel = TextChannel | NewsChannel | VoiceChannel | ForumChannel | MediaChannel;

const events: AnyBotEvent[] = [
  {
    name: Events.GuildBanAdd,
    async execute(ban: GuildBan) {
      await recordNuke(ban.guild, 'ban', ban.user.id);
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember | PartialGuildMember) {
      // recordNuke сам проверит Audit Log и отсеет обычные выходы.
      await recordNuke(member.guild, 'kick', member.id);
    },
  },
  {
    name: Events.ChannelDelete,
    async execute(channel: DMChannel | NonThreadGuildBasedChannel) {
      if (!('guild' in channel)) return;
      await recordNuke(channel.guild, 'channelDelete', channel.id);
    },
  },
  {
    name: Events.GuildRoleDelete,
    async execute(role: Role) {
      await recordNuke(role.guild, 'roleDelete', role.id);
    },
  },
  {
    name: Events.GuildEmojiDelete,
    async execute(emoji: GuildEmoji) {
      await recordNuke(emoji.guild, 'emojiDelete', emoji.id);
    },
  },
  {
    name: Events.GuildStickerDelete,
    async execute(sticker: Sticker) {
      const guild = sticker.guild;
      if (!guild) return;
      await recordNuke(guild, 'stickerDelete', sticker.id);
    },
  },
  {
    name: Events.WebhooksUpdate,
    async execute(channel: WebhookChannel) {
      await recordNuke(channel.guild, 'webhookUpdate', channel.id);
    },
  },
  {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
      if (!member.user.bot) return;
      await recordNuke(member.guild, 'botAdd', member.id);
    },
  },
];

export default events;
