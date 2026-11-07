import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warn: 0xfee75c,
  danger: 0xed4245,
  gray: 0x2b2d31,
};

export function baseEmbed(color = COLORS.primary) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

export function successEmbed(description) {
  return baseEmbed(COLORS.success).setDescription(`✅ ${description}`);
}

export function errorEmbed(description) {
  return baseEmbed(COLORS.danger).setDescription(`❌ ${description}`);
}

export function warnEmbed(description) {
  return baseEmbed(COLORS.warn).setDescription(`⚠️ ${description}`);
}
