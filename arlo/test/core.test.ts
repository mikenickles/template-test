import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { freshDb } from './helpers.ts';
import { addMemory, deleteMemory, memoryBlock, searchMemories } from '../hub/agent/memory.ts';
import { claimDue, createRoutine, describeSchedule, listRoutines, nextOccurrence } from '../hub/agent/schedule.ts';
import { addMessage, compactIfNeeded, contextWindow, freshStart, repair } from '../hub/agent/thread.ts';
import { db } from '../hub/db.ts';
import { toAnthropicMessages, echoable } from '../hub/providers/anthropic.ts';
import { toGeminiContents } from '../hub/providers/gemini.ts';
import { toOpenAIInput } from '../hub/providers/openai.ts';
import type { Msg } from '../hub/providers/types.ts';
import { deleteSecret, getSecret, setSecret } from '../hub/secrets.ts';
import { isQuiet } from '../hub/settings.ts';

beforeEach(freshDb);

// ----- Secrets -----

test('secrets come back intact and are not stored in the clear', () => {
  setSecret('key.openai', 'sk-very-secret');
  assert.equal(getSecret('key.openai'), 'sk-very-secret');
  const row = db().prepare("select value from secrets where key = 'key.openai'").get() as { value: Uint8Array };
  assert.equal(Buffer.from(row.value).includes('sk-very-secret'), false);
  deleteSecret('key.openai');
  assert.equal(getSecret('key.openai'), null);
});

test('a tampered secret is rejected rather than decrypted', () => {
  setSecret('k', 'value');
  const row = db().prepare("select value from secrets where key = 'k'").get() as { value: Uint8Array };
  const bad = Buffer.from(row.value);
  bad[bad.length - 1]! ^= 1;
  db().prepare("update secrets set value = ? where key = 'k'").run(bad);
  assert.throws(() => getSecret('k'));
});

// ----- Schedule -----

test('next occurrence respects the time of day and chosen weekdays', () => {
  const fri = new Date(2026, 10, 13, 8, 0); // Friday 13 Nov 2026, 08:00
  assert.equal(new Date(nextOccurrence('09:30', null, fri)).toString(), new Date(2026, 10, 13, 9, 30).toString());
  assert.equal(new Date(nextOccurrence('07:30', null, fri)).toString(), new Date(2026, 10, 14, 7, 30).toString());
  // Weekdays only: from Friday after the slot, the next is Monday.
  assert.equal(new Date(nextOccurrence('07:30', [1, 2, 3, 4, 5], fri)).toString(), new Date(2026, 10, 16, 7, 30).toString());
});

test('schedules read naturally', () => {
  assert.match(describeSchedule({ once_at: null, time: '07:30', days: '[1,2,3,4,5]' }), /^Weekdays at 7:30/);
  assert.match(describeSchedule({ once_at: null, time: '18:00', days: null }), /^Every day at 6:00/);
});

test('a reminder fires once; a routine keeps going; a long-missed routine is skipped', () => {
  const start = new Date(2026, 10, 13, 8, 0).getTime();
  const once = createRoutine({ title: 'Call', instructions: 'Remind to call', at: start + 60_000 });
  const daily = createRoutine({ title: 'Brief', instructions: 'Morning brief', time: '09:00' });
  db().prepare('update tasks set next_run = ? where id = ?').run(new Date(2026, 10, 13, 9, 0).getTime(), daily.id);

  assert.deepEqual(claimDue(start).map((r) => r.id), []);
  assert.deepEqual(claimDue(start + 61_000).map((r) => r.id), [once.id]);
  assert.deepEqual(claimDue(start + 62_000).map((r) => r.id), []); // not twice
  assert.deepEqual(listRoutines().map((r) => r.id), [daily.id]);

  const nineOhOne = new Date(2026, 10, 13, 9, 1).getTime();
  assert.deepEqual(claimDue(nineOhOne).map((r) => r.id), [daily.id]);
  // The hub was off all the next day: the missed run is dropped, the schedule moves on.
  const lateNextDay = new Date(2026, 10, 14, 15, 0).getTime();
  assert.deepEqual(claimDue(lateNextDay).map((r) => r.id), []);
  assert.equal(listRoutines()[0]!.next_run, new Date(2026, 10, 15, 9, 0).getTime());
});

test('quiet hours can cross midnight', () => {
  const s = { quietStart: '22:00', quietEnd: '07:00' };
  assert.equal(isQuiet(new Date(2026, 0, 1, 23, 0), s), true);
  assert.equal(isQuiet(new Date(2026, 0, 1, 6, 59), s), true);
  assert.equal(isQuiet(new Date(2026, 0, 1, 7, 0), s), false);
  assert.equal(isQuiet(new Date(2026, 0, 1, 12, 0), s), false);
});

// ----- Memory -----

test('memories can be added, found, listed for the prompt and forgotten', () => {
  const a = addMemory('Prefers window seats on flights', 'preference');
  addMemory('Sister is called Dana', 'person');
  assert.equal(searchMemories('flight seats')[0]!.id, a.id);
  assert.match(memoryBlock(), /\(preference\) Prefers window seats/);
  assert.equal(deleteMemory(a.id), true);
  assert.doesNotMatch(memoryBlock(), /window seats/);
});

// ----- Conversation storage -----

const call = (id: string) => ({ id, name: 't', input: {} });
const result = (id: string) => ({ id, name: 't', output: 'ok' });

