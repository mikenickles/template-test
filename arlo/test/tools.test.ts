import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { freshDb } from './helpers.ts';
import { fakeFetch } from '../hub/demo.ts';
import { setSecret } from '../hub/secrets.ts';
import { getSettings, updateSettings } from '../hub/settings.ts';
import { eventTime, instant } from '../hub/tools/calendar.ts';
import { bodyText, buildRaw, htmlToText } from '../hub/tools/gmail.ts';
import { allTools, getTool, offeredTools } from '../hub/tools/index.ts';
import { accessToken, beginAuth, finishAuth } from '../hub/tools/oauth.ts';
import { toSpec } from '../hub/tools/types.ts';
import type { ToolContext } from '../hub/tools/types.ts';
import { listPayments, overLimit, spentToday } from '../hub/tools/wallet.ts';

type Call = { method: string; url: string; body?: string };
let log: Call[] = [];
let ctx: ToolContext;

beforeEach(() => {
  freshDb();
  log = [];
  ctx = { fetch: fakeFetch(log), signal: new AbortController().signal, search: async () => ({ text: '', sources: [] }) };
  const tokens = JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Date.now() + 3_600_000 });
  setSecret('google.tokens', tokens);
  setSecret('spotify.tokens', tokens);
  setSecret('stripe.key', 'rk_test_x');
});

/** Validate input the way the hub does, then run the tool. */
async function run(name: string, input: unknown) {
  const tool = getTool(name)!;
  return tool.run(tool.schema.parse(input), ctx) as Promise<any>;
}
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');

// ----- The catalogue itself -----

test('every tool that can need approval has a card, and every schema is a plain object', () => {
  for (const tool of allTools()) {
    const spec = toSpec(tool);
    assert.equal(spec.schema.type, 'object', tool.name);
    assert.equal('$schema' in spec.schema, false);
    if (tool.risk === 'confirm' || tool.risk === 'money') assert.ok(tool.card, tool.name);
  }
});

test('anything that sends, deletes, shares or spends is approval-only', () => {
  const risk = (name: string) => getTool(name)!.risk;
  for (const name of ['gmail_send', 'gmail_trash', 'calendar_update', 'calendar_delete', 'stripe_payment_link']) assert.equal(risk(name), 'confirm', name);
  for (const name of ['wallet_pay', 'stripe_refund']) assert.equal(risk(name), 'money', name);
  // An event becomes approval-only the moment it invites someone.
  const create = getTool('calendar_create')!;
  assert.equal(create.escalate!({ invite: ['a@b.co'] }), true);
  assert.equal(create.escalate!({ invite: [] }), false);
});

test('tools for accounts that are not connected are not offered', () => {
  freshDb();
  const names = offeredTools().map((t) => t.name);
  assert.ok(names.includes('remember'));
  assert.equal(names.some((n) => /^(gmail|calendar|drive|spotify|stripe|wallet)_/.test(n)), false);
});

// ----- Gmail -----

test('an email cannot smuggle extra headers through its fields', () => {
  const raw = decode(buildRaw({ to: ['a@b.co'], subject: 'Hi\r\nBcc: thief@evil.example', body: 'Body' }));
  const [head] = raw.split('\r\n\r\n');
  assert.equal(head!.split('\r\n').some((line) => line.startsWith('Bcc:')), false);
  assert.match(head!, /^Subject: Hi Bcc: thief@evil\.example$/m);
});

test('non-English subjects and bodies survive the trip', () => {
  const raw = decode(buildRaw({ to: ['a@b.co'], subject: 'Café às 15h ☕', body: 'Olá, até já' }));
  const subject = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(raw)![1]!;
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), 'Café às 15h ☕');
  assert.equal(Buffer.from(raw.split('\r\n\r\n')[1]!.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Olá, até já');
});

