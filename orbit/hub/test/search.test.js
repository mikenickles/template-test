import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, snippet } from '../src/search.js';

const state = {
  agents: [{ id: 'a1', name: 'Nova' }],
  rooms: [
    { id: 'r1', name: 'Weekend trip', description: 'Planning a lake weekend', agentIds: ['a1'] },
    { id: 'r2', name: 'Launch plan', description: '', agentIds: ['a1'] },
  ],
  messages: {
    r1: [
      { id: 'm1', author: { type: 'user' }, text: 'Find a ramen place near the hotel', createdAt: 100 },
      { id: 'm2', author: { type: 'agent', agentId: 'a1', name: 'Nova' }, text: 'Fuunji is the best ramen near your hotel.', createdAt: 200 },
    ],
    r2: [{ id: 'm3', author: { type: 'agent', agentId: 'a1' }, text: 'The beta launches Friday.', createdAt: 300 }],
    gone: [{ id: 'm4', author: { type: 'user' }, text: 'ramen in a deleted room', createdAt: 400 }],
  },
};

test('finds messages with every word, newest first, across rooms that still exist', () => {
  const found = search(state, '  Ramen   hotel ');
  assert.equal(found.query, 'ramen hotel');
  assert.deepEqual(found.messages.map((m) => m.messageId), ['m2', 'm1']);
  assert.equal(found.messages[0].author, 'Nova');
  assert.equal(found.messages[0].roomName, 'Weekend trip');
  assert.equal(found.messages[1].author, 'You');
  assert.equal(found.messages[1].agentId, null);
});

test('finds rooms by name or description, and nothing for an empty query', () => {
  assert.deepEqual(search(state, 'lake').rooms.map((r) => r.id), ['r1']);
  assert.deepEqual(search(state, 'launch').rooms.map((r) => r.id), ['r2']);
  assert.deepEqual(search(state, '   '), { query: '', rooms: [], messages: [] });
});

test('snippets stay short and centred on the match', () => {
  const long = `${'word '.repeat(60)}needle here ${'tail '.repeat(60)}`;
  const s = snippet(long, 'needle');
  assert.ok(s.includes('needle'));
  assert.ok(s.length <= 165);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.equal(snippet('short text', 'short'), 'short text');
  assert.equal(snippet('## Plan\nThis is **demo mode** with `code`', 'demo'), 'Plan This is demo mode with code');
});
