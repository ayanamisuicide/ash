import { getSettings } from '../lib/settings.js';
import { fillTemplate } from '../lib/format.js';
import { sendLog } from '../lib/logger.js';
import { baseEmbed, COLORS } from '../lib/embeds.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      const settings = getSettings(member.guild.id);

      if (settings.leave?.channel && settings.leave?.message) {
        const channel = member.guild.channels.cache.get(settings.leave.channel);
        if (channel) {
          const text = fillTemplate(settings.leave.message, {
            user: member.toString(),
            username: member.user.username,
            server: member.guild.name,
            memberCount: member.guild.memberCount,
          });
          await channel.send({ content: text }).catch(() => {});
        }
      }

      await sendLog(
        member.guild,
        baseEmbed(COLORS.gray)
          .setTitle('Участник вышел')
          .setDescription(`👋 ${member} (**${member.user.tag}**)`)
          .setFooter({ text: `ID: ${member.id} • участника: ${member.guild.memberCount}` }),
      );
    } catch (error) {
      console.error('[bot] guildMemberRemove:', error);
    }
  },
};
