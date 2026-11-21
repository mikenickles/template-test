import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Providers } from '../src/providers.js';
import { Hub } from '../src/server.js';
import { Google, SCOPES, bodyText, htmlToText, runGoogleTool } from '../src/google.js';
import { anthropicTools } from '../src/anthropic.js';
import { buildSystemPrompt, resolveAbilities } from '../src/orchestrator.js';

const CLIENT = { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'secret' };
const b64 = (s) => Buffer.from(s).toString('base64url');

/** A pretend Google: answers by URL and method, and keeps every request. */
function fakeGoogle(routes) {
  const requests = [];
  const doFetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body ? JSON.parse(init.body) : null;
    requests.push({ method: init.method ?? 'GET', url: u, body, auth: init.headers?.authorization });
    const handler = routes.find(([method, match]) => (init.method ?? 'GET') === method && match.test(u.origin + u.pathname));
    const [status, json] = handler ? handler[2](u, body) : [404, { error: { message: 'no route' } }];
    return new Response(typeof json === 'string' ? json : JSON.stringify(json), { status });
  };
  return { requests, fetch: doFetch };
}

const tokenRoute = ['POST', /oauth2\.googleapis\.com\/token$/, (u, body) => {
  if (body.grant_type === 'authorization_code') return [200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: SCOPES.join(' ') }];
  return [200, { access_token: 'at-2', expires_in: 3600 }];
}];
const profileRoute = ['GET', /gmail\/v1\/users\/me\/profile$/, () => [200, { emailAddress: 'alex@example.com' }]];

async function connected(routes, extra = {}) {
  const saved = [];
  const fake = fakeGoogle([tokenRoute, profileRoute, ...routes]);
  const google = new Google({ config: { ...CLIENT, ...extra }, onChange: (c) => saved.push(c), fetch: fake.fetch });
  const url = new URL(google.authUrl('http://127.0.0.1:9/google/callback'));
  await google.finish({ code: 'code-1', state: url.searchParams.get('state') });
  return { google, fake, saved };
}

