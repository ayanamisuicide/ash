import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeBulkDeleteReason, markBulkDeleteReason } from '../src/lib/bulkDeleteReason.js';

const REASON = { reason: 'спам', moderatorId: '123456789012345678' };

test('bulk delete: причина забирается один раз и только для своего канала', () => {
  markBulkDeleteReason('channel-1', REASON);

  assert.deepEqual(consumeBulkDeleteReason('channel-1'), REASON);
  assert.equal(consumeBulkDeleteReason('channel-1'), null);
  assert.equal(consumeBulkDeleteReason('channel-2'), null);
});

test('bulk delete: очередь хранит последние 20 причин на канал', () => {
  for (let index = 0; index < 25; index += 1) {
    markBulkDeleteReason('channel-2', { reason: `r${index}`, moderatorId: '1' });
  }

  const reasons: string[] = [];
  for (let index = 0; index < 20; index += 1) {
    reasons.push(consumeBulkDeleteReason('channel-2')?.reason ?? 'missing');
  }

  assert.equal(reasons[0], 'r5');
  assert.equal(reasons.at(-1), 'r24');
  assert.equal(consumeBulkDeleteReason('channel-2'), null);
});

test('bulk delete: просроченная причина игнорируется', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  markBulkDeleteReason('channel-3', REASON);

  context.mock.timers.tick(11_000);
  assert.equal(consumeBulkDeleteReason('channel-3'), null);
});

test('bulk delete: при переполнении карты чистятся пустые каналы', () => {
  for (let index = 0; index < 101; index += 1) {
    markBulkDeleteReason(`channel-${index}`, REASON);
  }

  // Старые записи не мешают новым каналам.
  markBulkDeleteReason('channel-new', REASON);
  assert.deepEqual(consumeBulkDeleteReason('channel-new'), REASON);
});
