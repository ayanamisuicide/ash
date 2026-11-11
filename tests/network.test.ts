import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientNetworkError } from '../src/lib/network.js';

test('isTransientNetworkError: undici-коды из cause', () => {
  const error = new TypeError('fetch failed');
  (error as { cause?: unknown }).cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
  assert.equal(isTransientNetworkError(error), true);
});

test('isTransientNetworkError: системные коды Node', () => {
  for (const code of ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN']) {
    assert.equal(isTransientNetworkError({ code }), true, code);
  }
  assert.equal(isTransientNetworkError(Object.assign(new Error('x'), { code: 'EPIPE' })), true);
});

test('isTransientNetworkError: таймауты по имени', () => {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  assert.equal(isTransientNetworkError(error), true);
});

test('isTransientNetworkError: реальные ошибки не считаются сетевыми', () => {
  assert.equal(isTransientNetworkError(new Error('401 Unauthorized')), false);
  assert.equal(isTransientNetworkError({ code: 'DiscordAPIError[50035]' }), false);
  assert.equal(isTransientNetworkError(null), false);
  assert.equal(isTransientNetworkError('fetch failed'), false);
});

test('isTransientNetworkError: защита от циклов в cause', () => {
  const error: { cause?: unknown } = {};
  error.cause = error;
  assert.equal(isTransientNetworkError(error), false);
});
