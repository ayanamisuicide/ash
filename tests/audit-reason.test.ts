import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAuditReason } from '../src/lib/audit.js';

const moderator = {
  id: '508903244593102858',
  tag: 'akashi#3070',
  username: 'akashi',
};

test('formatAuditReason: moderator id заменяется на тег', () => {
  assert.equal(
    formatAuditReason('Модератор 508903244593102858: спам', moderator),
    'Модератор akashi#3070: спам',
  );
});

test('formatAuditReason: неизвестный исполнитель становится упоминанием', () => {
  assert.equal(
    formatAuditReason('Модератор 508903244593102858: спам', null),
    'Модератор <@508903244593102858>: спам',
  );
});

test('formatAuditReason: обычная причина не меняется', () => {
  assert.equal(
    formatAuditReason('Антирейд: массовые заходы', moderator),
    'Антирейд: массовые заходы',
  );
  assert.equal(formatAuditReason(null, moderator), null);
});

test('formatAuditReason: сохраняет многострочный текст', () => {
  assert.equal(
    formatAuditReason('Модератор 508903244593102858: первая строка\nвторая строка', moderator),
    'Модератор akashi#3070: первая строка\nвторая строка',
  );
});
