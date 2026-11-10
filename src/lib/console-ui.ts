import fs from 'node:fs';
import type { CheckStatus, StartupCheck, StartupReport } from './startup.js';

/** Поток вывода: в тестах подменяется на память */
export interface UiStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
}

export interface ConsoleUiOptions {
  stream?: UiStream;
  /** Включить ANSI-цвета (по умолчанию — только в TTY) */
  color?: boolean;
  /** Включить анимации: спиннеры, пошаговый вывод (по умолчанию — только в TTY) */
  animated?: boolean;
}

type Rgb = readonly [number, number, number];

/** Та же палитра, что в launch.ps1: один визуальный язык у бота и лаунчера */
const PALETTE = {
  accent: [94, 234, 212] as Rgb,
  violet: [192, 132, 252] as Rgb,
  ok: [74, 222, 128] as Rgb,
  info: [139, 151, 180] as Rgb,
  warn: [251, 191, 36] as Rgb,
  error: [251, 113, 133] as Rgb,
  text: [232, 236, 246] as Rgb,
  dim: [70, 82, 110] as Rgb,
  line: [42, 54, 84] as Rgb,
};

/**
 * Маркеры без эмодзи: лаунчер разбирает эти строки (`scripts/launch.ps1`),
 * поэтому набор символов должен совпадать с тем, что он понимает.
 */
const STATUS_MARK: Record<CheckStatus, string> = {
  ok: '✔',
  info: 'ℹ',
  warn: '⚠',
  error: '✖',
};

const STATUS_COLOR: Record<CheckStatus, Rgb> = {
  ok: PALETTE.ok,
  info: PALETTE.info,
  warn: PALETTE.warn,
  error: PALETTE.error,
};

