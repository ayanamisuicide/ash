import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppealButton } from '../src/lib/appealButton.js';

test('buildAppealButton: customId привязан к серверу', () => {
  const guildId = '1257590268262350908';
  const row = buildAppealButton(guildId);
  const button = row.components[0];

  assert.equal(button?.data.custom_id, `appeal:dm:start:${guildId}`);
  assert.equal(button?.data.label, 'Подать апелляцию');
});
