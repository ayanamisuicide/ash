import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppealButton } from '../src/lib/appealButton.js';

test('buildAppealButton: customId привязан к серверу', () => {
  const guildId = '1257590268262350908';
  const row = buildAppealButton(guildId);
  const button = row.components[0];
  // discord.js отдаёт здесь объединённый тип компонентов — сужаем до кнопки.
  const data = button?.data as { custom_id?: string; label?: string } | undefined;

  assert.equal(data?.custom_id, `appeal:dm:start:${guildId}`);
  assert.equal(data?.label, 'Подать апелляцию');
});
