import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_FILE = path.join(ROOT, 'data', 'data.json');

class DB {
  constructor() {
    this.data = this.#load();
    this.saveTimer = null;
  }

  #load() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return {};
    }
  }

  /** Читает значение по пути вида "guilds.123.welcome.channel" */
  get(pathStr, fallback = undefined) {
    let obj = this.data;
    for (const key of pathStr.split('.')) {
      if (obj == null) return fallback;
      obj = obj[key];
      if (obj == null) return fallback;
    }
    return obj ?? fallback;
  }

  /** Записывает значение по пути, создавая промежуточные объекты */
  set(pathStr, value) {
    const keys = pathStr.split('.');
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof obj[keys[i]] !== 'object' || obj[keys[i]] === null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.scheduleSave();
    return value;
  }

  /** Запись на диск не чаще раза в секунду */
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 1000);
  }

  save() {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
  }
}

export const db = new DB();