test('HTML-only mail is turned into readable text', () => {
  assert.equal(htmlToText('<style>p{}</style><p>Hello <b>there</b></p><p>Bye &amp; thanks</p>'), 'Hello there\n\nBye & thanks');
  const html = Buffer.from('<div>Only <i>html</i></div>').toString('base64url');
  assert.equal(bodyText({ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: html } }] }), 'Only html');
});

test('searching and reading mail', async () => {
  const found = await run('gmail_search', { query: 'is:unread' });
  assert.equal(found.count, 2);
  assert.equal(found.messages[0].from, 'Priya Raman <priya@studio-north.example>');
  const mail = await run('gmail_read', { id: 'm1' });
  assert.match(mail.body, /Could we move Thursday to 3pm/);
});

test('a reply stays in its thread and keeps the subject', async () => {
  await run('gmail_send', { to: ['priya@studio-north.example'], body: 'Yes, 3pm works.', reply_to_message_id: 'm1' });
  const sent = log.find((c) => c.url.endsWith('/messages/send'))!;
  const body = JSON.parse(sent.body!);
  assert.equal(body.threadId, 't1');
  const raw = decode(body.raw);
  assert.match(raw, /^Subject: Re: Thursday planning session$/m);
  assert.match(raw, /^In-Reply-To: <m1@mail\.example>$/m);
});

test('bad addresses are stopped before anything is sent', () => {
  const schema = getTool('gmail_send')!.schema;
  assert.equal(schema.safeParse({ to: ['not-an-address'], body: 'x' }).success, false);
  assert.equal(schema.safeParse({ to: [], body: 'x' }).success, false);
});

// ----- Calendar -----

test('calendar times are sent as local time with a zone, or as whole days', () => {
  assert.deepEqual(eventTime('2026-11-14'), { date: '2026-11-14' });
  const timed = eventTime('2026-11-14T09:30') as { dateTime: string; timeZone: string };
  assert.equal(timed.dateTime, '2026-11-14T09:30:00');
  assert.ok(timed.timeZone);
  assert.equal(instant('2026-11-14'), new Date(2026, 10, 14, 0, 0, 0).toISOString());
  assert.equal(instant('2026-11-14', true), new Date(2026, 10, 14, 23, 59, 59).toISOString());
});

test('guests are only emailed when an event actually invites them', async () => {
  await run('calendar_create', { title: 'Gym', start: '2026-11-14T18:00', end: '2026-11-14T19:00' });
  await run('calendar_create', { title: 'Dinner', start: '2026-11-14T19:30', end: '2026-11-14T21:00', invite: ['sam.okafor@mail.example'] });
  const posts = log.filter((c) => c.method === 'POST' && c.url.includes('/events'));
  assert.match(posts[0]!.url, /sendUpdates=none/);
  assert.match(posts[1]!.url, /sendUpdates=all/);
  assert.deepEqual(JSON.parse(posts[1]!.body!).attendees, [{ email: 'sam.okafor@mail.example' }]);
});

// ----- Drive, Spotify -----

test('a Drive search cannot break out of its query', async () => {
  await run('drive_search', { query: "x' or trashed = true or name contains '" });
  const q = new URL(log[0]!.url).searchParams.get('q')!;
  assert.match(q, /name contains 'x\\' or trashed = true or name contains \\''/);
  assert.match(q, /and trashed = false$/);
});

