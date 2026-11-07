import { runAutomod } from '../lib/automod.js';
import { addWarn } from '../lib/warns.js';
import { baseEmbed, COLORS } from '../lib/embeds.js';
import { handleXP } from '../lib/levels.js';

/** После N предупреждений от автомодерации — таймаут на 10 минут */
const AUTOMOD_WARN_LIMIT = 3;
const AUTOMOD_TIMEOUT_MS = 10 * 60 * 1000;

export default {
  name: 'messageCreate',
  async execute(message) {
    try {
      if (message.author.bot || !message.guild) return;

      // 1) Автомодерация
      const violation = runAutomod(message);
      if (violation) {
        await message.delete().catch(() => {});

        const count = addWarn(
          message.guild.id,
          message.author.id,
          message.client.user.id,
          `Автомодерация: ${violation.reason} (сообщение удалено)`,
        );

        const note = await message.channel
          .send({
            embeds: [
              baseEmbed(COLORS.warn).setDescription(
                `🛡️ **${message.author}**, нарушение: **${violation.reason}**. Сообщение удалено.` +
                  (count >= AUTOMOD_WARN_LIMIT
                    ? ''
                    : ` Предупреждений: **${count}/${AUTOMOD_WARN_LIMIT}**`),
              ),
            ],
          })
          .catch(() => null);
        if (note) setTimeout(() => note.delete().catch(() => {}), 10_000);

        if (count >= AUTOMOD_WARN_LIMIT) {
          const member =
            message.member ??
            (await message.guild.members.fetch(message.author.id).catch(() => null));
          if (member?.moderatable) {
            await member.timeout(AUTOMOD_TIMEOUT_MS, `Автомодерация: ${count} предупреждений`).catch(()=>{});
            await message.channel
              .send({
                embeds: [
                  baseEmbed(COLORS.danger).setDescription(
                    `🔇 **${message.author}** заглушён на 10 минут (автомодерация).`,
                  ),
                ],
              })
              .then((m) => setTimeout(() => m.delete().catch(() => {}), 15_000))
              .catch(() => {});
          }
        }
        return; // провинившимся XP не начисляем
      }

      // 2) Уровни
      await handleXP(message);
    } catch (error) {
      console.error('[bot] messageCreate:', error);
    }
  },
};
