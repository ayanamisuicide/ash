import { describe, expect, it } from 'vitest';
import {
  formatMembers,
  formatNumber,
  formatRelativeTime,
  formatUptime,
  getInitials,
  pingTone,
  pluralizeRu,
} from '@/lib/format';

describe('pluralizeRu', () => {
  it.each([
    [0, 'кейсов'],
    [1, 'кейс'],
    [2, 'кейса'],
    [4, 'кейса'],
    [5, 'кейсов'],
    [11, 'кейсов'],
    [14, 'кейсов'],
    [21, 'кейс'],
    [22, 'кейса'],
    [25, 'кейсов'],
    [111, 'кейсов'],
    [1_014, 'кейсов'],
  ])('%i -> %s', (count, expected) => {
    expect(pluralizeRu(count, 'кейс', 'кейса', 'кейсов')).toBe(expected);
  });

  it('работает с отрицательными числами', () => {
    expect(pluralizeRu(-3, 'кейс', 'кейса', 'кейсов')).toBe('кейса');
  });
});

describe('formatNumber', () => {
  it('разделяет тысячи и не падает на NaN', () => {
    expect(formatNumber(12_345).replace(/\s/g, ' ')).toBe('12 345');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('formatMembers', () => {
  it('склоняет «участник»', () => {
    expect(formatMembers(1)).toBe('1 участник');
    expect(formatMembers(3)).toBe('3 участника');
    expect(formatMembers(11)).toBe('11 участников');
  });
});

describe('formatUptime', () => {
  it('показывает дни/часы/минуты', () => {
    expect(formatUptime(0)).toBe('—');
    expect(formatUptime(-5)).toBe('—');
    expect(formatUptime(90)).toBe('1 мин');
    expect(formatUptime(3_700)).toBe('1 ч 1 мин');
    expect(formatUptime(90_000)).toBe('1 д 1 ч');
  });
});

describe('formatRelativeTime', () => {
  it('свежие отметки — «только что», мусор — прочерк', () => {
    expect(formatRelativeTime(Date.now() - 1_000)).toBe('только что');
    expect(formatRelativeTime(Number.NaN)).toBe('—');
  });
});

describe('pingTone', () => {
  it('пороги подсветки', () => {
    expect(pingTone(40)).toBe('success');
    expect(pingTone(89)).toBe('success');
    expect(pingTone(90)).toBe('warning');
    expect(pingTone(159)).toBe('warning');
    expect(pingTone(160)).toBe('danger');
  });
});

describe('getInitials', () => {
  it('берёт две первые буквы имени или инициалы', () => {
    expect(getInitials('Иван Петров')).toBe('ИП');
    expect(getInitials('Иван')).toBe('ИВ');
    expect(getInitials('  ')).toBe('?');
  });
});