test('an interrupted turn never leaves a tool call without its result', () => {
  const history: Msg[] = [
    { role: 'user', text: 'one' },
    { role: 'assistant', text: 'Let me check.', toolCalls: [call('a')] }, // interrupted: no result followed
    { role: 'user', text: 'two' },
    { role: 'assistant', text: '', toolCalls: [call('b')] },
    { role: 'tool', results: [result('b')] },
    { role: 'tool', results: [result('zzz')] }, // orphan
    { role: 'assistant', text: 'Done.', toolCalls: [] },
  ];
  const fixed = repair(history);
  assert.deepEqual(fixed.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'tool', 'assistant']);
  assert.deepEqual((fixed[1] as { toolCalls: unknown[] }).toolCalls, []);
});

test('the hub\'s own notes and routine reports reach the model clearly labelled', () => {
  addMessage('main', 'user', { text: 'hello', stamp: 'Friday' });
  addMessage('main', 'assistant', { text: 'Hi.' });
  addMessage('main', 'assistant', { text: 'Two meetings today.', title: 'Morning brief' }, 'routine');
  addMessage('main', 'note', { text: 'Email sent.' });
  const { history } = contextWindow('main');
  assert.equal(history[0]!.role === 'user' && history[0]!.text, '[Friday]\nhello');
  assert.match((history[1] as { text: string }).text, /Report from the routine "Morning brief"/);
  assert.match((history[2] as { text: string }).text, /Note from Arlo's hub, not from the user: Email sent\./);
});

test('a long conversation is folded into a summary and keeps its recent tail intact', async () => {
  for (let i = 0; i < 40; i++) {
    addMessage('main', 'user', { text: `question ${i} ${'x'.repeat(4000)}` });
    addMessage('main', 'assistant', { text: '', toolCalls: [call(`c${i}`)] });
    addMessage('main', 'tool', { results: [result(`c${i}`)] });
    addMessage('main', 'assistant', { text: `answer ${i}` });
  }
  const compacted = await compactIfNeeded('main', async () => 'They asked forty questions.');
  assert.equal(compacted, true);
  const { history } = contextWindow('main');
  assert.match((history[0] as { text: string }).text, /Summary of our earlier conversation/);
  assert.ok(history.length < 40);
  assert.match((history.at(-1) as { text: string }).text, /answer 39/);
  // Every tool call in what is left still has its result right after it.
  history.forEach((m, i) => {
    if (m.role === 'assistant' && m.toolCalls.length) assert.equal(history[i + 1]!.role, 'tool');
  });
  assert.equal(await compactIfNeeded('main', async () => 'again'), false);
});

test('a fresh start drops the conversation from context but not from the record', () => {
  addMessage('main', 'user', { text: 'old' });
  addMessage('main', 'assistant', { text: 'old reply' });
  freshStart('main');
  addMessage('main', 'user', { text: 'new' });
  assert.deepEqual(contextWindow('main').history, [{ role: 'user', text: 'new' }]);
  assert.equal((db().prepare("select count(*) as n from messages where kind = 'chat'").get() as { n: number }).n, 3);
});

// ----- Each provider's wire format -----

const convo: Msg[] = [
  { role: 'user', text: 'What is on today?' },
  { role: 'assistant', text: 'Checking.', toolCalls: [{ id: 'call.1/x', name: 'calendar_list', input: { from: '2026-11-13' } }] },
  { role: 'tool', results: [{ id: 'call.1/x', name: 'calendar_list', output: '{"events":[]}' }] },
  { role: 'assistant', text: 'Nothing today.', toolCalls: [] },
];

test('Claude: tool use and results pair up by a sanitised id', () => {
  const m = toAnthropicMessages(convo);
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'user', 'assistant']);
  const use = (m[1]!.content as { type: string; id?: string }[])[1]!;
  const res = (m[2]!.content as { type: string; tool_use_id?: string }[])[0]!;
  assert.equal(use.type, 'tool_use');
  assert.equal(use.id, 'call_1_x');
  assert.equal(res.tool_use_id, 'call_1_x');
});

test('Claude: after a mid-reply fallback, the declining model\'s reasoning and tool calls are not echoed', () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 's' },
    { type: 'tool_use', id: 'a', name: 't', input: {} },
    { type: 'text', text: 'partial' },
    { type: 'fallback' },
    { type: 'thinking', thinking: '', signature: 's2' },
    { type: 'tool_use', id: 'b', name: 't', input: {} },
  ] as never[];
  assert.deepEqual(echoable(content).map((b: { type: string; id?: string }) => b.id ?? b.type), ['text', 'fallback', 'thinking', 'b']);
  // No fallback: everything goes back untouched.
  assert.equal(echoable(content.filter((b: { type: string }) => b.type !== 'fallback')).length, 5);
});

test('OpenAI: calls and outputs become separate items joined by call_id', () => {
  const items = toOpenAIInput(convo) as { type?: string; role?: string; call_id?: string; arguments?: string }[];
  assert.deepEqual(items.map((x) => x.type ?? x.role), ['user', 'assistant', 'function_call', 'function_call_output', 'assistant']);
  assert.equal(items[2]!.call_id, items[3]!.call_id);
  assert.equal(items[2]!.arguments, '{"from":"2026-11-13"}');
});

test('Gemini: all calls sit in one model turn, followed by all responses in one user turn', () => {
  const contents = toGeminiContents(convo);
  assert.deepEqual(contents.map((c) => c.role), ['user', 'model', 'user', 'model']);
  assert.equal(contents[1]!.parts![1]!.functionCall!.name, 'calendar_list');
  assert.equal(contents[2]!.parts![0]!.functionResponse!.name, 'calendar_list');
});
