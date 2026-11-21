import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';

/** A model that answers as each agent, and picks who answers from a script. */
class Scripted extends Providers {
  constructor(picks) {
    super({ openai: { apiKey: 'sk-test' } }, {});
    this.picks = picks;
    this.calls = [];
  }
  async stream({ system, messages, agent, onDelta }) {
    if (/choose which AI agents/.test(system)) {
      this.calls.push({ pick: messages[0].content });
      const next = this.picks.shift();
      if (next instanceof Error) throw next;
      return next;
    }
    this.calls.push({ agent: agent.name, system });
    const reply = `${agent.name} here`;
    onDelta(reply);
    return reply;
  }
}

async function start(t, picks) {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const providers = new Scripted(picks);
  const hub = new Hub({ store, providers, name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const agent = async (name, role) => (await api('POST', '/api/agents', { name, role, provider: 'openai', model: 'gpt-test', instructions: '' })).body;
  return { hub, providers, api, agent };
}

test('in a best fit room only the agents suited to a message answer it, and @mentions still win', async (t) => {
  const h = await start(t, ['Pixel', 'Nova, Pixel, Sage', 'hmm, not sure', new Error('model down')]);
  const nova = await h.agent('Nova', 'the planner');
  const pixel = await h.agent('Pixel', 'the designer');
  const sage = await h.agent('Sage', 'the skeptic');
  const room = (await h.api('POST', '/api/rooms', {
    name: 'Launch', agentIds: [nova.id, pixel.id, sage.id], mode: 'auto', description: 'We launch the beta on May 1. Keep answers short.',
  })).body;
  assert.equal(room.mode, 'auto');
  assert.equal(room.leadId, null);

  const say = async (text) => {
    const before = h.providers.calls.length;
    await h.api('POST', `/api/rooms/${room.id}/messages`, { text });
    await h.hub.orchestrator.idle(room.id);
    return h.providers.calls.slice(before);
  };
  const speakers = (calls) => calls.filter((c) => c.agent).map((c) => c.agent);

  // One message, one fitting agent. The picker sees the room's purpose and who does what.
  let calls = await say('Sketch the landing page.');
  assert.deepEqual(speakers(calls), ['Pixel']);
  assert.match(calls[0].pick, /About this room: We launch the beta on May 1/);
  assert.match(calls[0].pick, /- Pixel: the designer/);
  assert.match(calls[0].pick, /The user's newest message:\n"Sketch the landing page\."/);
  // Every agent works to the room's description.
  assert.match(calls[1].system, /About this room, from the user \(keep to it\):\nWe launch the beta on May 1\. Keep answers short\./);
  assert.match(calls[1].system, /you were picked for this one/);

  // Mentioning someone skips the picker.
  calls = await say('@Sage what could go wrong?');
  assert.deepEqual(calls.map((c) => c.agent ?? 'picker'), ['Sage']);

  // Speaking to everyone brings everyone in.
  calls = await say('What do you all think?');
  assert.deepEqual(speakers(calls), ['Nova', 'Pixel', 'Sage']);

  // An answer that names nobody, or a picker that fails, leaves it with whoever spoke last.
  assert.deepEqual(speakers(await say('And the date?')), ['Sage']);
  assert.deepEqual(speakers(await say('Anything else?')), ['Sage']);
});

test('a room keeps its description when an older app saves it, and the description can be cleared', async (t) => {
  const h = await start(t, []);
  const nova = await h.agent('Nova', 'the planner');
  const room = (await h.api('POST', '/api/rooms', { name: 'Trip', agentIds: [nova.id], mode: 'auto', description: '  Japan in April.  ' })).body;
  assert.equal(room.description, 'Japan in April.');
  let saved = (await h.api('PUT', `/api/rooms/${room.id}`, { name: 'Trip 2', agentIds: [nova.id], mode: 'roundtable' })).body;
  assert.equal(saved.description, 'Japan in April.');
  assert.equal(saved.mode, 'roundtable');
  saved = (await h.api('PUT', `/api/rooms/${room.id}`, { name: 'Trip 2', agentIds: [nova.id], mode: 'auto', description: '' })).body;
  assert.equal(saved.description, '');
  // With one agent there is nobody to choose between: no picker call.
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'Hi' });
  await h.hub.orchestrator.idle(room.id);
  assert.deepEqual(h.providers.calls.map((c) => c.agent ?? 'picker'), ['Nova']);
});
