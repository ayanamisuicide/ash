import { describe, expect, it } from 'vitest';
import {
  automodActionNeedsDuration,
  durationToInput,
  formatDurationMs,
  parseDurationToMs,
  warnActionNeedsDuration,
} from '@/lib/settings';

const MINUTE = 60_000;

describe('parseDurationToMs', () => {
  it('понимает комбинации единиц', () => {
    expect(parseDurationToMs('10m')).toBe(10 * MINUTE);
    expect(parseDurationToMs('1h')).toBe(60 * MINUTE);
    expect(parseDurationToMs('1d2h')).toBe(26 * 60 * MINUTE);
    expect(parseDurationToMs('1w')).toBe(7 * 24 * 60 * MINUTE);
    expect(parseDurationToMs('  2 D 3 H ')).toBe((2 * 24 + 3) * 60 * MINUTE);
    expect(parseDurationToMs('30s')).toBe(30_000);
  });

  it('возвращает null на мусор и ноль', () => {
    expect(parseDurationToMs('')).toBeNull();
    expect(parseDurationToMs('abc')).toBeNull();
    expect(parseDurationToMs('0m')).toBeNull();
    expect(parseDurationToMs('-10m')).toBeNull();
    expect(parseDurationToMs('10x')).toBeNull();
  });
});

describe('durationToInput', () => {
  it('сжимает миллисекунды в компактную строку', () => {
    expect(durationToInput(0)).toBe('');
    expect(durationToInput(null)).toBe('');
    expect(durationToInput(90_000)).toBe('1m30s');
    expect(durationToInput((24 + 2) * 3_600_000)).toBe('1d2h');
  });

  it('обратим с parseDurationToMs', () => {
    const ms = parseDurationToMs('3d4h5m');
    expect(ms).not.toBeNull();
    expect(parseDurationToMs(durationToInput(ms))).toBe(ms);
  });
});

describe('formatDurationMs', () => {
  it('использует общий формат uptime', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(0)).toBe('—');
    expect(formatDurationMs(90 * MINUTE)).toBe('1 ч 30 мин');
  });
});

describe('*NeedsDuration', () => {
  it('длительность нужна только срочным действиям', () => {
    expect(warnActionNeedsDuration('timeout')).toBe(true);
    expect(warnActionNeedsDuration('mute')).toBe(true);
    expect(warnActionNeedsDuration('tempban')).toBe(true);
    expect(warnActionNeedsDuration('ban')).toBe(false);
    expect(warnActionNeedsDuration('kick')).toBe(false);

    expect(automodActionNeedsDuration('timeout')).toBe(true);
    expect(automodActionNeedsDuration('mute')).toBe(true);
    expect(automodActionNeedsDuration('delete')).toBe(false);
    expect(automodActionNeedsDuration('ban')).toBe(false);
  });
});
