import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dbFile = path.join(os.tmpdir(), `probot-commands-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;
process.env.DATA_FILE = path.join(os.tmpdir(), `probot-commands-legacy-${process.pid}.json`);

const storage = await import('../src/storage/sqlite.js');
const { loadCommands } = await import('../src/core/loader.js');

const commands = await loadCommands();
const byName = new Map(commands.map((command) => [command.data.name, command]));

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

test('commands: unique names and descriptions', () => {
  assert.equal(byName.size, commands.length);
  assert.equal(commands.length, 56);
  for (const command of commands) {
    assert.ok(command.data.name.length > 0);
    assert.ok(command.data.description.length > 0);
  }
});

test('commands: expected set is registered', () => {
  for (const name of [
    'ban',
    'tempban',
    'softban',
    'massban',
    'kick',
    'unban',
    'timeout',
    'untimeout',
    'mute',
    'unmute',
    'warn',
    'warns',
    'clearwarns',
    'clear',
    'purge',
    'case',
    'modlogs',
    'reason',
    'duration',
    'lock',
    'unlock',
    'lockdown',
    'slowmode',
    'note',
    'voice',
    'setnick',
    'role',
    'addrole',
    'removerole',
    'setrole',
    'modstats',
    'report',
    'appeal',
    'automod',
    'warnconfig',
    'immunity',
    'antiraid',
    'antinuke',
    'diagnose',
    'backup',
    'settings',
    'caseexport',
    'rolepersist',
    'welcome',
    'autorole',
    'leveling',
    'rank',
    'top',
    'tag',
    'reactionrole',
    'tempvoice',
    'ticket',
    'logs',
    'help',
    'ping',
    'menu',
  ]) {
    assert.ok(byName.has(name), `missing command /${name}`);
  }
});

test('commands: default permissions match expectations', () => {
  const expected: Record<string, string | undefined> = {
    ban: '4',
    tempban: '4',
    softban: '4',
    massban: '4',
    unban: '4',
    kick: '2',
    timeout: '1099511627776',
    untimeout: '1099511627776',
    mute: '1099511627776',
    unmute: '1099511627776',
    warn: '1099511627776',
    warns: '1099511627776',
    clearwarns: '1099511627776',
    clear: '8192',
    purge: '8192',
    case: '1099511627776',
    modlogs: '1099511627776',
    reason: '1099511627776',
    duration: '1099511627776',
    lock: '16',
    unlock: '16',
    lockdown: '16',
    slowmode: '16',
    setnick: '134217728',
    role: '268435456',
    addrole: '268435456',
    removerole: '268435456',
    setrole: '268435456',
    modstats: '1099511627776',
    automod: '32',
    warnconfig: '32',
    immunity: '32',
    antiraid: '32',
    antinuke: '32',
    diagnose: '32',
    backup: '32',
    settings: '32',
    caseexport: '32',
    rolepersist: '268435456',
    welcome: '32',
    autorole: '32',
    leveling: '32',
    reactionrole: '32',
    tempvoice: '32',
    ticket: undefined,
    rank: undefined,
    top: undefined,
    tag: undefined,
    logs: '32',
    report: undefined,
    appeal: undefined,
    help: undefined,
    ping: undefined,
    menu: undefined,
  };

  for (const [name, permission] of Object.entries(expected)) {
    const command = byName.get(name);
    assert.ok(command, `missing command /${name}`);
    const json = command.data.toJSON() as { default_member_permissions?: string };
    assert.equal(
      json.default_member_permissions,
      permission,
      `unexpected default permission for /${name}`,
    );
  }
});

test('commands: role and voice commands have expected subcommands', () => {
  const role = byName.get('role')?.data.toJSON() as {
    options?: Array<{ name: string }>;
  };
  assert.deepEqual(
    (role.options ?? []).map((option) => option.name),
    ['add', 'remove', 'temp'],
  );

  const voice = byName.get('voice')?.data.toJSON() as {
    options?: Array<{ name: string }>;
  };
  assert.deepEqual(
    (voice.options ?? []).map((option) => option.name),
    ['kick', 'move', 'mute', 'unmute', 'deafen', 'undeafen'],
  );
});
