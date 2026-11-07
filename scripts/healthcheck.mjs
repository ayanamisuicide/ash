import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbFile = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve('data', 'bot.sqlite');

if (!fs.existsSync(dbFile)) {
  console.error(`healthcheck: database not found: ${dbFile}`);
  process.exit(1);
}

try {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  db.prepare('SELECT 1').get();
  const version = db.prepare('PRAGMA user_version').get();
  db.close();
  console.log(`healthcheck: ok, schema ${version?.user_version ?? '?'}`);
  process.exit(0);
} catch (error) {
  console.error('healthcheck: database error:', error);
  process.exit(1);
}
