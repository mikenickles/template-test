import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTranscript, FOLD_AFTER, RECENT_CHARS, splitForBudget } from '../src/orchestrator.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';
import { Ledger, costOf, emptyUsage, priceOf } from '../src/usage.js';

const usage = (fields) => ({ ...emptyUsage(), requests: 1, ...fields });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('cost follows the published per-token prices', () => {
  near(costOf('claude-opus-5-5', usage({ input: 1_000_000, output: 100_000 })), 4 + 2);
  near(costOf('claude-sonnet-5-5', usage({ cacheRead: 1_000_000, cacheWrite: 1_000_000 })), 0.1 + 2 * 1.25);
  // Haiku costs more once a prompt passes 100K tokens.
  near(costOf('claude-haiku-5-5', usage({ input: 100_000, output: 10_000 })), 0.01 + 0.005);
  near(costOf('claude-haiku-5-5', usage({ input: 150_000, output: 10_000 })), 0.075 + 0.025);
  assert.equal(priceOf('claude-opus-5-5-20261001'), priceOf('claude-opus-5-5'), 'dated ids match their family');
  assert.equal(priceOf('claude-opus-5-55'), null);
  assert.equal(costOf('gpt-large', usage({ input: 1000 })), null, 'unknown models have no price');
  near(costOf('gpt-large', usage({ input: 1_000_000 }), { 'gpt-large': { input: 1.25, output: 10 } }), 1.25);
});

test('the ledger totals spend per agent and room, newest days only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-usage-'));
  const store = new Store(dir);
  store.state.agents.push({ id: 'a1', name: 'Nova' }, { id: 'a2', name: 'Pixel' });
  store.state.rooms.push({ id: 'r1', name: 'Trip' });
  const ledger = new Ledger(store);
  const now = Date.parse('2026-11-20T12:00:00Z');
  ledger.record({ agentId: 'a1', roomId: 'r1', model: 'claude-opus-5-5', usage: usage({ input: 500_000, output: 50_000 }), at: now });
  ledger.record({ agentId: 'a1', roomId: 'r1', model: 'claude-opus-5-5', usage: usage({ input: 500_000, output: 50_000 }), at: now - 86_400_000 });
  ledger.record({ agentId: 'a2', roomId: 'r9', model: 'gpt-large', usage: usage({ input: 2000, output: 300, estimated: true }), at: now });
  ledger.record({ agentId: 'a1', roomId: 'r1', model: 'claude-opus-5-5', usage: usage({ input: 9_000_000 }), at: now - 40 * 86_400_000 });

  const month = ledger.summary(30, now);
  near(month.total.cost, 6);
  assert.equal(month.total.input, 1_002_000);
  assert.equal(month.total.priced, false, 'one model had no price');
  assert.equal(month.total.estimated, true);
  assert.deepEqual(month.agents.map((a) => [a.name, a.priced]), [['Nova', true], ['Pixel', false]]);
  assert.deepEqual(month.rooms.map((r) => r.name), ['Trip', 'Deleted room']);
  near(ledger.summary(1, now).total.cost, 3);

  ledger.record({ agentId: 'a1', roomId: 'r1', model: 'claude-opus-5-5', usage: usage({ input: 1 }), at: now + 500 * 86_400_000 });
  assert.ok(!(new Date(now - 40 * 86_400_000).toISOString().slice(0, 10) in store.state.usage), 'old days are pruned');
});

