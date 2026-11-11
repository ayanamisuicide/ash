import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import type { Guild, Message } from 'discord.js';
import type { Ticket } from '../src/lib/community.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probot-transcript-'));
process.env.DB_FILE = path.join(tempDir, 'bot.sqlite');
process.env.DATA_FILE = path.join(tempDir, 'no-legacy.json');

const storage = await import('../src/storage/sqlite.js');
const { renderTranscript } = await import('../src/lib/ticketTranscript.js');

after(() => {
  storage.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function makeMessage(content: string, tag = 'user#0001'): Message {
  return {
    author: {
      tag,
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
    },
    createdTimestamp: Date.UTC(2026, 10, 12, 10, 0, 0),
    content,
    attachments: new Map([
      [
        'a1',
        {
          url: 'https://cdn.discordapp.com/file.png',
          name: 'file.png',
        },
      ],
    ]),
  } as unknown as Message;
}

const guild = { name: 'Nightfall <&>' } as unknown as Guild;
const ticket: Ticket = {
  channelId: '100000000000000201',
  userId: '111111111111111111',
  status: 'closed',
  createdAt: Date.UTC(2026, 10, 12, 9, 0, 0),
  closedAt: Date.UTC(2026, 10, 12, 11, 0, 0),
};

test('renderTranscript: экранирует HTML и показывает вложения', () => {
  const html = renderTranscript(guild, ticket, [
    makeMessage('привет <script>alert("x")</script> & пока'),
  ]);

  assert.match(html, /Nightfall &lt;&amp;&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /привет &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; пока/);
  assert.match(html, /file\.png/);
  assert.match(html, /user#0001/);
});

test('renderTranscript: пустой тикет', () => {
  const html = renderTranscript(guild, ticket, []);
  assert.match(html, /В тикете не было сообщений/);
  assert.match(html, /Сообщений: 0/);
});
