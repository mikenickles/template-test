import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Providers } from '../src/providers.js';
import { describeDays, nextRun, Scheduler } from '../src/schedules.js';
import { Hub } from '../src/server.js';
import { Store } from '../src/store.js';

// Local times, so the tests read the same in any time zone. Friday 20 November 2026.
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

test('days read plainly and the next run lands on the right day', () => {
  assert.equal(describeDays([0, 1, 2, 3, 4, 5, 6]), 'Every day');
  assert.equal(describeDays([5, 1, 2, 3, 4]), 'Weekdays');
  assert.equal(describeDays([6, 0]), 'Weekends');
  assert.equal(describeDays([0, 3, 1]), 'Mon, Wed, Sun');

  const daily = { time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(nextRun(daily, at(20, 7)), at(20, 8));
  assert.equal(nextRun(daily, at(20, 8)), at(21, 8), 'strictly after: a run at 8:00 is next due tomorrow');
  const weekdays = { time: '18:30', days: [1, 2, 3, 4, 5] };
  assert.equal(nextRun(weekdays, at(20, 19)), at(23, 18, 30), 'Friday evening rolls to Monday');
});

test('due schedules post their message; late ones are skipped; a finished run leaves a notice', () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-sched-')));
  store.state.rooms.push({ id: 'r1', name: 'Morning', agentIds: ['a1'] });
  const posted = [];
  const orchestrator = {
    post: (roomId, text, attachments, extra) => {
      posted.push({ roomId, text, extra });
      store.messages(roomId).push({ id: `u${posted.length}`, author: { type: 'user' }, text, status: 'done', ...extra });
    },
  };
  let now = at(20, 7);
  const scheduler = new Scheduler({ store, orchestrator, now: () => now });
  const daily = scheduler.create({ roomId: 'r1', text: 'Summarize the news on solar.', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(daily.nextRunAt, at(20, 8));
  assert.throws(() => scheduler.create({ roomId: 'r1', text: 'x', time: '25:00', days: [1] }), /Pick a time/);
  assert.throws(() => scheduler.create({ roomId: 'r1', text: 'x', time: '08:00', days: [] }), /at least one day/);
  assert.throws(() => scheduler.create({ roomId: 'nope', text: 'x', time: '08:00', days: [1] }), /no longer exists/);

  scheduler.tick(at(20, 7, 59));
  assert.equal(posted.length, 0);
  now = at(20, 8, 0);
  scheduler.tick(now);
  assert.deepEqual(posted[0], { roomId: 'r1', text: 'Summarize the news on solar.', extra: { scheduled: { id: daily.id, label: 'Every day at 08:00' } } });
  assert.equal(daily.nextRunAt, at(21, 8));

  // The crew answers, the run ends, and a notice holds the last reply.
  store.messages('r1').push({ id: 'a', author: { type: 'agent', name: 'Nova' }, text: 'Three things happened in solar.', status: 'done' });
  now = at(20, 8, 2);
  scheduler.finished('r1');
  scheduler.finished('r1');
  const notices = scheduler.noticesSince(at(20, 8));
  assert.deepEqual(notices.map((n) => [n.room, n.author, n.text, n.replies]), [['Morning', 'Nova', 'Three things happened in solar.', 1]]);
  assert.equal(scheduler.noticesSince(now).length, 0);

  // The PC slept through Saturday morning: it isn't sent at 3pm, and the next one is Sunday.
  scheduler.tick(at(21, 15));
  assert.equal(posted.length, 1);
  assert.equal(daily.nextRunAt, at(22, 8));

  scheduler.update(daily.id, { enabled: false });
  assert.equal(daily.nextRunAt, null);
  scheduler.tick(at(22, 8));
  assert.equal(posted.length, 1);
});

test('schedules are managed from the phone, run on demand, and their results wait as notices', async (t) => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const hub = new Hub({ store, providers: new Providers({}, {}), name: 'Test PC' });
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${await hub.listen(0, '127.0.0.1')}`;
  const { token } = await (await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const call = async (method, route, body) => {
    const res = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const nova = (await call('POST', '/api/agents', { name: 'Nova', provider: 'demo', model: 'demo' })).body;
  const room = (await call('POST', '/api/rooms', { name: 'Morning', agentIds: [nova.id] })).body;

  assert.equal((await call('POST', '/api/schedules', { roomId: room.id, text: '', time: '08:00', days: [1] })).status, 400);
  const made = (await call('POST', '/api/schedules', { roomId: room.id, text: 'What should I focus on today?', time: '07:45', days: [1, 2, 3, 4, 5] })).body;
  assert.equal(made.enabled, true);
  assert.ok(made.nextRunAt > Date.now());
  assert.deepEqual((await call('GET', '/api/state')).body.schedules.map((s) => s.id), [made.id]);
  const changed = (await call('PUT', `/api/schedules/${made.id}`, { time: '08:15' })).body;
  assert.equal(changed.time, '08:15');
  assert.equal(changed.text, 'What should I focus on today?', 'fields not sent stay as they were');

  const since = Date.now() - 1;
  assert.equal((await call('POST', `/api/schedules/${made.id}/run`)).status, 200);
  await hub.orchestrator.idle(room.id);
  const [asked, reply] = (await call('GET', `/api/rooms/${room.id}/messages`)).body.messages;
  assert.deepEqual(asked.scheduled, { id: made.id, label: 'Weekdays at 08:15' });
  const { notices } = (await call('GET', `/api/notices?since=${since}`)).body;
  assert.deepEqual(notices.map((n) => [n.room, n.author, n.roomId]), [['Morning', 'Nova', room.id]]);
  assert.match(notices[0].text, /demo mode/);
  assert.equal(reply.author.name, 'Nova');

  await call('DELETE', `/api/rooms/${room.id}`);
  assert.deepEqual((await call('GET', '/api/schedules')).body.schedules, [], "a room's schedules go with it");
});
