import { AuditLogEvent, Events, type GuildEmoji, type Sticker } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import { fmtUser, isLogEventEnabled, reasonValue, sendLog } from '../../lib/logging.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildEmojiCreate,
    async execute(emoji: GuildEmoji) {
      if (!isLogEventEnabled(emoji.guild.id, 'emojiCreate')) return;
      const { executor, reason } = await auditInfo(
        emoji.guild,
        AuditLogEvent.EmojiCreate,
        emoji.id,
      );

      const fields = [
        { name: 'Эмодзи', value: `${emoji} \`${emoji.name}\``, inline: true },
        { name: 'Анимированный', value: emoji.animated ? 'да' : 'нет', inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(emoji.guild, {
        title: '😀 Эмодзи добавлен',
        color: COLORS.success,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        thumbnail: emoji.imageURL(),
        fields,
        footer: `ID: ${emoji.id}`,
      });

      await sendLog(emoji.guild, embed, 'emojiCreate');
    },
  },

  {
    name: Events.GuildEmojiDelete,
    async execute(emoji: GuildEmoji) {
      if (!isLogEventEnabled(emoji.guild.id, 'emojiDelete')) return;
      const { executor, reason } = await auditInfo(
        emoji.guild,
        AuditLogEvent.EmojiDelete,
        emoji.id,
      );

      const fields = [{ name: 'Имя', value: `\`${emoji.name}\``, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(emoji.guild, {
        title: '😀 Эмодзи удалён',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${emoji.id}`,
      });

      await sendLog(emoji.guild, embed, 'emojiDelete');
    },
  },

  {
    name: Events.GuildEmojiUpdate,
    async execute(oldEmoji: GuildEmoji, newEmoji: GuildEmoji) {
      if (oldEmoji.name === newEmoji.name) return;
      if (!isLogEventEnabled(newEmoji.guild.id, 'emojiUpdate')) return;

      const { executor, reason } = await auditInfo(
        newEmoji.guild,
        AuditLogEvent.EmojiUpdate,
        newEmoji.id,
      );

      const fields = [
        { name: 'Имя', value: `\`${oldEmoji.name}\` → \`${newEmoji.name}\``, inline: false },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(newEmoji.guild, {
        title: '😀 Эмодзи изменён',
        color: COLORS.warn,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        thumbnail: newEmoji.imageURL(),
        fields,
        footer: `ID: ${newEmoji.id}`,
      });

      await sendLog(newEmoji.guild, embed, 'emojiUpdate');
    },
  },

  {
    name: Events.GuildStickerCreate,
    async execute(sticker: Sticker) {
      const guild = sticker.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'stickerCreate')) return;

      const { executor, reason } = await auditInfo(guild, AuditLogEvent.StickerCreate, sticker.id);

      const fields = [
        { name: 'Название', value: `\`${sticker.name}\``, inline: true },
        { name: 'Теги', value: sticker.tags ? `\`${sticker.tags}\`` : '—', inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '🩹 Стикер добавлен',
        color: COLORS.success,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        description: sticker.description ?? undefined,
        thumbnail: sticker.url,
        fields,
        footer: `ID: ${sticker.id}`,
      });

      await sendLog(guild, embed, 'stickerCreate');
    },
  },

  {
    name: Events.GuildStickerDelete,
    async execute(sticker: Sticker) {
      const guild = sticker.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'stickerDelete')) return;

      const { executor, reason } = await auditInfo(guild, AuditLogEvent.StickerDelete, sticker.id);

      const fields = [{ name: 'Название', value: `\`${sticker.name}\``, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '🩹 Стикер удалён',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${sticker.id}`,
      });

      await sendLog(guild, embed, 'stickerDelete');
    },
  },

  {
    name: Events.GuildStickerUpdate,
    async execute(oldSticker: Sticker, newSticker: Sticker) {
      const guild = newSticker.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'stickerUpdate')) return;
      if (
        oldSticker.name === newSticker.name &&
        oldSticker.description === newSticker.description
      ) {
        return;
      }

      const { executor, reason } = await auditInfo(
        guild,
        AuditLogEvent.StickerUpdate,
        newSticker.id,
      );

      const fields = [{ name: 'Название', value: `\`${newSticker.name}\``, inline: true }];
      if (oldSticker.name !== newSticker.name) {
        fields.push({
          name: 'Имя',
          value: `\`${oldSticker.name}\` → \`${newSticker.name}\``,
          inline: false,
        });
      }
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '🩹 Стикер изменён',
        color: COLORS.warn,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        description:
          oldSticker.description !== newSticker.description
            ? `${oldSticker.description ?? '*нет описания*'} → ${newSticker.description ?? '*нет описания*'}`
            : undefined,
        thumbnail: newSticker.url,
        fields,
        footer: `ID: ${newSticker.id}`,
      });

      await sendLog(guild, embed, 'stickerUpdate');
    },
  },
];

export default events;
