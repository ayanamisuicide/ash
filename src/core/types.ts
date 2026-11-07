import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ClientEvents,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

/**
 * Любой вариант билдера: с опциями, с сабкомандами или без того и другого.
 * Такой тип принимает результат любого `new SlashCommandBuilder()...`.
 */
export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

/** Описание слэш-команды */
export interface Command {
  /** Данные для регистрации в Discord API */
  data: CommandData;
  /** Обработчик вызова */
  execute: (interaction: ChatInputCommandInteraction<'cached'>) => Promise<unknown>;
  /** Необязательный обработчик автодополнения опций */
  autocomplete?: (interaction: AutocompleteInteraction<'cached'>) => Promise<unknown>;
  /** Необязательный персональный кулдаун в миллисекундах */
  cooldownMs?: number;
}

/**
 * Типизированное событие дискорда.
 * Позволяет писать `execute` с правильными аргументами для каждого события.
 */
export type BotEvent<K extends keyof ClientEvents = keyof ClientEvents> = {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
};

/**
 * Событие без жёсткой привязки имени к аргументам.
 * Используется в наборах обработчиков (например, логах),
 * где в одном файле лежит несколько событий.
 */
export type AnyBotEvent = {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: never[]) => Promise<void> | void;
};
