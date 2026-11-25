import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { isQuiet, parseJson, settingsFields, DEFAULTS } from '../src/proactive.js';

/** Agents answer as themselves; the check-in decision and web checks come from scripts. */
class Scripted extends Providers {
  constructor({ decisions = [], checks = [], anthropic = false } = {}) {
    super({ openai: { apiKey: 'sk-test' }, ...(anthropic ? { anthropic: { apiKey: 'sk-ant-test' } } : {}) }, {});
    this.decisions = decisions;
    this.checks = checks;
    this.calls = [];
  }
  async stream({ system, messages, agent, onDelta }) {
    if (/^You decide whether an AI assistant/.test(system)) {
      this.calls.push({ decide: messages[0].content });
      return this.decisions.shift() ?? '{"reach_out": false}';
    }
    if (/^You check things on the web/.test(system)) {
      this.calls.push({ check: messages[0].content });
      return this.checks.shift() ?? '{"finding": "nothing", "notify": false}';
    }
    this.calls.push({ agent: agent.name, system, messages });
    const reply = `${agent.name} here`;
    onDelta(reply);
    return reply;
  }
}

async function start(t, scripts) {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const providers = new Scripted(scripts);
  const hub = new Hub({ store, providers, name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const api = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const agent = async (name, extra = {}) => (await api('POST', '/api/agents', { name, provider: 'openai', model: 'gpt-test', instructions: '', ...extra })).body;
  // No quiet hours unless a test sets them.
  await api('PUT', '/api/proactive', { quietStart: '00:00', quietEnd: '00:00' });
  return { hub, store, providers, api, agent };
}

test('quiet hours can run past midnight, and settings are checked', () => {
  const at = (h, m = 0) => new Date(2026, 10, 20, h, m).getTime();
  const night = { ...DEFAULTS, quietStart: '21:00', quietEnd: '08:00' };
  assert.equal(isQuiet(night, at(23)), true);
  assert.equal(isQuiet(night, at(7, 59)), true);
  assert.equal(isQuiet(night, at(8)), false);
  assert.equal(isQuiet(night, at(14)), false);
  const lunch = { ...DEFAULTS, quietStart: '12:00', quietEnd: '13:00' };
  assert.equal(isQuiet(lunch, at(12, 30)), true);
  assert.equal(isQuiet(lunch, at(13, 30)), false);
  assert.equal(isQuiet({ ...DEFAULTS, quietStart: '00:00', quietEnd: '00:00' }, at(3)), false, 'equal times mean no quiet hours');

  assert.throws(() => settingsFields({ quietStart: '25:00' }, DEFAULTS, []), /quiet hours start/);
  assert.throws(() => settingsFields({ dailyLimit: 0 }, DEFAULTS, []), /between 1 and 30/);
  assert.throws(() => settingsFields({ brief: { agentId: 'nope' } }, DEFAULTS, []), /no longer exists/);
  const next = settingsFields({ dailyLimit: 3, brief: { enabled: true, time: '07:30' } }, DEFAULTS, []);
  assert.equal(next.dailyLimit, 3);
  assert.deepEqual(next.brief, { enabled: true, time: '07:30', agentId: null });
  assert.deepEqual(parseJson('Sure! {"reach_out": true, "topic": "x"} done'), { reach_out: true, topic: 'x' });
  assert.equal(parseJson('no json here'), null);
});

test('a proactive agent checks in only when there is something worth saying', async (t) => {
  const h = await start(t, {
    decisions: ['{"reach_out": false}', '{"reach_out": true, "room": "Launch", "topic": "The beta launches Friday and the invite email isn\'t drafted yet."}'],
  });
  const quiet = await h.agent('Sage');
  const nova = await h.agent('Nova', { proactive: 'gentle' });
  assert.equal(nova.proactive, 'gentle');
  assert.equal(quiet.proactive, 'off');
  const room = (await h.api('POST', '/api/rooms', { name: 'Launch', agentIds: [nova.id, quiet.id] })).body;
  await h.api('POST', `/api/rooms/${room.id}/messages`, { text: 'We launch the beta on Friday.' });
  await h.hub.orchestrator.idle(room.id);
  const count = () => h.store.messages(room.id).length;
  const before = count();

  const now = Date.now();
  await h.hub.proactive.tick(now); // schedules Nova's first look
  assert.equal(count(), before, 'not due yet');
  await h.hub.proactive.tick(now + 2 * 60 * 60 * 1000);
  assert.equal(count(), before, 'the decision said no, so nothing is posted');
  const decide = h.providers.calls.find((c) => c.decide)?.decide ?? '';
  assert.match(decide, /We launch the beta on Friday/, 'the decision sees the conversation');
  assert.match(decide, /Nova/);

  // Next time it's due, the decision says yes.
  h.store.state.proactive.agents[nova.id].next = now;
  await h.hub.proactive.tick(now + 3 * 60 * 60 * 1000);
  const posted = h.store.messages(room.id).at(-1);
  assert.equal(posted.author.name, 'Nova');
  assert.equal(posted.proactive.kind, 'checkin');
  const prompt = h.providers.calls.findLast((c) => c.agent === 'Nova').messages.at(-1).content;
  assert.match(prompt, /reaching out to the user on your own/);
  assert.match(prompt, /invite email/);
  assert.ok(!h.providers.calls.some((c) => c.agent === 'Sage' && c.messages.at(-1).content.includes('reaching out')), 'only Nova speaks');

  const state = (await h.api('GET', '/api/state')).body;
  assert.equal(state.nudges.length, 1);
  assert.equal(state.nudges[0].agentId, nova.id);
  assert.equal(state.nudges[0].text, 'Nova here');
  const notices = (await h.api('GET', '/api/notices?since=0')).body.notices;
  assert.equal(notices.at(-1).kind, 'proactive');
  assert.equal(notices.at(-1).author, 'Nova');

  // Opening the room is seeing it.
  await h.api('GET', `/api/rooms/${room.id}/messages`);
  assert.equal((await h.api('GET', '/api/state')).body.nudges.length, 0);
});

test('quiet hours and the daily limit hold check-ins back', async (t) => {
  const yes = '{"reach_out": true, "room": "Plans", "topic": "Something timely."}';
  const h = await start(t, { decisions: [yes, yes, yes] });
  const nova = await h.agent('Nova', { proactive: 'active' });
  const room = (await h.api('POST', '/api/rooms', { name: 'Plans', agentIds: [nova.id] })).body;
  const proactive = h.hub.proactive;
  const posts = () => h.store.messages(room.id).filter((m) => m.proactive).length;
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const t0 = noon.getTime();

  await proactive.tick(t0); // schedules Nova's first look
  await h.api('PUT', '/api/proactive', { quietStart: '11:00', quietEnd: '13:00', dailyLimit: 1 });
  proactive.state.agents[nova.id].next = t0;
  await proactive.tick(t0 + 1000);
  assert.equal(posts(), 0, 'quiet hours');

  await h.api('PUT', '/api/proactive', { quietStart: '00:00', quietEnd: '00:00' });
  await proactive.tick(t0 + 2000);
  assert.equal(posts(), 1);
  proactive.state.agents[nova.id].next = t0;
  await proactive.tick(t0 + 3000);
  assert.equal(posts(), 1, 'the daily limit is reached');
});

test('an agent books a follow-up, and is woken to send it', async (t) => {
  const h = await start(t, {});
  const nova = await h.agent('Nova');
  const room = (await h.api('POST', '/api/rooms', { name: 'Run club', agentIds: [nova.id] })).body;
  const tools = h.hub.proactive.toolsFor(nova, room);
  assert.equal(tools.run('follow_up', { note: 'ask how the long run went' }).isError, true, 'needs a time');
  assert.equal(tools.run('follow_up', { in_minutes: 0, note: 'x' }).isError, true);
  const booked = tools.run('follow_up', { in_minutes: 90, note: 'ask how the long run went' });
  assert.equal(booked.isError, false);
  assert.match(booked.text, /Follow-up set for/);
  const state = (await h.api('GET', '/api/state')).body;
  assert.equal(state.followups.length, 1);
  assert.equal(state.followups[0].roomId, room.id);
  assert.match(tools.prompt, /Today is/);

  await h.hub.proactive.tick(Date.now() + 30 * 60 * 1000);
  assert.equal(h.store.messages(room.id).length, 0, 'not yet');
  await h.hub.proactive.tick(Date.now() + 91 * 60 * 1000);
  const posted = h.store.messages(room.id).at(-1);
  assert.equal(posted.proactive.kind, 'followup');
  assert.match(h.providers.calls.at(-1).messages.at(-1).content, /ask how the long run went/);
  assert.equal((await h.api('GET', '/api/state')).body.followups.length, 0, 'used up');

  // Cancelled from the app.
  tools.run('follow_up', { in_minutes: 60, note: 'again' });
  const id = h.store.state.followups[0].id;
  assert.equal((await h.api('DELETE', `/api/followups/${id}`)).body.followups.length, 0);
});

test('regular updates come as often as asked, past the daily limit, pause in quiet hours, and can be cancelled', async (t) => {
  const h = await start(t, {});
  const scout = await h.agent('Scout');
  const room = (await h.api('POST', '/api/rooms', { name: 'Restock', agentIds: [scout.id] })).body;
  await h.api('PUT', '/api/proactive', { dailyLimit: 1, quietStart: '00:00', quietEnd: '00:00' });
  const tools = h.hub.proactive.toolsFor(scout, room);
  assert.match(tools.prompt, /follow_up with repeat_minutes, not watch/);
  assert.match(tools.prompt, /no quiet hours/);
  assert.equal(tools.run('follow_up', { in_minutes: 15, repeat_minutes: 5, note: 'x' }).isError, true, 'every 15 minutes at most');

  const made = tools.run('follow_up', { in_minutes: 15, repeat_minutes: 15, note: 'Report on the Switch 3 restock' });
  assert.equal(made.isError, false);
  assert.match(made.text, /then every 15 minutes, until cancelled/);
  assert.equal(made.card.every, '15 minutes');
  const updates = () => h.store.messages(room.id).filter((m) => m.proactive?.kind === 'followup').length;
  const t0 = Date.now();
  await h.hub.proactive.tick(t0 + 16 * 60_000);
  assert.equal(updates(), 1);
  assert.match(h.providers.calls.at(-1).messages.at(-1).content, /regular update the user asked for \(every 15 minutes/);
  assert.equal(h.store.state.followups.length, 1, 'it keeps going');
  await h.hub.proactive.tick(t0 + 31 * 60_000);
  assert.equal(updates(), 2, 'the daily limit is only for check-ins nobody asked for');

  // In quiet hours it skips a turn and carries on after.
  const hour = new Date(t0 + 46 * 60_000).getHours();
  const hh = (n) => `${String(n % 24).padStart(2, '0')}:00`;
  await h.api('PUT', '/api/proactive', { quietStart: hh(hour), quietEnd: hh(hour + 1) });
  await h.hub.proactive.tick(t0 + 46 * 60_000);
  assert.equal(updates(), 2, 'quiet');
  assert.ok(h.store.state.followups[0].at > t0 + 46 * 60_000, 'the next one is set');

  const listed = h.hub.proactive.toolsFor(scout, room).prompt;
  const id = /\[id ([0-9a-f]{8})\] every 15 minutes/.exec(listed)[1];
  assert.equal(tools.run('cancel_follow_up', { id }).isError, false);
  assert.equal(h.store.state.followups.length, 0);
});

test('watches check the web and speak up when the condition is met', async (t) => {
  const plain = await start(t, {});
  const nova0 = await plain.agent('Nova');
  const room0 = (await plain.api('POST', '/api/rooms', { name: 'Deals', agentIds: [nova0.id] })).body;
  assert.match(plain.hub.proactive.toolsFor(nova0, room0).run('watch', { what: 'x', every: 'day' }).text, /Anthropic key/);

  const h = await start(t, {
    anthropic: true,
    checks: ['{"finding": "$349 at Best Buy", "notify": false}', '{"finding": "$279 at Best Buy", "notify": true}'],
  });
  const nova = await h.agent('Nova');
  const room = (await h.api('POST', '/api/rooms', { name: 'Deals', agentIds: [nova.id] })).body;
  const tools = h.hub.proactive.toolsFor(nova, room);
  const made = tools.run('watch', { what: 'the price of the XM6 headphones at Best Buy', condition: 'under $300', every: 'day' });
  assert.equal(made.isError, false);
  const watch = (await h.api('GET', '/api/state')).body.watches[0];
  assert.equal(watch.condition, 'under $300');

  const now = Date.now();
  await h.hub.proactive.tick(now + 2 * 60 * 1000);
  assert.match(h.providers.calls.find((c) => c.check).check, /under \$300/);
  assert.equal(h.store.state.watches[0].lastFinding, '$349 at Best Buy');
  assert.equal(h.store.messages(room.id).length, 0, 'not under $300 yet');

  await h.hub.proactive.tick(now + 25 * 60 * 60 * 1000);
  const posted = h.store.messages(room.id).at(-1);
  assert.equal(posted.proactive.kind, 'watch');
  assert.match(h.providers.calls.at(-1).messages.at(-1).content, /\$279 at Best Buy \(before: \$349 at Best Buy\)/);

  assert.match(h.hub.proactive.toolsFor(nova, room).prompt, /Things you are watching: \[id/);
  assert.equal(tools.run('stop_watching', { id: watch.id }).isError, false);
  assert.equal(h.store.state.watches.length, 0);
});

test('a watch is checked as often as asked, at a time of day if asked, and its timing can change', async (t) => {
  const h = await start(t, { anthropic: true, checks: ['{"finding": "in stock", "notify": false}', '{"finding": "in stock", "notify": false}'] });
  const scout = await h.agent('Scout');
  const room = (await h.api('POST', '/api/rooms', { name: 'Deals', agentIds: [scout.id] })).body;
  const tools = h.hub.proactive.toolsFor(scout, room);

  const often = tools.run('watch', { what: 'Switch 3 stock at Target', every_minutes: 30 });
  assert.equal(often.isError, false);
  assert.match(often.text, /checked every 30 minutes/);
  assert.equal(often.card.every, '30 minutes', 'the card says how often');
  const watch = h.store.state.watches[0];
  const now = Date.now();
  await h.hub.proactive.tick(now + 2 * 60_000);
  assert.ok(Math.abs(watch.nextCheckAt - (now + 2 * 60_000 + 30 * 60_000)) < 1000, 'next check in 30 minutes');

  assert.equal(tools.run('watch', { what: 'x', every_minutes: 5 }).isError, true, 'no more often than every 15 minutes');
  assert.equal(tools.run('watch', { what: 'x', at_time: '7am' }).isError, true, 'times are HH:MM');

  // "Check it every morning at 7:30 instead."
  const changed = tools.run('watch', { id: watch.id, at_time: '07:30' });
  assert.equal(changed.isError, false);
  assert.equal(h.store.state.watches.length, 1, 'changed, not added');
  assert.equal(watch.every, 'day at 7:30 am');
  const next = new Date(watch.nextCheckAt);
  assert.deepEqual([next.getHours(), next.getMinutes()], [7, 30]);
  assert.ok(watch.nextCheckAt > Date.now() && watch.nextCheckAt - Date.now() <= 24 * 60 * 60_000);
  assert.match(h.hub.proactive.toolsFor(scout, room).prompt, /every day at 7:30 am, next check/);

  // Older watches, made with "hour" or "day", keep working.
  assert.equal(tools.run('watch', { what: 'old style', every: 'hour' }).card.every, 'hour');
  assert.equal(tools.run('watch', { what: 'weekly', every_minutes: 10080 }).card.every, 'week');
  assert.equal(tools.run('watch', { id: 'nope', every_minutes: 60 }).isError, true);
});

test('the morning brief arrives once a day, in its own room', async (t) => {
  const h = await start(t, {});
  const nova = await h.agent('Nova', { abilities: ['web'] });
  const other = (await h.api('POST', '/api/rooms', { name: 'Trip', agentIds: [nova.id] })).body;
  await h.api('POST', `/api/rooms/${other.id}/messages`, { text: 'Book the Kyoto hotel.' });
  await h.hub.orchestrator.idle(other.id);
  assert.equal((await h.api('PUT', '/api/proactive', { brief: { enabled: true, time: '07:00', agentId: nova.id } })).body.brief.enabled, true);

  const morning = new Date();
  morning.setHours(7, 5, 0, 0);
  await h.hub.proactive.tick(morning.getTime() - 10 * 60 * 1000);
  assert.ok(!h.store.state.rooms.some((r) => r.brief), 'not before its time');
  await h.hub.proactive.tick(morning.getTime());
  const room = h.store.state.rooms.find((r) => r.brief);
  assert.equal(room.name, 'Morning brief');
  assert.deepEqual(room.agentIds, [nova.id]);
  const prompt = h.providers.calls.at(-1).messages.at(-1).content;
  assert.match(prompt, /morning brief/);
  assert.match(prompt, /Trip/, 'it knows what the crew has been working on');
  assert.equal(h.store.messages(room.id).at(-1).proactive.kind, 'brief');
  await h.hub.proactive.tick(morning.getTime() + 60 * 1000);
  assert.equal(h.store.messages(room.id).length, 1, 'once a day');
});

test('deleting an agent or room takes its follow-ups, watches and cards with it', async (t) => {
  const h = await start(t, {});
  const nova = await h.agent('Nova');
  const room = (await h.api('POST', '/api/rooms', { name: 'Plans', agentIds: [nova.id] })).body;
  h.hub.proactive.toolsFor(nova, room).run('follow_up', { in_minutes: 60, note: 'x' });
  await h.api('DELETE', `/api/rooms/${room.id}`);
  assert.equal(h.store.state.followups.length, 0);
  await h.api('DELETE', `/api/agents/${nova.id}`);
  assert.equal(h.store.state.proactive.agents[nova.id], undefined);
});
