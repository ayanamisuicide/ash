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

const PALETTE = {
  accent: [56, 189, 248] as Rgb,
  accent2: [168, 85, 247] as Rgb,
  ok: [74, 222, 128] as Rgb,
  info: [148, 163, 184] as Rgb,
  warn: [250, 204, 21] as Rgb,
  error: [248, 113, 113] as Rgb,
  text: [226, 232, 240] as Rgb,
};

const STATUS_MARK: Record<CheckStatus, string> = {
  ok: '✅',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

const STATUS_COLOR: Record<CheckStatus, Rgb> = {
  ok: PALETTE.ok,
  info: PALETTE.info,
  warn: PALETTE.warn,
  error: PALETTE.error,
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const BANNER = [
  '  ██████╗ ██████╗  ██████╗ ██████╗  ██████╗ ████████╗',
  '  ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔═══██╗╚══██╔══╝',
  '  ██████╔╝██████╔╝██║   ██║██████╔╝██║   ██║   ██║',
  '  ██╔═══╝ ██╔══██╗██║   ██║██╔══██╗██║   ██║   ██║',
  '  ██║     ██║  ██║╚██████╔╝██████╔╝╚██████╔╝   ██║',
  '  ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝    ╚═╝',
];

const RULE = '─'.repeat(58);

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

  /** Заголовок с логотипом, версией и платформой */
  async banner(
    meta: { version?: string; node?: string; platform?: string; pid?: number } = {},
  ): Promise<void> {
    const version = meta.version ?? readPackageVersion();
    const subtitle = [
      'Discord moderation bot',
      version ? `v${version}` : '',
      `Node ${meta.node ?? process.version}`,
      meta.platform ?? `${process.platform}/${process.arch}`,
      `PID ${meta.pid ?? process.pid}`,
    ]
      .filter(Boolean)
      .join(' · ');

    this.writeLine();
    for (const line of BANNER) {
      this.writeLine(this.gradient(line, PALETTE.accent, PALETTE.accent2));
      if (this.animated) await delay(38);
    }
    this.writeLine(`  ${this.dim(subtitle)}`);
    this.writeLine(`  ${this.dim(RULE)}`);
    this.writeLine();
  }

  /** Строка-статус с галочкой/предупреждением/ошибкой */
  line(status: CheckStatus, label: string, detail = ''): void {
    const mark = STATUS_MARK[status];
    const title = this.paint(STATUS_COLOR[status], label);
    const tail = detail ? this.dim(` — ${detail}`) : '';
    this.writeLine(`  ${mark} ${title}${tail}`);
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
  spinner(label: string): Spinner {
    return new Spinner(this, label);
  }

  /** Анимированно печатает отчёт проверок и итог */
  async revealReport(report: StartupReport): Promise<void> {
    let currentGroup = '';
    for (const check of report.checks) {
      if (check.group !== currentGroup) {
        if (currentGroup) this.writeLine();
        this.writeLine(`  ${this.bold(check.group)}`);
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
      `${this.paint(PALETTE.ok, `✅ ${okCount}`)}, ` +
      `${this.paint(PALETTE.info, `ℹ️ ${infoCount}`)}, ` +
      `${this.paint(PALETTE.warn, `⚠️ ${report.warnings}`)}, ` +
      `${this.paint(PALETTE.error, `❌ ${report.errors}`)}`;
    this.writeLine(`  ${this.bold('Итог проверок:')} ${summary}`);
    if (report.ok) {
      this.writeLine(`  ${this.paint(PALETTE.ok, 'Критичных ошибок не найдено.')}`);
    } else {
      this.writeLine(`  ${this.paint(PALETTE.error, 'Есть ошибки — исправьте пункты с ❌.')}`);
    }
  }

  private formatCheck(check: StartupCheck): string {
    const title = this.paint(STATUS_COLOR[check.status], check.name);
    const tail = check.detail ? this.dim(` — ${check.detail}`) : '';
    return `    ${STATUS_MARK[check.status]} ${title}${tail}`;
  }

  /** Финальный блок «бот готов» */
  finish(meta: {
    guilds: number;
    commands: number;
    panel: string | null;
    local?: string | null;
  }): void {
    this.blank();
    this.writeLine(`  ${this.dim(RULE)}`);
    const parts = [
      `${this.paint(PALETTE.ok, 'Бот готов')}`,
      `серверов: ${this.bold(String(meta.guilds))}`,
      `команд: ${this.bold(String(meta.commands))}`,
    ];
    this.writeLine(`  ✦ ${parts.join(' · ')}`);
    if (meta.panel) {
      this.writeLine(`  ✦ Веб-панель: ${this.paint(PALETTE.accent, meta.panel)}`);
    }
    if (meta.local) {
      this.writeLine(`  ✦ Локально: ${this.dim(meta.local)}`);
    }
    this.writeLine(`  ✦ Остановка: ${this.dim('Ctrl+C')}`);
    this.writeLine(`  ${this.dim(RULE)}`);
    this.blank();
  }
}

/** Спиннер одного этапа запуска */
export class Spinner {
  private index = 0;
  private timer: NodeJS.Timeout | null = null;
  private label: string;
  private finished = false;

  constructor(
    private readonly ui: ConsoleUi,
    label: string,
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
    this.ui.renderLine(`  ${this.ui.paint([56, 189, 248], frame)} ${this.label}`);
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
    this.stopTimer();
    this.ui.endSpinner();
    this.ui.ok(label, detail);
  }

  fail(detail = ''): void {
    if (this.finished) return;
    const label = this.label;
    this.stopTimer();
    this.ui.endSpinner();
    this.ui.error(label, detail);
  }
}

/** Общая точка входа: одна UI-сессия на процесс */
export function createConsoleUi(options?: ConsoleUiOptions): ConsoleUi {
  return new ConsoleUi(options);
}
