import assert from 'node:assert/strict';
import test from 'node:test';
import { humanDuration, parseDuration } from '../src/lib/format.js';

test('parseDuration: single and combined units', () => {
  assert.equal(parseDuration('30s'), 30_000);
  assert.equal(parseDuration('10m'), 600_000);
  assert.equal(parseDuration('1h'), 3_600_000);
  assert.equal(parseDuration('2d'), 172_800_000);
  assert.equal(parseDuration('1w'), 604_800_000);
  assert.equal(parseDuration('1w2d3h4m5s'), 788_645_000);
  assert.equal(parseDuration(' 1h 30m '), 5_400_000);
});

test('parseDuration: invalid values', () => {
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration('0m'), null);
  assert.equal(parseDuration('-1h'), null);
  assert.equal(parseDuration('1h30'), null);
});

test('humanDuration', () => {
  assert.equal(humanDuration(0), '0с');
  assert.equal(humanDuration(90_000), '1м 30с');
  assert.equal(humanDuration(3_600_000), '1ч');
});
