import assert from 'node:assert/strict';
import test from 'node:test';
import { casesToCsv } from '../src/lib/casesCsv.js';
import type { ModCase } from '../src/lib/cases.js';

function makeCase(overrides: Partial<ModCase> = {}): ModCase {
  return {
    id: 7,
    guildId: 'guild-1',
    type: 'ban',
    userId: '111111111111111111',
    moderatorId: '222222222222222222',
    reason: 'реклама',
    createdAt: Date.UTC(2026, 10, 12, 10, 0, 0),
    expiresAt: null,
    active: true,
    extra: {},
    ...overrides,
  };
}

test('casesToCsv: заголовок и строка кейса', () => {
  const lines = casesToCsv([makeCase()]).split('\r\n');
  assert.equal(lines[0], 'ID;Тип;Участник;Модератор;Причина;Создан;Истекает;Активен');
  assert.equal(
    lines[1],
    '7;Бан;111111111111111111;222222222222222222;реклама;2026-11-12 10:00:00;;да',
  );
});

test('casesToCsv: экранирует разделитель, кавычки и перевод строки', () => {
  const csv = casesToCsv([
    makeCase({ reason: 'спам; "кавычки"\nвторая строка', active: false, expiresAt: 0 }),
  ]);
  assert.match(csv, /;"спам; ""кавычки""\nвторая строка";2026-11-12 10:00:00;;нет/);
  assert.equal(csv.split('\r\n').length, 2);
});

test('casesToCsv: пустой список — только заголовок', () => {
  assert.equal(casesToCsv([]), 'ID;Тип;Участник;Модератор;Причина;Создан;Истекает;Активен');
});