/** Бейджи разделов отчёта — как в RUNTIME REPORT лаунчера */
const GROUP_BADGE: Record<string, string> = {
  Окружение: 'CORE',
  Конфигурация: 'CONFIG',
  'База данных': 'DATA',
  'Веб-панель': 'PANEL',
  Команды: 'COMMANDS',
  Tailscale: 'NET',
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Ширина рабочей области: совпадает с лаунчером */
const INNER = 70;

/** Колонка имени проверки в отчёте */
const MARK_COLUMN = 26;

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Бейдж группы: `CORE`, `SERVER · название` */
function groupBadge(group: string): string {
  if (group.startsWith('Сервер:')) {
    return `SERVER · ${group.slice('Сервер:'.length).trim()}`;
  }
  return GROUP_BADGE[group] ?? group.toUpperCase();
}

/** dev-режим запускается из .ts через tsx, production — из собранного .js */
function detectMode(): 'dev' | 'production' {
  const entry = process.argv[1] ?? '';
  return /\.(ts|mts|cts)$/.test(entry) ? 'dev' : 'production';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectColor(stream: UiStream): boolean {
  const force = process.env.FORCE_COLOR;
  if (force === '0' || force === 'false') return false;
  if (force) return true;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

function detectAnimated(stream: UiStream): boolean {
  const flag = process.env.UI_ANIMATION;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  if (process.env.CI) return false;
  return Boolean(stream.isTTY);
}

/** Версия из package.json (в dev и в dist путь одинаковый) */
export function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '';
  } catch {
    return '';
  }
}

/** Анимированный вывод в консоль: баннер, спиннеры, пошаговый отчёт проверок */
export class ConsoleUi {
  private readonly stream: UiStream;
  readonly color: boolean;
  readonly animated: boolean;
  private activeSpinners = 0;
  private cursorHidden = false;
  private cleanupRegistered = false;
  private stageIndex = 0;

  constructor(options: ConsoleUiOptions = {}) {
    this.stream = options.stream ?? process.stdout;
    this.color = options.color ?? detectColor(this.stream);
    this.animated = options.animated ?? detectAnimated(this.stream);
  }

  private write(chunk: string): void {
    this.stream.write(chunk);
  }

  private writeLine(text = ''): void {
    this.write(`${text}\n`);
  }

  paint(rgb: Rgb, text: string): string {
    if (!this.color) return text;
    const [red, green, blue] = rgb;
    return `\x1b[38;2;${red};${green};${blue}m${text}\x1b[0m`;
  }

  private gradient(text: string, from: Rgb, to: Rgb): string {
    if (!this.color) return text;
    const chars = [...text];
    const last = Math.max(chars.length - 1, 1);
    return chars
      .map((char, index) => {
        if (char === ' ') return char;
        const t = index / last;
        const rgb: Rgb = [
          Math.round(from[0] + (to[0] - from[0]) * t),
          Math.round(from[1] + (to[1] - from[1]) * t),
          Math.round(from[2] + (to[2] - from[2]) * t),
        ];
        return this.paint(rgb, char);
      })
      .join('');
  }

  private ensureCursorCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;
    process.once('exit', () => {
      if (this.cursorHidden) this.stream.write('\x1b[?25h');
    });
  }

  /** Прячет курсор на время работы спиннера */
  beginSpinner(): void {
    this.ensureCursorCleanup();
    this.activeSpinners += 1;
    if (this.animated && !this.cursorHidden) {
      this.cursorHidden = true;
      this.write('\x1b[?25l');
    }
  }

  /** Возвращает курсор, когда закончился последний спиннер */
  endSpinner(): void {
    this.activeSpinners = Math.max(0, this.activeSpinners - 1);
    if (this.activeSpinners === 0 && this.cursorHidden) {
      this.cursorHidden = false;
      this.write('\x1b[?25h');
    }
  }

  /** Перерисовывает текущую строку (только в анимированном режиме) */
  renderLine(text: string): void {
    this.write(`\r\x1b[2K${text}`);
  }

  clearLine(): void {
    this.write('\r\x1b[2K');
  }

  dim(text: string): string {
    return this.color ? `\x1b[2m${text}\x1b[0m` : text;
  }

  bold(text: string): string {
    return this.color ? `\x1b[1m${text}\x1b[0m` : text;
  }

  /** Секция вида `── RUNTIME ────── 41 checks` */
  sectionRule(label: string, right = ''): void {
    const head = `── ${label} `;
    const fill = Math.max(2, INNER - head.length - right.length - 1);
    this.writeLine(
      `  ${this.paint(PALETTE.line, head + '─'.repeat(fill))}${right ? ` ${this.dim(right)}` : ''}`,
    );
  }

  /** Заголовок: карточка NEXUS в стиле лаунчера, без ASCII-арта */
  async banner(
    meta: {
      version?: string;
      node?: string;
      platform?: string;
      pid?: number;
      mode?: 'dev' | 'production';
    } = {},
  ): Promise<void> {
    const version = meta.version ?? readPackageVersion();
    const mode = meta.mode ?? detectMode();
    const brand = '◈ NEXUS';
    const section = '  /  runtime';
    const right = version ? `v${version}` : '';
    const gap = Math.max(1, INNER - brand.length - section.length - right.length);
    const hint = mode === 'dev' ? 'tsx watch' : 'node dist';
    const subtitle =
      `${mode.toUpperCase()}  ·  ${hint}  ·  Node ${meta.node ?? process.version}` +
      `  ·  ${meta.platform ?? `${process.platform}/${process.arch}`}  ·  PID ${meta.pid ?? process.pid}`;

    this.writeLine();
    this.writeLine(
      `  ${this.gradient(brand, PALETTE.accent, PALETTE.violet)}` +
        `${this.paint(PALETTE.info, section)}${' '.repeat(gap)}${this.paint(PALETTE.text, right)}`,
    );
    this.writeLine(`  ${this.paint(PALETTE.line, '─'.repeat(INNER))}`);
    this.writeLine(
      `  ${this.paint(PALETTE.accent, mode.toUpperCase())}${this.dim(subtitle.slice(mode.length))}`,
    );
    this.writeLine();
    if (this.animated) await delay(30);
  }

  /** Строка этапа: `✓  01  CONFIG  Конфигурация проверена — …   0.4s` */
  stage(status: CheckStatus, phase: string, label: string, detail = '', elapsedMs?: number): void {
    this.stageIndex += 1;
    const index = String(this.stageIndex).padStart(2, '0');
    const glyph = STATUS_MARK[status];
    const phaseText = phase.padEnd(9);
    const plainHead = `  ${glyph}  ${index}  ${phaseText}  `;
    const plainBody = `${label}${detail ? ` — ${detail}` : ''}`;
    const time = elapsedMs === undefined ? '' : formatSeconds(elapsedMs);
    const gap = Math.max(1, INNER + 2 - plainHead.length - plainBody.length - time.length);

    this.writeLine(
      `  ${this.paint(STATUS_COLOR[status], glyph)}  ${this.dim(index)}  ` +
        `${this.paint(PALETTE.accent, phaseText)}  ${this.paint(PALETTE.text, label)}` +
        `${detail ? this.dim(` — ${detail}`) : ''}` +
        `${' '.repeat(gap)}${time ? this.paint(PALETTE.info, time) : ''}`,
    );
  }

  /** Строка-статус с галочкой/предупреждением/ошибкой */
  line(status: CheckStatus, label: string, detail = ''): void {
    const mark = this.paint(STATUS_COLOR[status], STATUS_MARK[status]);
    const tail = detail ? this.dim(` — ${detail}`) : '';
    this.writeLine(`  ${mark}  ${this.paint(PALETTE.text, label)}${tail}`);
  }

  ok(label: string, detail = ''): void {
    this.line('ok', label, detail);
  }

  info(label: string, detail = ''): void {
    this.line('info', label, detail);
  }

  warn(label: string, detail = ''): void {
    this.line('warn', label, detail);
  }

  error(label: string, detail = ''): void {
    this.line('error', label, detail);
  }

  blank(): void {
    this.writeLine();
  }

  /** Спиннер для длительной операции: `update`, `succeed`, `fail`, `stop` */
  spinner(label: string, phase?: string): Spinner {
    return new Spinner(this, label, phase);
  }

  /** Анимированно печатает отчёт проверок и итог */
  async revealReport(report: StartupReport): Promise<void> {
    this.sectionRule('RUNTIME', `${report.checks.length} checks`);

    let currentGroup = '';
    for (const check of report.checks) {
      if (check.group !== currentGroup) {
        if (currentGroup) this.writeLine();
        this.writeLine(`    ${this.paint(PALETTE.accent, groupBadge(check.group))}`);
        currentGroup = check.group;
      }
      if (this.animated) {
        this.renderLine(`    ${this.dim('⠋')} ${this.dim(check.name)}`);
        await delay(28);
        this.clearLine();
      }
      this.writeLine(this.formatCheck(check));
    }

    this.writeLine();
    const okCount = report.checks.filter((check) => check.status === 'ok').length;
    const infoCount = report.checks.filter((check) => check.status === 'info').length;
    const summary =
      `${this.paint(PALETTE.ok, `${STATUS_MARK.ok} ${okCount}`)}  ·  ` +
      `${this.paint(PALETTE.info, `${STATUS_MARK.info} ${infoCount}`)}  ·  ` +
      `${this.paint(PALETTE.warn, `${STATUS_MARK.warn} ${report.warnings}`)}  ·  ` +
      `${this.paint(PALETTE.error, `${STATUS_MARK.error} ${report.errors}`)}`;
    this.writeLine(`  ${this.paint(PALETTE.text, 'Итог проверок:')} ${summary}`);
    if (report.ok) {
      this.writeLine(`  ${this.paint(PALETTE.ok, 'Критичных ошибок не найдено.')}`);
    } else {
      this.writeLine(`  ${this.paint(PALETTE.error, 'Есть ошибки — исправьте пункты с ✖.')}`);
    }
  }

  private formatCheck(check: StartupCheck): string {
    const mark = this.paint(STATUS_COLOR[check.status], STATUS_MARK[check.status]);
    const name = check.name.length >= MARK_COLUMN ? check.name : check.name.padEnd(MARK_COLUMN);
    const title = this.paint(PALETTE.text, name);
    const tail = check.detail ? this.dim(` — ${check.detail}`) : '';
    return `    ${mark} ${title}${tail}`;
  }

  /** Финальный блок «бот готов» */
  finish(meta: {
    guilds: number;
    commands: number;
    panel: string | null;
    local?: string | null;
  }): void {
    this.blank();
    this.sectionRule(
      'READY',
      `${meta.guilds} ${meta.guilds === 1 ? 'сервер' : 'серверов'} · ${meta.commands} команд`,
    );
    this.writeLine(
      `  ${this.paint(PALETTE.ok, STATUS_MARK.ok)}  ${this.paint(PALETTE.text, 'Бот готов')}` +
        this.dim(` · серверов: ${this.bold(String(meta.guilds))}`) +
        this.dim(` · команд: ${this.bold(String(meta.commands))}`),
    );
    if (meta.panel) {
      this.writeLine(
        `  ${this.dim('☞')}  ${this.dim('Веб-панель:')} ${this.paint(PALETTE.accent, meta.panel)}`,
      );
    }
    if (meta.local) {
      this.writeLine(`  ${this.dim('☞')}  ${this.dim('Локально:')} ${this.dim(meta.local)}`);
    }
    this.writeLine(`  ${this.dim('☞')}  ${this.dim('Остановка:')} ${this.dim('Ctrl+C')}`);
    this.blank();
  }
}

