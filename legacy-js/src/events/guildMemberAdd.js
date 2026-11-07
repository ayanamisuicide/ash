import { getSettings } from '../lib/settings.js';
import { fillTemplate } from '../lib/format.js';
import { sendLog } from '../lib/logger.js';
import { baseEmbed, COLORS } from '../lib/embeds.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const settings = getSettings(member.guild.id);

      // Автороль
      if (settings.autorole) {
        await member.roles.add(settings.autorole).catch(() => {});
      }

      // Приветствие
      if (settings.welcome?.channel && settings.welcome?.message) {
        const channel = member.guild.channels.cache.get(settings.welcome.channel);
        if (channel) {
          const text = fillTemplate(settings.welcome.message, {
            user: member.toString(),
            username: member.user.username,
            server: member.guild.name,
            memberCount: member.guild.memberCount,
          });
          await channel
            .send({ allowedMentions: { users: [member.id] }, content: text })
            .catch(() => {});
        }
      }

      // Лог
      await sendLog(
        member.guild,
        baseEmbed(COLORS.success)
          .setTitle('Участник зашёл')
          .setDescription(`👤 ${member} (**${member.user.tag}**)`)
          .setFooter({ text: `ID: ${member.id} • участника: ${member.guild.memberCount}` }),
      );
    } catch (error) {
      console.error('[bot] guildMemberAdd:', error);
    }
  },
};
