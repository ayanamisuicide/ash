import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import {
  getCommunitySettings,
  getLevelInfo,
  updateCommunitySettings,
  type CommunitySettings,
} from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leveling')
    .setDescription('Система уровней')
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Включить или выключить уровни')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Канал уведомлений о новом уровне')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Текст уведомления о новом уровне')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Шаблон: {user}, {level}, {xp}')
            .setRequired(true)
            .setMaxLength(500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rates')
        .setDescription('Сколько очков давать за активность')
        .addIntegerOption((option) =>
          option
            .setName('message_xp')
            .setDescription('XP за сообщение (0 — не начислять)')
            .setMinValue(0)
            .setMaxValue(100),
        )
        .addIntegerOption((option) =>
          option
            .setName('message_cooldown')
            .setDescription('Пауза между начислениями за сообщения, сек (0 — за каждое)')
            .setMinValue(0)
            .setMaxValue(3_600),
        )
        .addIntegerOption((option) =>
          option
            .setName('voice_xp')
            .setDescription('XP за каждые 5 минут в голосе')
            .setMinValue(0)
            .setMaxValue(100),
        )
        .addBooleanOption((option) =>
          option.setName('voice_tracking').setDescription('Считать время в голосовых каналах'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reward_add')
        .setDescription('Выдать роль за достижение уровня')
        .addIntegerOption((option) =>
          option
            .setName('level')
            .setDescription('Уровень')
            .setMinValue(1)
            .setMaxValue(1_000)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Роль-награда').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reward_remove')
        .setDescription('Убрать награду за уровень')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Роль-награда').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('rewards').setDescription('Список наград за уровни'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'enable') {
      const enabled = interaction.options.getBoolean('enabled', true);
      updateCommunitySettings(guildId, { levelingEnabled: enabled });
      await interaction.editReply({
        components: [
          successCard('📊 Уровни', enabled ? 'Система включена.' : 'Система выключена.'),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, { levelupChannelId: channel.id });
      await interaction.editReply({
        components: [successCard('📊 Уровни', `Канал: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      updateCommunitySettings(guildId, { levelupMessage: text });
      await interaction.editReply({
        components: [successCard('📊 Уровни', 'Текст уведомления обновлён.')],
        flags: V2,
      });
      return;
    }

    if (sub === 'rates') {
      const messageXp = interaction.options.getInteger('message_xp');
      const messageCooldownSec = interaction.options.getInteger('message_cooldown');
      const voiceXp = interaction.options.getInteger('voice_xp');
      const voiceTrackingEnabled = interaction.options.getBoolean('voice_tracking');

      const patch: Partial<CommunitySettings> = {};
      if (messageXp !== null) patch.messageXp = messageXp;
      if (messageCooldownSec !== null) patch.messageCooldownSec = messageCooldownSec;
      if (voiceXp !== null) patch.voiceXp = voiceXp;
      if (voiceTrackingEnabled !== null) patch.voiceTrackingEnabled = voiceTrackingEnabled;

      if (Object.keys(patch).length === 0) {
        await interaction.editReply({
          components: [errorCard('Укажите хотя бы один параметр.')],
          flags: V2,
        });
        return;
      }

      const next = updateCommunitySettings(guildId, patch);
      await interaction.editReply({
        components: [
          successCard(
            '📊 Очки за активность',
            `${next.messageXp} XP за сообщение · пауза ${next.messageCooldownSec} с · ` +
              `${next.voiceXp} XP за 5 минут в голосе · ` +
              (next.voiceTrackingEnabled ? 'учёт голоса включён' : 'учёт голоса выключен'),
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'reward_add') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      if (role.managed) {
        await interaction.editReply({
          components: [errorCard('Эту роль управляет интеграция — выдать её нельзя.')],
          flags: V2,
        });
        return;
      }

      const settings = getCommunitySettings(guildId);
      const rewards = settings.levelRewards.filter(
        (reward) => reward.level !== level && reward.roleId !== role.id,
      );
      rewards.push({ level, roleId: role.id });
      rewards.sort((a, b) => a.level - b.level);
      updateCommunitySettings(guildId, { levelRewards: rewards });

      await interaction.editReply({
        components: [
          successCard('🏅 Награда за уровень', `Уровень **${level}** → <@&${role.id}>.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'reward_remove') {
      const role = interaction.options.getRole('role', true);
      const settings = getCommunitySettings(guildId);
      const rewards = settings.levelRewards.filter((reward) => reward.roleId !== role.id);
      if (rewards.length === settings.levelRewards.length) {
        await interaction.editReply({
          components: [errorCard('Для этой роли награда не назначена.')],
          flags: V2,
        });
        return;
      }

      updateCommunitySettings(guildId, { levelRewards: rewards });
      await interaction.editReply({
        components: [successCard('🏅 Награда за уровень', `Роль <@&${role.id}> убрана.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'rewards') {
      const settings = getCommunitySettings(guildId);
      await interaction.editReply({
        components: [
          card({
            tone: settings.levelRewards.length > 0 ? 'premium' : 'neutral',
            title: '🏅 Награды за уровни',
            description:
              settings.levelRewards.length > 0
                ? settings.levelRewards
                    .map((reward) => `**${reward.level}** → <@&${reward.roleId}>`)
                    .join('\n') +
                  `\n\nЗамена прошлой награды: **${settings.levelRewardsReplacePrevious ? 'да' : 'нет'}**`
                : 'Пока нет наград. Добавьте: `/leveling reward_add`.',
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    const settings = getCommunitySettings(guildId);
    const info = getLevelInfo(guildId, interaction.user.id);
    await interaction.editReply({
      components: [
        card({
          tone: settings.levelingEnabled ? 'success' : 'neutral',
          title: '📊 Уровни',
          description: settings.levelingEnabled ? 'Включены' : 'Выключены',
          fields: [
            {
              label: 'Канал',
              value: settings.levelupChannelId ? `<#${settings.levelupChannelId}>` : 'не задан',
              block: false,
            },
            { label: 'Шаблон', value: `\`${settings.levelupMessage}\``, block: true },
            {
              label: 'За сообщение',
              value:
                `${settings.messageXp} XP` +
                (settings.messageCooldownSec > 0
                  ? ` · пауза ${settings.messageCooldownSec} с`
                  : ''),
              block: false,
            },
            {
              label: 'В голосе',
              value: settings.voiceTrackingEnabled
                ? `${settings.voiceXp} XP за 5 минут`
                : 'учёт выключен',
              block: false,
            },
            {
              label: 'Награды',
              value:
                settings.levelRewards.length > 0
                  ? settings.levelRewards
                      .map((reward) => `${reward.level} → <@&${reward.roleId}>`)
                      .join(', ')
                  : 'нет',
              block: true,
            },
            {
              label: 'Ваш уровень',
              value: `${info.level} · ${info.rest}/${info.needed} XP`,
              block: false,
            },
          ],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