test('a long room is folded into a summary, and what is sent stays within budget', async (t) => {
  const calls = [];
  class Scripted extends Providers {
    isConfigured() {
      return true;
    }
    async stream({ model, system, messages, onDelta, onUsage }) {
      calls.push({ model, system, messages });
      const summarizing = system.includes('running summary');
      const text = summarizing ? `Summary ${calls.filter((c) => c.system.includes('running summary')).length}` : 'Noted.';
      onDelta(text);
      onUsage?.(usage({ input: 1000, output: 100 }));
      return text;
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-'));
  const store = new Store(dir);
  store.isNew = false;
  const hub = new Hub({ store, providers: new Scripted({}, {}), name: 'Test PC' });
  t.after(() => hub.close());
  const nova = { id: 'a1', name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', instructions: '' };
  store.state.agents.push(nova);
  const room = { id: 'r1', name: 'Trip', agentIds: ['a1'], mode: 'roundtable', leadId: null };
  store.state.rooms.push(room);
  // 30 long messages: well past what is sent word for word.
  const long = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i + 1}`, roomId: 'r1', seq: i + 1, status: 'done', createdAt: 0, text: `${i + 1} ${'x'.repeat(4999)}`,
    author: i % 2 ? { type: 'agent', agentId: 'a1', name: 'Nova' } : { type: 'user', name: 'You' },
  }));
  store.state.messages.r1 = long;

  hub.orchestrator.post('r1', 'What did we decide?');
  await hub.orchestrator.idle('r1');

  const [summarize, reply] = calls;
  assert.equal(summarize.model, 'claude-haiku-5-5', 'summaries use the inexpensive model');
  assert.ok(summarize.messages[0].content.startsWith('Messages to add:\n\n[User]: 1 x'), 'the oldest messages are folded first');
  assert.equal(room.summary.text, 'Summary 1');
  const sent = reply.messages.map((m) => m.content).join('');
  assert.ok(sent.length <= RECENT_CHARS + 1000, `sent ${sent.length} characters`);
  assert.match(reply.messages[0].content, /^\[Summary of this chat before the messages below\]: Summary 1/);
  assert.match(sent, /What did we decide\?/);
  assert.equal(reply.messages[0].role, 'user');

  // Usage from both the summary and the reply lands in the ledger; the reply keeps its own.
  const totals = hub.ledger.summary(30);
  assert.equal(totals.total.requests, 2);
  assert.equal(store.state.messages.r1.at(-1).usage.input, 1000);

  // The next turn reuses the summary instead of writing a new one.
  hub.orchestrator.post('r1', 'And then?');
  await hub.orchestrator.idle('r1');
  assert.equal(calls.filter((c) => c.system.includes('running summary')).length, 1);

  // Clearing the room forgets its summary.
  const token = (await (await fetch(`http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}/api/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: hub.pairingCode }),
  })).json()).token;
  const base = `http://127.0.0.1:${hub.server.address().port}`;
  const auth = { authorization: `Bearer ${token}` };
  const shown = await (await fetch(`${base}/api/usage?days=7`, { headers: auth })).json();
  assert.equal(shown.days, 7);
  assert.equal(shown.agents[0].name, 'Nova');
  near(shown.total.cost, costOf('claude-opus-5-5', usage({ input: 2000, output: 200 })) + costOf('claude-haiku-5-5', usage({ input: 1000, output: 100 })));
  await fetch(`${base}/api/rooms/r1/messages`, { method: 'DELETE', headers: auth });
  assert.equal(room.summary, undefined);
});

test('history splits at a budget, keeps the newest message, and always opens with the user', () => {
  const m = (seq, text, agent = false) => ({ seq, text, status: 'done', author: agent ? { type: 'agent', agentId: 'a1', name: 'Nova' } : { type: 'user' } });
  const [older, recent] = splitForBudget([m(1, 'aaaa'), m(2, 'bbbb'), m(3, 'cccc')], 9);
  assert.deepEqual([older.map((x) => x.seq), recent.map((x) => x.seq)], [[1], [2, 3]]);
  assert.deepEqual(splitForBudget([m(1, 'a'.repeat(50))], 9)[1].map((x) => x.seq), [1]);
  const turns = buildTranscript({ id: 'a1' }, [m(2, 'mine', true), m(3, 'thanks')], { omitted: true });
  assert.deepEqual(turns.map((x) => x.role), ['user', 'assistant', 'user']);
  assert.match(turns[0].content, /not shown/);
  assert.ok(FOLD_AFTER > 0);
});