test('playing a track when no device is active hands playback to one that is open', async () => {
  let first = true;
  const inner = ctx.fetch;
  ctx.fetch = (async (input: any, init: any) => {
    if (String(input).includes('/me/player/play') && first) {
      first = false;
      return new Response(JSON.stringify({ error: { status: 404, message: 'No active device found', reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 });
    }
    return inner(input, init);
  }) as typeof fetch;
  const out = await run('spotify_play', { uri: 'spotify:track:6kkwzB6hXLIONkEk9JciA6' });
  assert.equal(out.playing, true);
  const play = log.find((c) => c.url.includes('/me/player/play'))!;
  assert.match(play.url, /device_id=d1/);
  assert.deepEqual(JSON.parse(play.body!), { uris: ['spotify:track:6kkwzB6hXLIONkEk9JciA6'] });
});

test('only real Spotify URIs are accepted', () => {
  const schema = getTool('spotify_play')!.schema;
  assert.equal(schema.safeParse({ uri: 'https://evil.example/x' }).success, false);
  assert.equal(schema.safeParse({ uri: 'spotify:album:4aawyAB9vmqN3uQ7FjRGTy' }).success, true);
});

// ----- Wallet -----

test('payments are off until switched on, and limits hold', () => {
  assert.match(overLimit(1000)!, /switched off/);
  updateSettings({ wallet: { ...getSettings().wallet, enabled: true } });
  assert.equal(overLimit(5000), null);
  assert.match(overLimit(5001)!, /per-purchase limit/);
  assert.equal(getTool('wallet_pay')!.check!({ amount: 50.01, merchant: 'Shop', merchant_url: 'https://shop.example', reason: 'A thing I need' }) !== null, true);
});

test('a payment makes a one-time card capped at exactly the approved amount, and counts toward the day', async () => {
  updateSettings({ wallet: { ...getSettings().wallet, enabled: true } });
  const pay = { amount: 24, merchant: 'Field Notes Shop', merchant_url: 'https://fieldnotes.example/checkout', reason: 'Two pocket notebooks' };
  const out = await run('wallet_pay', pay);
  assert.equal(out.ready, true);
  assert.equal(JSON.stringify(out).includes('4000009990000021'), false); // the model never sees a card number
  const card = new URLSearchParams(log.find((c) => c.method === 'POST' && c.url.endsWith('/v1/issuing/cards'))!.body);
  assert.equal(card.get('type'), 'virtual');
  assert.equal(card.get('spending_controls[spending_limits][0][amount]'), '2400');
  assert.equal(card.get('spending_controls[spending_limits][0][interval]'), 'per_authorization');
  assert.equal(card.get('lifecycle_controls[cancel_after][payment_count]'), '1');
  assert.equal(spentToday(), 2400);
  assert.equal(listPayments()[0]!.status, 'ready');

  // 24 + 50 + 50 would pass the 100 daily limit: the third is refused even though each is under the per-purchase cap.
  await run('wallet_pay', { ...pay, amount: 50 });
  await assert.rejects(run('wallet_pay', { ...pay, amount: 50 }), /today's .* limit/);
  assert.equal(spentToday(), 7400);
});

test('merchant details cannot be turned into command-line flags', () => {
  const schema = getTool('wallet_pay')!.schema;
  const base = { amount: 5, merchant_url: 'https://shop.example', reason: 'Something small and useful' };
  assert.equal(schema.safeParse({ ...base, merchant: '--approve-all' }).success, false);
  assert.equal(schema.safeParse({ ...base, merchant: 'Shop', reason: '--force something long enough' }).success, false);
  assert.equal(schema.safeParse({ ...base, merchant: 'Shop', merchant_url: 'javascript:alert(1)' }).success, false);
});

// ----- Sign-in -----

test('sign-in uses PKCE and a loopback address, and rejects a callback it did not start', async () => {
  updateSettings({ spotifyClientId: 'client123' });
  const url = new URL(beginAuth('spotify', 8787));
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8787/oauth/spotify/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('state')!.length > 16);
  await assert.rejects(finishAuth('spotify', new URLSearchParams({ state: 'forged', code: 'x' }), ctx.fetch, async () => 'x'), /expired/);
});

test('an expired sign-in is refreshed once and saved', async () => {
  setSecret('google.tokens', JSON.stringify({ access_token: 'old', refresh_token: 'ref', expires_at: Date.now() - 1 }));
  updateSettings({ googleClientId: 'cid' });
  const [a, b] = await Promise.all([accessToken('google', ctx.fetch), accessToken('google', ctx.fetch)]);
  assert.equal(a, 'demo');
  assert.equal(b, 'demo');
  assert.equal(log.filter((c) => c.url.includes('oauth2.googleapis.com/token')).length, 1);
});
