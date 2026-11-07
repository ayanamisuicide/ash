import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run restore -- ./data/backups/bot-YYYY-MM-DD.sqlite');
  process.exit(1);
}

const sourcePath = path.resolve(source);
const dbFile = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve('data', 'bot.sqlite');

if (!fs.existsSync(sourcePath)) {
  console.error(`restore: backup not found: ${sourcePath}`);
  process.exit(1);
}

const fd = fs.openSync(sourcePath, 'r');
const header = Buffer.alloc(16);
fs.readSync(fd, header, 0, 16, 0);
fs.closeSync(fd);
if (header.toString('utf8') !== 'SQLite format 3\u0000') {
  console.error('restore: file is not a SQLite database');
  process.exit(1);
}

console.warn('restore: stop the bot before restoring the database!');

if (fs.existsSync(dbFile)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safety = `${dbFile}.before-restore-${stamp}`;
  fs.copyFileSync(dbFile, safety);
  console.log(`restore: current database saved to ${safety}`);
}

for (const suffix of ['-wal', '-shm']) {
  try {
    fs.unlinkSync(`${dbFile}${suffix}`);
  } catch {
    // ignore
  }
}

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.copyFileSync(sourcePath, dbFile);
console.log(`restore: copied ${sourcePath} -> ${dbFile}`);
console.log('restore: start the bot and check /diagnose');