/** Спиннер одного этапа запуска */
export class Spinner {
  private index = 0;
  private timer: NodeJS.Timeout | null = null;
  private label: string;
  private finished = false;
  private readonly startedMs = Date.now();

  constructor(
    private readonly ui: ConsoleUi,
    label: string,
    private readonly phase?: string,
  ) {
    this.label = label;
    if (ui.animated) {
      ui.beginSpinner();
      this.render();
      this.timer = setInterval(() => this.render(), 80);
      this.timer.unref?.();
    }
  }

  private render(): void {
    if (this.finished) return;
    const frame = SPINNER_FRAMES[this.index % SPINNER_FRAMES.length] ?? '⠋';
    this.index += 1;
    this.ui.renderLine(`  ${this.ui.paint([94, 234, 212], frame)} ${this.label}`);
  }

  update(label: string): void {
    this.label = label;
    if (this.ui.animated) this.render();
  }

  private stopTimer(): void {
    this.finished = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ui.animated) this.ui.clearLine();
  }

  /** Завершает этап без сообщения (результат печатается отдельно) */
  stop(): void {
    if (this.finished) return;
    this.stopTimer();
    this.ui.endSpinner();
  }

  succeed(detail = ''): void {
    if (this.finished) return;
    const label = this.label;
    const elapsed = Date.now() - this.startedMs;
    this.stopTimer();
    this.ui.endSpinner();
    if (this.phase) this.ui.stage('ok', this.phase, label, detail, elapsed);
    else this.ui.ok(label, detail);
  }

  fail(detail = ''): void {
    if (this.finished) return;
    const label = this.label;
    const elapsed = Date.now() - this.startedMs;
    this.stopTimer();
    this.ui.endSpinner();
    if (this.phase) this.ui.stage('error', this.phase, label, detail, elapsed);
    else this.ui.error(label, detail);
  }
}

/** Общая точка входа: одна UI-сессия на процесс */
export function createConsoleUi(options?: ConsoleUiOptions): ConsoleUi {
  return new ConsoleUi(options);
}
