import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { baseEmbed } from '../../lib/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Список команд бота'),
  async execute(interaction) {
    const embed = baseEmbed().setTitle('📖 Команды').addFields(
      {
        name: 'ℹ️ Инфо',
        value: '`/ping` `/help` `/serverinfo` `/userinfo` `/invite`',
        inline: true,
      },
      {
        name: '🛡️ Модерация',
        value:
          '`/kick` `/ban` `/unban` `/timeout` `/untimeout` `/clear`\n`/warn` `/warnings` `/delwarn`',
        inline: true,
      },
      { name: '📈 Уровни', value: '`/rank` `/leaderboard`', inline: true },
      {
        name: '⚙️ Настройки (админ)',
        value:
          '`/config show` — всё настроено\n' +
          '`/config welcome` `/config leave` — приветствие/прощание\n' +
          '`/config autorole` — роль при входе\n' +
          '`/config log` — канал логов\n' +
          '`/config levelup` — канал анонсов лвл-апов\n' +
          '`/config xp` — включить/выключить и настроить XP',
        inline: true,
      },
      {
        name: '🛡️ Автомодерация (админ)',
        value:
          '`/automod invites` — фильтр рекламных ссылок\n' +
          '`/automod words add|remove|list` — стоп-слова\n' +
          '`/automod caps` — фильтр КАПСА\n' +
          '`/automod mentions` — лимит упоминаний',
        inline: true,
      },
    );
    await interaction.reply({ embeds: [embed] });
  },
};
