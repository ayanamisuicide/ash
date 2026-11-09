import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { V2, card, type CardField } from './card.js';
import { newId } from './ids.js';

export type ConfirmationKind = 'setrole' | 'roleclear' | 'massban' | 'lockdown' | 'antinuke-action';

export interface PendingConfirmation {
  id: string;
  guildId: string;
  userId: string;
  kind: ConfirmationKind;
  permission: bigint;
  payload: Record<string, unknown>;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1_000;
const pending = new Map<string, PendingConfirmation>();

function cleanup(): void {
  const now = Date.now();
  for (const [id, item] of pending) {
    if (now - item.createdAt > TTL_MS) pending.delete(id);
  }
}

export function createConfirmation(input: Omit<PendingConfirmation, 'id' | 'createdAt'>): string {
  cleanup();
  const id = newId(8);
  pending.set(id, { ...input, id, createdAt: Date.now() });
  return id;
}

export function takeConfirmation(
  id: string,
  guildId: string,
  userId: string,
): PendingConfirmation | null {
  cleanup();
  const item = pending.get(id);
  if (!item) return null;
  if (item.guildId !== guildId || item.userId !== userId) return null;
  pending.delete(id);
  return item;
}

export function buildConfirmationView(
  id: string,
  title: string,
  description: string,
  fields?: CardField[],
): { components: ReturnType<typeof card>[]; flags: number } {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:yes:${id}`)
      .setLabel('Подтвердить')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`confirm:no:${id}`)
      .setLabel('Отмена')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    components: [
      card({
        tone: 'warn',
        title,
        description,
        fields,
        buttons: [row],
        timestamp: false,
      }),
    ],
    flags: V2,
  };
}
