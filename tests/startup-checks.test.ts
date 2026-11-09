import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  Collection,
  GatewayIntentBits,
  IntentsBitField,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import type { BotClient } from '../src/core/client.js';

const dbFile = path.join(os.tmpdir(), `probot-startup-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-startup-legacy-${process.pid}.json`);

const startup = await import('../src/lib/startup.js');

after(() => {
  try {
    fs.unlinkSync(dbFile);
  } catch {
    // ignore
  }
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbFile}${suffix}`);
    } catch {
      // ignore
    }
  }
});

test('startup: version comparison and node support', () => {
  assert.equal(startup.compareVersions('22.13.0', '22.13.0'), 0);
  assert.equal(startup.compareVersions('v22.14.1', '22.13.0'), 1);
  assert.equal(startup.compareVersions('22.9.0', '22.13.0'), -1);
  assert.equal(startup.compareVersions('20', '22.13.0'), -1);
  assert.equal(startup.compareVersions('23.0.0', '22.13.0'), 1);

  assert.equal(startup.isSupportedNodeVersion('22.13.0'), true);
  assert.equal(startup.isSupportedNodeVersion('22.12.9'), false);
  assert.equal(startup.isSupportedNodeVersion('18.20.0'), false);
});

test('startup: missing permissions are reported with labels', () => {
  const missing = startup.findMissingPermissions(
    (bit) => bit === PermissionFlagsBits.ViewChannel || bit === PermissionFlagsBits.SendMessages,
  );

  const labels = missing.map((item) => item.label);
  assert.ok(!labels.includes('Просмотр каналов'));
  assert.ok(!labels.includes('Отправка сообщений'));
  assert.ok(labels.includes('Управление ролями'));
  assert.ok(labels.includes('Бан участников'));

  const critical = startup.REQUIRED_BOT_PERMISSIONS.filter((item) => item.critical);
  assert.ok(critical.length >= 4, 'критичные права должны быть помечены');
});

test('startup: report counts errors and warnings', () => {
  const ok = startup.buildReport([
    { group: 'A', name: 'ok', status: 'ok', detail: '' },
    { group: 'A', name: 'info', status: 'info', detail: '' },
  ]);
  assert.equal(ok.ok, true);
  assert.equal(ok.errors, 0);
  assert.equal(ok.warnings, 0);

  const bad = startup.buildReport([
    { group: 'A', name: 'warn', status: 'warn', detail: '' },
    { group: 'B', name: 'error', status: 'error', detail: 'сломалось' },
  ]);
  assert.equal(bad.ok, false);
  assert.equal(bad.warnings, 1);
  assert.equal(bad.errors, 1);
});

test('startup: formatted report groups checks and gives a summary', () => {
  const report = startup.buildReport([
    { group: 'Окружение', name: 'Node.js', status: 'ok', detail: 'v22.14.0' },
    { group: 'Окружение', name: 'Intents', status: 'warn', detail: 'нет: MessageContent' },
    { group: 'База данных', name: 'SQLite', status: 'error', detail: 'quick_check: broken' },
  ]);

  const text = startup.formatStartupReport(report);
  assert.match(text, /Окружение/);
  assert.match(text, /База данных/);
  assert.match(text, /✅ Node\.js — v22\.14\.0/);
  assert.match(text, /⚠️ Intents/);
  assert.match(text, /❌ SQLite/);
  assert.match(text, /✅ 1, ℹ️ 0, ⚠️ 1, ❌ 1/);
  assert.match(text, /есть ошибки/);
});

test('startup: full run on a fake client reports environment and database', async () => {
  const localCommands = new Collection<string, unknown>([['ping', { data: { name: 'ping' } }]]);
  const remoteCommands = new Collection<string, { name: string }>([['ping', { name: 'ping' }]]);

  const fakeClient = {
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.MessageContent,
      ]),
    },
    user: { tag: 'test-bot#0001' },
    ws: { ping: 42 },
    guilds: { cache: new Collection() },
    commands: localCommands,
    application: {
      id: '123456789012345678',
      commands: { fetch: async () => remoteCommands },
    },
  } as unknown as BotClient;

  const observed: string[] = [];
  const report = await startup.runStartupChecks(fakeClient, (check) => {
    observed.push(`${check.group}/${check.name}`);
  });

  assert.equal(observed.length, report.checks.length, 'наблюдатель должен видеть все проверки');
  assert.ok(report.checks.length > 0);
  assert.ok(
    report.checks.some(
      (check) => check.group === 'База данных' && check.name === 'SQLite' && check.status === 'ok',
    ),
    'quick_check должен пройти на свежей БД',
  );
  assert.ok(report.checks.some((check) => check.group === 'Окружение' && check.name === 'Node.js'));
  assert.equal(report.errors === 0, report.ok);
});

test('startup: guild checks report permissions and hierarchy', async () => {
  const guildId = '111111111111111111';
  const permissions = new PermissionsBitField(
    [...startup.REQUIRED_BOT_PERMISSIONS, ...startup.RECOMMENDED_BOT_PERMISSIONS].map(
      (item) => item.bit,
    ),
  );
  const highestRole = { id: '900000000000000001', name: 'Bot', position: 10, managed: false };
  const everyoneRole = { id: guildId, name: '@everyone', position: 0, managed: false };
  const me = { permissions, roles: { highest: highestRole } };

  const guild = {
    id: guildId,
    name: 'Test Guild',
    available: true,
    memberCount: 5,
    members: {
      me,
      cache: new Collection([[highestRole.id, me]]),
      fetchMe: async () => me,
    },
    roles: { cache: new Collection([[guildId, everyoneRole]]) },
    channels: { cache: new Collection() },
    fetchAuditLogs: async () => ({}),
    client: { user: { id: '900000000000000002' } },
  };

  const fakeClient = {
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    user: { tag: 'test-bot#0001' },
    ws: { ping: 42 },
    guilds: { cache: new Collection([[guildId, guild]]) },
    commands: new Collection<string, unknown>([['ping', { data: { name: 'ping' } }]]),
    application: {
      id: '123456789012345678',
      commands: {
        fetch: async () => new Collection<string, { name: string }>([['ping', { name: 'ping' }]]),
      },
    },
  } as unknown as BotClient;

  const report = await startup.runStartupChecks(fakeClient);
  const group = 'Сервер: Test Guild';

  const permissionCheck = report.checks.find(
    (check) => check.group === group && check.name === 'Права бота',
  );
  assert.equal(permissionCheck?.status, 'ok');
  assert.match(permissionCheck?.detail ?? '', /все обязательные права есть/);

  const hierarchy = report.checks.find(
    (check) => check.group === group && check.name === 'Иерархия ролей',
  );
  assert.equal(hierarchy?.status, 'ok');
  assert.match(hierarchy?.detail ?? '', /Bot.*позиция 10/);
});
