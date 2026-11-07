import {
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import { createCase } from '../cases.js';
import { COLORS } from '../embeds.js';
import { logCard } from '../logCard.js';
import { clearLock, getLock, listLocks, setLock, type LockState } from '../locks.js';
import { sendLog } from '../logger.js';
import { fail, ok, type ActionResult } from './helpers.js';

function overwriteValue(state: LockState, bit: bigint): boolean | null {
  const allow = BigInt(state.allow || '0');
  const deny = BigInt(state.deny || '0');
  if ((allow & bit) !== 0n) return true;
  if ((deny & bit) !== 0n) return false;
  return null;
}

export async function lockChannel(
  guild: Guild,
  channel: GuildTextBasedChannel,
  moderatorId: string,
  reason: string,
  options: { log?: boolean; record?: boolean } = {},
): Promise<ActionResult> {
  if (channel.isThread()) return fail('Ветки нельзя блокировать этой командой.');

  const everyone = guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
  const existing = getLock(guild.id, channel.id);
  if (existing) {
    const lockedNow = overwrite?.deny.has(PermissionFlagsBits.SendMessages) ?? false;
    if (lockedNow) return fail(`Канал <#${channel.id}> уже заблокирован.`);
    // Канал разблокировали вручную — старые сохранённые права больше не актуальны.
    clearLock(guild.id, channel.id);
  }

  const state: LockState = {
    allow: overwrite?.allow.bitfield.toString() ?? '0',
    deny: overwrite?.deny.bitfield.toString() ?? '0',
  };
  setLock(guild.id, channel.id, state);

  try {
    await channel.permissionOverwrites.edit(
      everyone,
      {
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
      },
      { reason: `Модератор ${moderatorId}: ${reason}` },
    );
  } catch (error) {
    console.error('[moderation] не удалось заблокировать канал:', error);
    clearLock(guild.id, channel.id);
    return fail('Не удалось изменить права канала.');
  }

  const modCase =
    options.record === false
      ? null
      : createCase({
          guildId: guild.id,
          type: 'lock',
          userId: null,
          moderatorId,
          reason,
          active: false,
          extra: { channelId: channel.id },
        });

  if (options.log !== false) {
    await sendLog(
      guild,
      logCard(guild, {
        title: '🔒 Канал заблокирован',
        color: COLORS.danger,
        fields: [
          { name: 'Канал', value: `<#${channel.id}>`, inline: true },
          { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
          { name: 'Причина', value: reason },
        ],
      }),
      'channelUpdate',
    );
  }

  return ok(`🔒 Канал <#${channel.id}> заблокирован.`, modCase?.id);
}

export async function unlockChannel(
  guild: Guild,
  channel: GuildTextBasedChannel,
  moderatorId: string,
  reason: string,
  options: { log?: boolean; record?: boolean } = {},
): Promise<ActionResult> {
  if (channel.isThread()) return fail('Ветки нельзя разблокировать этой командой.');

  const everyone = guild.roles.everyone;
  const state = getLock(guild.id, channel.id);

  try {
    if (state) {
      await channel.permissionOverwrites.edit(
        everyone,
        {
          SendMessages: overwriteValue(state, PermissionFlagsBits.SendMessages),
          AddReactions: overwriteValue(state, PermissionFlagsBits.AddReactions),
          SendMessagesInThreads: overwriteValue(
            state,
            PermissionFlagsBits.SendMessagesInThreads,
          ),
          CreatePublicThreads: overwriteValue(
            state,
            PermissionFlagsBits.CreatePublicThreads,
          ),
          CreatePrivateThreads: overwriteValue(
            state,
            PermissionFlagsBits.CreatePrivateThreads,
          ),
        },
        { reason: `Модератор ${moderatorId}: ${reason}` },
      );
      clearLock(guild.id, channel.id);
    } else {
      await channel.permissionOverwrites.edit(
        everyone,
        {
          SendMessages: null,
          AddReactions: null,
          SendMessagesInThreads: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null,
        },
        { reason: `Модератор ${moderatorId}: ${reason}` },
      );
    }
  } catch (error) {
    console.error('[moderation] не удалось разблокировать канал:', error);
    return fail('Не удалось изменить права канала.');
  }

  const modCase =
    options.record === false
      ? null
      : createCase({
          guildId: guild.id,
          type: 'unlock',
          userId: null,
          moderatorId,
          reason,
          active: false,
          extra: { channelId: channel.id },
        });

  if (options.log !== false) {
    await sendLog(
      guild,
      logCard(guild, {
        title: '🔓 Канал разблокирован',
        color: COLORS.success,
        fields: [
          { name: 'Канал', value: `<#${channel.id}>`, inline: true },
          { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
          { name: 'Причина', value: reason },
        ],
      }),
      'channelUpdate',
    );
  }

  return ok(`🔓 Канал <#${channel.id}> разблокирован.`, modCase?.id);
}

export async function lockdownGuild(
  guild: Guild,
  moderatorId: string,
  reason: string,
): Promise<ActionResult> {
  const channels = [...guild.channels.cache.values()].filter(
    (channel): channel is GuildTextBasedChannel =>
      channel.isTextBased() && !channel.isThread(),
  );

  let count = 0;
  for (const channel of channels) {
    const result = await lockChannel(guild, channel, moderatorId, reason, {
      log: false,
      record: false,
    });
    if (result.ok) count++;
  }

  if (count === 0) return fail('Не удалось заблокировать каналы.');

  const modCase = createCase({
    guildId: guild.id,
    type: 'lock',
    userId: null,
    moderatorId,
    reason,
    active: false,
    extra: { lockdown: true, count },
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: '🔒 Lockdown сервера',
      color: COLORS.danger,
      fields: [
        { name: 'Каналов', value: String(count), inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Причина', value: reason },
      ],
      footer: `Кейс #${modCase.id}`,
    }),
    'channelUpdate',
  );

  return ok(`🔒 Заблокировано каналов: **${count}**.`, modCase.id);
}

export async function unlockAll(
  guild: Guild,
  moderatorId: string,
  reason: string,
): Promise<ActionResult> {
  const channelIds = Object.keys(listLocks(guild.id));
  if (channelIds.length === 0) return fail('На сервере нет заблокированных ботом каналов.');

  let count = 0;
  for (const channelId of channelIds) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased() || channel.isThread()) continue;
    const result = await unlockChannel(guild, channel, moderatorId, reason, {
      log: false,
      record: false,
    });
    if (result.ok) count++;
  }

  if (count === 0) return fail('Не удалось разблокировать каналы.');

  const modCase = createCase({
    guildId: guild.id,
    type: 'unlock',
    userId: null,
    moderatorId,
    reason,
    active: false,
    extra: { lockdown: true, count },
  });

  await sendLog(
    guild,
    logCard(guild, {
      title: '🔓 Снятие lockdown',
      color: COLORS.success,
      fields: [
        { name: 'Каналов', value: String(count), inline: true },
        { name: 'Кем', value: `<@${moderatorId}>`, inline: true },
        { name: 'Причина', value: reason },
      ],
      footer: `Кейс #${modCase.id}`,
    }),
    'channelUpdate',
  );

  return ok(`🔓 Разблокировано каналов: **${count}**.`, modCase.id);
}

export async function setSlowmode(
  guild: Guild,
  channel: GuildTextBasedChannel,
  seconds: number,
  moderatorId: string,
  reason: string,
): Promise<ActionResult> {
  const value = Math.max(0, Math.min(Math.floor(seconds), 21_600));
  try {
    await channel.setRateLimitPerUser(value, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось изменить slowmode:', error);
    return fail('Не удалось изменить медленный режим.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'slowmode',
    userId: null,
    moderatorId,
    reason,
    active: false,
    extra: { channelId: channel.id, seconds: value },
  });
  return ok(
    value === 0
      ? `Медленный режим в <#${channel.id}> отключён.`
      : `Медленный режим в <#${channel.id}>: **${value} с**.`,
    modCase.id,
  );
}
