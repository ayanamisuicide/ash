import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-backup-'));
const dbFile = path.join(tempDir, 'bot.sqlite');
const backupDir = path.join(tempDir, 'backups');

process.env.DB_FILE = dbFile;
process.env.DB_BACKUP_DIR = backupDir;
process.env.DB_BACKUP_KEEP = '2';
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('sqlite schema is versioned', () => {
  const row = storage.db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  assert.ok(Number(row.user_version) >= 2);
});

test('sqlite backup creates a consistent copy', () => {
  const file = storage.backupDatabase();
  assert.ok(file);
  assert.ok(fs.existsSync(file));
  assert.ok(path.basename(file).startsWith('bot-'));
  assert.ok(path.basename(file).endsWith('.sqlite'));
});
