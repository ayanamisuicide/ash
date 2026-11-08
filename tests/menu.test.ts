import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { PermissionFlagsBits, type Guild } from 'discord.js';
import type { MenuInteraction } from '../src/features/menu/handler.js';

const dbFile = path.join(os.tmpdir(), `probot-menu-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-menu-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const settings = await import('../src/lib/modSettings.js');
const views = await import('../src/features/menu/views.js');
const menu = await import('../src/features/menu/handler.js');
const { handleMenuInteraction } = menu;

const guild = {
  id: 'guild-1',
  name: 'Test Guild',
  memberCount: 10,
  createdTimestamp: Date.now(),
  iconURL: () => null,
  channels: { cache: new Map() },
  members: { me: null },
} as unknown as Guild;

after(() => {
  storage.closeDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      // ignore
    }
  }
});

function button(customId: string, permissions: bigint[] = []) {
  const replies: unknown[] = [];
  const updates: unknown[] = [];

  const interaction = {
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    customId,
    guild,
    memberPermissions: { has: (bit: bigint) => permissions.includes(bit) },
    user: { id: 'user-1', tag: 'User#0001', toString: () => '<@user-1>' },
    client: {
      user: { id: 'bot-1', tag: 'Bot#0001' },
      commands: new Map(),
      ws: { ping: 42 },
    },
    update: async (payload: unknown) => {
      updates.push(payload);
      return payload;
    },
    reply: async (payload: unknown) => {
      replies.push(payload);
      return payload;
    },
    followUp: async (payload: unknown) => {
      replies.push(payload);
      return payload;
    },
    deferred: false,
    replied: false,
  };

  return { interaction, replies, updates };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

test('menu views: main and moderation contain navigation buttons', () => {
  const main = json(views.buildMainView(guild).components.map((item) => item.toJSON()));
  assert.ok(main.includes('menu:moderation'));
  assert.ok(main.includes('menu:logs'));
  assert.ok(main.includes('menu:cases'));
  assert.ok(main.includes('menu:info'));
  assert.ok(main.includes('menu:close'));

  const moderation = json(views.buildModerationView().components.map((item) => item.toJSON()));
  assert.ok(moderation.includes('menu:action:ban'));
  assert.ok(moderation.includes('menu:action:warn'));
  assert.ok(moderation.includes('menu:home'));
});

test('menu views: logs, cases and info render', () => {
  const logs = json(views.buildLogsView(guild).components.map((item) => item.toJSON()));
  assert.ok(logs.includes('menu:logs:channel'));
  assert.ok(logs.includes('menu:logs:categories'));
  assert.ok(logs.includes('menu:logs:on'));

  const cases = json(views.buildCasesView(guild).components.map((item) => item.toJSON()));
  assert.ok(cases.includes('menu:home'));

  const info = json(
    views.buildInfoView(guild, 'Bot#0001', 42).components.map((item) => item.toJSON()),
  );
  assert.ok(info.includes('menu:info:ping'));
  assert.ok(info.includes('menu:info:help'));
});

test('menu handler: access denied without permissions', async () => {
  const { interaction, replies, updates } = button('menu:logs');
  await handleMenuInteraction(interaction as unknown as MenuInteraction);
  assert.equal(replies.length, 1);
  assert.equal(updates.length, 0);
});

test('menu handler: logs allowed with ManageGuild', async () => {
  const { interaction, replies, updates } = button('menu:logs', [PermissionFlagsBits.ManageGuild]);
  await handleMenuInteraction(interaction as unknown as MenuInteraction);
  assert.equal(replies.length, 0);
  assert.equal(updates.length, 1);
});

test('menu handler: cases allowed with ModerateMembers', async () => {
  const { interaction, replies, updates } = button('menu:cases', [
    PermissionFlagsBits.ModerateMembers,
  ]);
  await handleMenuInteraction(interaction as unknown as MenuInteraction);
  assert.equal(replies.length, 0);
  assert.equal(updates.length, 1);
});

test('menu handler: moderation view and close do not require extra permissions', async () => {
  const moderation = button('menu:moderation');
  await handleMenuInteraction(moderation.interaction as unknown as MenuInteraction);
  assert.equal(moderation.updates.length, 1);

  const close = button('menu:close');
  await handleMenuInteraction(close.interaction as unknown as MenuInteraction);
  assert.equal(close.updates.length, 1);
});

test('menu handler: unknown button is rejected', async () => {
  const { interaction, replies, updates } = button('menu:unknown');
  await handleMenuInteraction(interaction as unknown as MenuInteraction);
  assert.equal(replies.length, 1);
  assert.equal(updates.length, 0);
});

test('menu views: разделы роли/каналы/голос/настройки на месте', () => {
  const main = json(views.buildMainView(guild).components.map((item) => item.toJSON()));
  for (const id of ['menu:roles', 'menu:channels', 'menu:voice', 'menu:settings']) {
    assert.ok(main.includes(id), `нет кнопки ${id}`);
  }

  const roles = json(views.buildRolesView().components.map((item) => item.toJSON()));
  for (const id of ['menu:action:role-add', 'menu:action:role-remove', 'menu:action:role-temp']) {
    assert.ok(roles.includes(id), `нет кнопки ${id}`);
  }

  const channels = json(views.buildChannelsView(guild).components.map((item) => item.toJSON()));
  for (const id of ['menu:action:lock', 'menu:action:unlock', 'menu:action:lockdown-on']) {
    assert.ok(channels.includes(id), `нет кнопки ${id}`);
  }

  const voice = json(views.buildVoiceView().components.map((item) => item.toJSON()));
  assert.ok(voice.includes('menu:action:voice-move'));
  assert.ok(voice.includes('menu:action:voice-deafen'));

  const settingsView = json(views.buildSettingsView(guild).components.map((item) => item.toJSON()));
  for (const id of ['menu:action:automod-toggle', 'menu:action:raid-toggle', 'menu:logs']) {
    assert.ok(settingsView.includes(id), `нет кнопки ${id}`);
  }
});

test('menu views: модерация содержит все наказания', () => {
  const moderation = json(views.buildModerationView().components.map((item) => item.toJSON()));
  for (const id of [
    'menu:action:ban',
    'menu:action:tempban',
    'menu:action:softban',
    'menu:action:massban',
    'menu:action:kick',
    'menu:action:unban',
    'menu:action:timeout',
    'menu:action:untimeout',
    'menu:action:mute',
    'menu:action:unmute',
    'menu:action:warn',
    'menu:action:warns',
    'menu:action:clearwarns',
    'menu:action:clear',
  ]) {
    assert.ok(moderation.includes(id), `нет кнопки ${id}`);
  }
});

test('menu handler: действие без прав отклоняется', async () => {
  const ban = button('menu:action:ban');
  await handleMenuInteraction(ban.interaction as unknown as MenuInteraction);
  assert.equal(ban.replies.length, 1);
  assert.equal(ban.updates.length, 0);

  const lock = button('menu:action:lock');
  await handleMenuInteraction(lock.interaction as unknown as MenuInteraction);
  assert.equal(lock.replies.length, 1);
  assert.equal(lock.updates.length, 0);
});

test('menu handler: переключатель автомода меняет настройки', async () => {
  const { interaction, replies, updates } = button('menu:action:automod-toggle', [
    PermissionFlagsBits.ManageGuild,
  ]);

  await handleMenuInteraction(interaction as unknown as MenuInteraction);
  assert.equal(replies.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(settings.getModerationSettings(guild.id).automod.enabled, true);

  const again = button('menu:action:automod-toggle', [PermissionFlagsBits.ManageGuild]);
  await handleMenuInteraction(again.interaction as unknown as MenuInteraction);
  assert.equal(settings.getModerationSettings(guild.id).automod.enabled, false);
});

test('menu: у каждой кнопки действия есть права, модалка и совпадающий customId', () => {
  const rendered = [
    views.buildMainView(guild),
    views.buildModerationView(),
    views.buildRolesView(),
    views.buildChannelsView(guild),
    views.buildVoiceView(),
    views.buildCasesView(guild),
    views.buildSettingsView(guild),
    views.buildLogsView(guild),
    views.buildInfoView(guild, 'Bot#0001', 1),
  ]
    .map((view) => json(view.components.map((item) => item.toJSON())))
    .join('\n');

  const actions = new Set(
    [...rendered.matchAll(/menu:action:([a-z-]+)/g)].map((match) => match[1] as string),
  );
  assert.ok(actions.size >= 30, `найдено действий: ${actions.size}`);

  for (const action of actions) {
    assert.ok(menu.MENU_ACTION_PERMISSIONS[action], `нет прав для действия ${action}`);

    const hasModal = menu.menuActionHasModal(action);
    assert.ok(
      hasModal || menu.MENU_DIRECT_ACTIONS.has(action),
      `для ${action} нет ни модалки, ни прямого обработчика`,
    );
    if (hasModal) {
      assert.equal(menu.menuActionModalId(action), `modal:${action}`);

      const modal = menu.menuActionModalJson(action);
      assert.ok(modal, `модалка ${action} не собирается`);
      assert.ok((modal.title ?? '').length <= 45, `слишком длинный заголовок у ${action}`);
      assert.ok((modal.custom_id ?? '').length <= 100);
      assert.ok((modal.components ?? []).length <= 5, `у ${action} больше 5 компонентов модалки`);
      for (const component of modal.components ?? []) {
        const label = (component as { label?: string }).label ?? '';
        assert.ok(label.length <= 45, `слишком длинный label у ${action}: ${label}`);
      }
    }
  }
});

test('menu handler: настройки и правила варнов доступны с ManageGuild', async () => {
  const settingsView = button('menu:settings', [PermissionFlagsBits.ManageGuild]);
  await handleMenuInteraction(settingsView.interaction as unknown as MenuInteraction);
  assert.equal(settingsView.updates.length, 1);

  const rules = button('menu:action:warn-rules', [PermissionFlagsBits.ManageGuild]);
  await handleMenuInteraction(rules.interaction as unknown as MenuInteraction);
  assert.equal(rules.replies.length, 0);
  assert.equal(rules.updates.length, 1);
});
