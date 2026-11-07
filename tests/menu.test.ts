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
const views = await import('../src/features/menu/views.js');
const { handleMenuInteraction } = await import('../src/features/menu/handler.js');

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
