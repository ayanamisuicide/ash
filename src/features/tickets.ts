import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { V2, card, errorCard } from '../lib/card.js';
import { COLORS } from '../lib/embeds.js';
import {
  closeTicket,
  createTicket,
  findOpenTicket,
  getCommunitySettings,
  getTicket,
} from '../lib/community.js';
import { logCard } from '../lib/logCard.js';

function ticketRow(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Закрыть тикет')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

async function logTicket(
  guild: Guild,
  title: string,
  color: number,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
): Promise<void> {
  const settings = getCommunitySettings(guild.id);
  const channel = settings.ticketLogChannelId
    ? guild.channels.cache.get(settings.ticketLogChannelId)
    : null;
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      components: [
        logCard(guild, {
          title,
          color,
          fields,
        }),
      ],
      flags: V2,
    })
    .catch(() => undefined);
}

export async function handleTicketButton(interaction: ButtonInteraction<'cached'>): Promise<void> {
  const guild = interaction.guild;
  const settings = getCommunitySettings(guild.id);

  if (interaction.customId === 'ticket:open') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const category = settings.ticketCategoryId
      ? guild.channels.cache.get(settings.ticketCategoryId)
      : null;
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply({
        components: [errorCard('Категория тикетов не настроена.')],
        flags: V2,
      });
      return;
    }

    const existing = findOpenTicket(guild.id, interaction.user.id);
    if (existing && guild.channels.cache.has(existing.channelId)) {
      await interaction.editReply({
        components: [errorCard(`У тебя уже есть открытый тикет: <#${existing.channelId}>.`)],
        flags: V2,
      });
      return;
    }
    if (existing) closeTicket(guild.id, existing.channelId);

    const me = guild.members.me;
    if (!me) {
      await interaction.editReply({
        components: [errorCard('Не удалось получить участника бота.')],
        flags: V2,
      });
      return;
    }

    const supportRole = settings.ticketSupportRoleId
      ? guild.roles.cache.get(settings.ticketSupportRoleId)
      : null;

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      ...(supportRole
        ? [
            {
              id: supportRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
              ],
            },
          ]
        : []),
    ];

    const channel = await guild.channels
      .create({
        name: `ticket-${interaction.user.username}`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
        reason: `Тикет: ${interaction.user.tag}`,
      })
      .catch(() => null);

    if (!channel) {
      await interaction.editReply({
        components: [errorCard('Не удалось создать канал тикета.')],
        flags: V2,
      });
      return;
    }

    createTicket(guild.id, channel.id, interaction.user.id);
    await channel.send({
      components: [
        card({
          tone: 'info',
          title: '🎫 Тикет',
          description: `Здравствуйте, ${interaction.user}. Опишите проблему, и модераторы ответят.`,
          fields: [{ label: 'Автор', value: `${interaction.user}`, block: false }],
          buttons: [ticketRow()],
          timestamp: false,
        }),
      ],
      flags: V2,
    });

    await logTicket(guild, '🎫 Тикет открыт', COLORS.success, [
      { name: 'Канал', value: `<#${channel.id}>`, inline: true },
      { name: 'Автор', value: `${interaction.user}`, inline: true },
    ]);

    await interaction.editReply({
      components: [
        card({
          tone: 'success',
          title: '🎫 Тикет создан',
          description: `Канал: <#${channel.id}>`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
    return;
  }

  if (interaction.customId === 'ticket:close') {
    const ticket = getTicket(guild.id, interaction.channelId);
    if (!ticket) {
      await interaction
        .reply({
          components: [errorCard('Это не канал тикета.')],
          flags: V2 | MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
      return;
    }

    const canClose =
      interaction.user.id === ticket.userId ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels));
    if (!canClose) {
      await interaction
        .reply({
          components: [errorCard('Закрыть тикет может автор или модератор.')],
          flags: V2 | MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
      return;
    }

    closeTicket(guild.id, ticket.channelId);
    await logTicket(guild, '🎫 Тикет закрыт', COLORS.danger, [
      { name: 'Канал', value: `<#${ticket.channelId}>`, inline: true },
      { name: 'Автор', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Закрыл', value: `${interaction.user}`, inline: true },
    ]);

    await interaction
      .reply({
        components: [
          card({
            tone: 'success',
            title: '🎫 Тикет закрыт',
            description: 'Канал будет удалён через несколько секунд.',
            timestamp: false,
          }),
        ],
        flags: V2 | MessageFlags.Ephemeral,
      })
      .catch(() => undefined);

    const channel = interaction.channel;
    setTimeout(() => {
      if (channel && 'delete' in channel) {
        void channel.delete('Тикет закрыт').catch(() => undefined);
      }
    }, 3_000);
  }
}

export async function closeTicketCommand(
  guild: Guild,
  channel: GuildTextBasedChannel,
  userId: string,
  canManage: boolean,
): Promise<{ ok: boolean; message: string }> {
  const ticket = getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, message: 'Это не канал тикета.' };
  if (ticket.userId !== userId && !canManage) {
    return { ok: false, message: 'Закрыть тикет может автор или модератор.' };
  }

  closeTicket(guild.id, ticket.channelId);
  await logTicket(guild, '🎫 Тикет закрыт', COLORS.danger, [
    { name: 'Канал', value: `<#${ticket.channelId}>`, inline: true },
    { name: 'Автор', value: `<@${ticket.userId}>`, inline: true },
    { name: 'Закрыл', value: `<@${userId}>`, inline: true },
  ]);

  return { ok: true, message: 'Тикет закрыт. Канал будет удалён через несколько секунд.' };
}