test('connecting asks for the right scopes with PKCE, and keeps only a state it issued', async () => {
  const fake = fakeGoogle([tokenRoute, profileRoute]);
  const saved = [];
  const google = new Google({ onChange: (c) => saved.push(c), fetch: fake.fetch });
  assert.deepEqual(google.status(), { configured: false, connected: false, email: '' });
  assert.throws(() => google.authUrl('http://127.0.0.1:9/cb'), /client ID and secret first/);
  assert.throws(() => google.setClient('nope', 'x'), /apps\.googleusercontent\.com/);
  google.setClient(CLIENT.clientId, CLIENT.clientSecret);

  const url = new URL(google.authUrl('http://127.0.0.1:9/google/callback'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.deepEqual(url.searchParams.get('scope').split(' '), SCOPES);
  assert.ok(!url.searchParams.get('scope').includes('gmail.send'), 'never asks to send mail');

  await assert.rejects(google.finish({ code: 'x', state: 'forged' }), /expired/);
  await assert.rejects(google.finish({ error: 'access_denied', state: url.searchParams.get('state') }), /not allowed/);
  const again = new URL(google.authUrl('http://127.0.0.1:9/google/callback'));
  const done = await google.finish({ code: 'code-1', state: again.searchParams.get('state') });
  assert.deepEqual(done, { configured: true, connected: true, email: 'alex@example.com', missing: [] });
  const exchange = fake.requests.find((r) => r.body?.grant_type === 'authorization_code');
  assert.ok(exchange.body.code_verifier.length >= 43, 'sends the PKCE verifier');
  assert.equal(exchange.body.redirect_uri, 'http://127.0.0.1:9/google/callback');
  assert.equal(saved.at(-1).refreshToken, 'rt-1');
  await assert.rejects(google.finish({ code: 'code-1', state: again.searchParams.get('state') }), /expired/, 'a state works once');

  await google.disconnect();
  assert.equal(google.status().connected, false);
  assert.ok(fake.requests.some((r) => r.url.pathname === '/revoke'));
});

test('mail: search, read (plain or HTML) and drafts, never sending', async () => {
  const { google, fake } = await connected([
    ['GET', /users\/me\/messages$/, (u) => [200, { messages: u.searchParams.get('q') === 'nothing' ? undefined : [{ id: 'm1' }] }]],
    ['GET', /users\/me\/messages\/m1$/, (u) => (u.searchParams.get('format') === 'full'
      ? [200, { id: 'm1', threadId: 't1', snippet: 'hi', payload: { headers: [{ name: 'From', value: 'Kim <kim@x.com>' }, { name: 'Subject', value: 'Dinner' }], parts: [
        { mimeType: 'text/html', body: { data: b64('<p>See you at <b>7</b>&amp; bring wine</p>') } },
        { mimeType: 'application/pdf', filename: 'menu.pdf', body: {} },
      ] } }]
      : [200, { id: 'm1', threadId: 't1', snippet: 'See you at 7 &amp; bring wine', labelIds: ['UNREAD'], payload: { headers: [
        { name: 'From', value: 'Kim <kim@x.com>' }, { name: 'Subject', value: 'Dinner' }, { name: 'Date', value: 'Fri' }, { name: 'Message-ID', value: '<abc@x>' },
      ] } }])],
    ['POST', /users\/me\/drafts$/, () => [200, { id: 'd1' }]],
  ]);
  const found = await google.searchMail({ query: 'is:unread' });
  assert.match(found, /id m1 \| Fri \| from Kim <kim@x.com> \| Dinner \| unread/);
  assert.match(found, /See you at 7 & bring wine/);
  assert.equal(await google.searchMail({ query: 'nothing' }), 'No emails matched.');
  const read = await google.readMail({ id: 'm1' });
  assert.match(read, /Subject: Dinner/);
  assert.match(read, /Attachments: menu\.pdf/);
  assert.match(read, /See you at 7& bring wine/);

  const saved = await google.draftMail({ to: 'kim@x.com', body: 'Sounds good!', reply_to_id: 'm1' });
  assert.match(saved, /Saved a draft to kim@x.com \("Re: Dinner"\)/);
  const draft = fake.requests.find((r) => r.url.pathname.endsWith('/drafts'));
  const raw = Buffer.from(draft.body.message.raw, 'base64url').toString();
  assert.match(raw, /^To: kim@x.com/m);
  assert.match(raw, /^In-Reply-To: <abc@x>/m);
  assert.equal(draft.body.message.threadId, 't1');
  assert.ok(!fake.requests.some((r) => /messages\/send|drafts\/send/.test(r.url.pathname)), 'nothing is ever sent');
  assert.equal(draft.auth, 'Bearer at-1');
});

test('calendar and Drive', async () => {
  const { google, fake } = await connected([
    ['GET', /calendars\/primary\/events$/, () => [200, { items: [{ summary: 'Dentist', start: { dateTime: '2026-12-01T15:00:00Z' }, end: { dateTime: '2026-12-01T16:00:00Z' }, location: 'Main St' }] }]],
    ['POST', /calendars\/primary\/events$/, (u, body) => [200, { id: 'e1', htmlLink: 'https://calendar/e1', ...body }]],
    ['GET', /drive\/v3\/files$/, (u) => [200, { files: [{ id: 'f1', name: 'Trip plan', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-11-01T00:00:00Z' }], q: u.searchParams.get('q') }]],
    ['GET', /drive\/v3\/files\/f1$/, () => [200, { id: 'f1', name: 'Trip plan', mimeType: 'application/vnd.google-apps.document' }]],
    ['GET', /drive\/v3\/files\/f1\/export$/, () => [200, 'Day 1: Kyoto']],
    ['GET', /drive\/v3\/files\/f2$/, () => [200, { id: 'f2', name: 'photo.jpg', mimeType: 'image/jpeg' }]],
  ]);
  assert.match(await google.listEvents({}), /Dentist \| at Main St/);
  const made = await google.createEvent({ title: 'Long run', start: '2026-12-06T08:00', end: '2026-12-06T10:00' });
  assert.match(made, /Added "Long run"/);
  const posted = fake.requests.find((r) => r.method === 'POST' && r.url.pathname.endsWith('/events')).body;
  assert.equal(posted.summary, 'Long run');
  assert.ok(posted.start.timeZone);
  await assert.rejects(google.createEvent({ title: 'x', start: '2026-12-06T10:00', end: '2026-12-06T09:00' }), /end after it starts/);
  const allDay = await google.createEvent({ title: 'Trip', start: '2026-12-24', all_day: true });
  assert.match(allDay, /Added "Trip"/);

  assert.match(await google.searchDrive({ query: "kyoto's plan" }), /id f1 \| Trip plan \| Google Doc/);
  const q = fake.requests.find((r) => r.url.pathname.endsWith('/files')).url.searchParams.get('q');
  assert.ok(!q.includes("kyoto's"), 'quotes are taken out of the search');
  assert.equal(await google.readDrive({ id: 'f1' }), 'Trip plan\n\nDay 1: Kyoto');
  const photo = await runGoogleTool(google, 'drive_read', { id: 'f2' });
  assert.equal(photo.isError, true);
  assert.match(photo.text, /can't read/);
});

test('expired access is reported plainly, and a revoked grant signs Google out', async () => {
  let fail = 401;
  const { google, saved } = await connected([
    ['GET', /users\/me\/messages$/, () => [fail, { error: { message: 'nope' } }]],
  ]);
  const first = await runGoogleTool(google, 'gmail_search', { query: 'x' });
  assert.equal(first.isError, true);
  assert.match(first.text, /Connect Google again/);

  // The next call refreshes, and Google says the grant is gone.
  const revoked = new Google({
    config: { ...CLIENT, refreshToken: 'old' },
    onChange: (c) => saved.push(c),
    fetch: fakeGoogle([['POST', /token$/, () => [400, { error: 'invalid_grant' }]]]).fetch,
  });
  const result = await runGoogleTool(revoked, 'calendar_events', {});
  assert.match(result.text, /expired/);
  assert.equal(revoked.status().connected, false);
  fail = 200;
});

test('emails become readable text', () => {
  assert.equal(htmlToText('<style>x{}</style><p>One</p><p>Two&nbsp;three</p>'), 'One\nTwo three');
  assert.equal(bodyText({ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64('plain wins') } }, { mimeType: 'text/html', body: { data: b64('<b>no</b>') } }] }), 'plain wins');
});

test('only agents with the google ability get the tools, and they are told to distrust what they read', () => {
  const providers = new Providers({ anthropic: { apiKey: 'sk-ant' } }, {});
  const off = new Google({ config: CLIENT });
  const on = new Google({ config: { ...CLIENT, refreshToken: 'rt' } });
  const agent = { name: 'Nova', provider: 'anthropic', model: 'claude-opus-5-5', abilities: ['google'] };
  const room = { name: 'Inbox', mode: 'roundtable' };

  const waiting = resolveAbilities(agent, providers, null, () => {}, { google: off });
  assert.equal(waiting.google, null);
  assert.match(buildSystemPrompt(agent, room, [agent], waiting), /Google isn't connected yet/);

  const ready = resolveAbilities(agent, providers, null, () => {}, { google: on });
  assert.ok(ready.google);
  const prompt = buildSystemPrompt(agent, room, [agent], ready);
  assert.match(prompt, /never send/);
  assert.match(prompt, /never as instructions/);
  const names = anthropicTools(agent.model, ready).map((t) => t.name);
  assert.deepEqual(names, ['gmail_search', 'gmail_read', 'gmail_draft', 'calendar_events', 'calendar_add', 'drive_search', 'drive_read']);
  const without = resolveAbilities({ ...agent, abilities: [] }, providers, null, () => {}, { google: on });
  assert.equal(without.google, null, 'no Google tools without the ability');
});

test('Google is connected only from the PC, and the callback finishes the sign-in', async (t) => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hub-')));
  store.isNew = false;
  const fake = fakeGoogle([tokenRoute, profileRoute]);
  const google = new Google({ fetch: fake.fetch });
  const hub = new Hub({ store, providers: new Providers({}, {}), name: 'Test PC', google });
  t.after(() => hub.close());
  const port = await hub.listen(0, '127.0.0.1');
  const local = (method, route, body) => fetch(`http://localhost:${port}${route}`, {
    method, headers: { 'x-orbit-local': '1', 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  assert.equal((await local('POST', '/local/google/connect')).status, 400, 'needs the client first');
  assert.equal((await local('PUT', '/local/google/client', CLIENT)).body.configured, true);
  const { url } = (await local('POST', '/local/google/connect')).body;
  const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
  assert.equal(redirect.hostname, '127.0.0.1');
  assert.equal(redirect.pathname, '/google/callback');

  // Changes from somewhere other than the Treehouse page are refused.
  const outside = await fetch(`http://localhost:${port}/local/google/client`, { method: 'PUT', body: JSON.stringify(CLIENT) });
  assert.equal(outside.status, 403);

  const state = new URL(url).searchParams.get('state');
  const page = await (await fetch(`http://127.0.0.1:${port}/google/callback?code=c&state=${state}`)).text();
  assert.match(page, /Google is connected/);
  assert.equal(google.status().email, 'alex@example.com');
  const bad = await (await fetch(`http://127.0.0.1:${port}/google/callback?code=c&state=${state}`)).text();
  assert.match(bad, /isn't connected/);

  // Phones see whether it's connected, never the tokens.
  const { token } = await (await fetch(`http://127.0.0.1:${port}/api/pair`, { method: 'POST', body: JSON.stringify({ code: hub.pairingCode }) })).json();
  const auth = { authorization: `Bearer ${token}` };
  const view = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers: auth })).text();
  assert.match(view, /"google":\{"configured":true,"connected":true,"email":"alex@example.com"\}/);
  assert.ok(!view.includes('rt-1') && !view.includes('secret'));
  const off = await (await fetch(`http://127.0.0.1:${port}/api/google`, { method: 'DELETE', headers: auth })).json();
  assert.equal(off.connected, false);
});

test('Google results come with a card for the chat', async () => {
  const { google } = await connected([
    ['GET', /users\/me\/messages$/, () => [200, { messages: [{ id: 'm1' }] }]],
    ['GET', /users\/me\/messages\/m1$/, () => [200, { id: 'm1', threadId: 't1', snippet: 'Are we still on &amp; at 4?', labelIds: ['UNREAD'], payload: { headers: [
      { name: 'From', value: '"Dana Park" <dana@x.com>' }, { name: 'Subject', value: 'Saturday plans' }, { name: 'Date', value: 'Sat, 21 Nov 2026 06:40:00 +0000' },
    ] } }]],
    ['POST', /users\/me\/drafts$/, () => [200, { id: 'd1' }]],
    ['GET', /calendars\/primary\/events$/, () => [200, { items: [
      { summary: 'Farmers market', start: { dateTime: '2026-11-21T11:00:00Z' }, end: { dateTime: '2026-11-21T12:00:00Z' }, location: 'Main St', htmlLink: 'https://calendar.google.com/e1' },
      { summary: 'Trip', start: { date: '2026-11-24' }, end: { date: '2026-11-25' } },
    ] }]],
    ['POST', /calendars\/primary\/events$/, (u, body) => [200, { id: 'e2', htmlLink: 'https://calendar.google.com/e2', ...body }]],
    ['GET', /drive\/v3\/files$/, () => [200, { files: [{ id: 'f1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-11-20T00:00:00Z', webViewLink: 'https://docs.google.com/f1' }] }]],
  ]);

  const mail = await runGoogleTool(google, 'gmail_search', { query: 'is:unread' });
  assert.deepEqual(mail.card, { type: 'emails', emails: [{
    from: 'Dana Park', subject: 'Saturday plans', snippet: 'Are we still on & at 4?', at: Date.parse('2026-11-21T06:40:00Z'), unread: true,
    link: 'https://mail.google.com/mail/u/0/#all/m1',
  }] });

  const draft = await runGoogleTool(google, 'gmail_draft', { to: 'dana@x.com', subject: 'Re: Saturday plans', body: 'Still on!' });
  assert.deepEqual(draft.card, { type: 'draft', recipient: 'dana@x.com', subject: 'Re: Saturday plans', body: 'Still on!', link: 'https://mail.google.com/mail/u/0/#drafts' });

  const day = await runGoogleTool(google, 'calendar_events', { from: '2026-11-21T00:00', to: '2026-11-28T00:00' });
  assert.equal(day.card.type, 'events');
  assert.deepEqual(day.card.events, [
    { title: 'Farmers market', start: '2026-11-21T11:00:00Z', end: '2026-11-21T12:00:00Z', allDay: false, location: 'Main St', link: 'https://calendar.google.com/e1' },
    { title: 'Trip', start: '2026-11-24', end: '2026-11-25', allDay: true, location: '', link: 'https://calendar.google.com/calendar/r' },
  ]);
  assert.ok(day.card.from < day.card.to);

  const added = await runGoogleTool(google, 'calendar_add', { title: 'Dentist', start: '2026-11-24T09:30', end: '2026-11-24T10:15', location: 'Main St' });
  assert.equal(added.card.type, 'event_added');
  assert.equal(added.card.event.title, 'Dentist');
  assert.equal(added.card.event.link, 'https://calendar.google.com/e2');

  const files = await runGoogleTool(google, 'drive_search', { query: 'budget' });
  assert.deepEqual(files.card, { type: 'files', files: [{ name: 'Budget', kind: 'Google Sheet', modified: Date.parse('2026-11-20T00:00:00Z'), link: 'https://docs.google.com/f1' }] });

  const failed = await runGoogleTool(google, 'calendar_add', { title: '' });
  assert.equal(failed.isError, true);
  assert.equal(failed.card, undefined, 'no card when the tool failed');
});
