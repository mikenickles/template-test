import { setDemoConnections } from './connections.ts';
import { setProviderOverride } from './providers/index.ts';
import { createMock } from './providers/mock.ts';
import type { MockStep } from './providers/mock.ts';
import type { Msg, ToolResult } from './providers/types.ts';
import { setSecret } from './secrets.ts';
import { getSettings, updateSettings } from './settings.ts';

/**
 * Demo mode: a scripted stand-in for the model and pretend Google, Spotify and
 * Stripe accounts, so the whole experience (including approval cards) can be
 * tried, tested and screenshotted without any keys. Nothing leaves the computer.
 */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const header = (name: string, value: string) => ({ name, value });
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

const MAIL = [
  {
    id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Could we move Thursday to 3pm? The venue walkthrough is running long.',
    from: 'Priya Raman <priya@studio-north.example>', subject: 'Thursday planning session',
    body: 'Hi,\n\nCould we move Thursday to 3pm? The venue walkthrough is running long and I would rather not rush it.\n\nThanks,\nPriya',
  },
  {
    id: 'm2', threadId: 't2', labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Your order has shipped and should arrive Saturday.',
    from: 'Field Notes Shop <orders@fieldnotes.example>', subject: 'Your order is on its way',
    body: 'Good news: your order of 2 notebooks has shipped and should arrive Saturday.',
  },
  {
    id: 'm3', threadId: 't3', labelIds: ['INBOX'],
    snippet: 'Dinner Friday? I found a place near the river that takes bookings.',
    from: 'Sam Okafor <sam.okafor@mail.example>', subject: 'Friday?',
    body: 'Dinner Friday? I found a place near the river that takes bookings. 7:30 work?\n\nSam',
  },
];

const gmailMessage = (m: (typeof MAIL)[number]) => ({
  id: m.id, threadId: m.threadId, labelIds: m.labelIds, snippet: m.snippet,
  payload: {
    mimeType: 'text/plain',
    headers: [header('From', m.from), header('To', 'you@example.com'), header('Subject', m.subject),
      header('Date', new Date().toUTCString()), header('Message-ID', `<${m.id}@mail.example>`)],
    body: { data: b64(m.body) },
  },
});

const EVENTS = () => [
  { id: 'e1', summary: 'Stand-up', start: { dateTime: `${today()}T09:30:00` }, end: { dateTime: `${today()}T09:45:00` } },
  { id: 'e2', summary: 'Lunch with Dana', location: 'Cafe Lumen', start: { dateTime: `${today()}T12:30:00` }, end: { dateTime: `${today()}T13:30:00` } },
  { id: 'e3', summary: 'Dentist', location: '14 Alder Street', start: { dateTime: `${today()}T16:00:00` }, end: { dateTime: `${today()}T16:45:00` } },
];

const TRACKS = [
  { id: 'tr1', name: 'Weightless', uri: 'spotify:track:6kkwzB6hXLIONkEk9JciA6', artists: [{ name: 'Marconi Union' }], album: { name: 'Weightless' } },
  { id: 'tr2', name: 'Opus', uri: 'spotify:track:3v2oAQomhOcYCPPHafS3KV', artists: [{ name: 'Ryuichi Sakamoto' }], album: { name: 'BTTB' } },
];

/** A pretend network. Records what it was asked so tests can check the requests. */
export function fakeFetch(log: { method: string; url: string; body?: string }[] = []): typeof fetch {
  const ok = (data: unknown, status = 200) =>
    new Response(status === 204 ? null : typeof data === 'string' ? data : JSON.stringify(data), {
      status, headers: { 'content-type': typeof data === 'string' ? 'text/plain' : 'application/json' },
    });
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    log.push({ method, url: url.href, body: typeof init?.body === 'string' ? init.body : init?.body?.toString() });
    const p = url.pathname;

    if (url.host === 'gmail.googleapis.com') {
      if (p.endsWith('/profile')) return ok({ emailAddress: 'you@example.com' });
      if (p.endsWith('/messages') && method === 'GET') {
        const unread = (url.searchParams.get('q') ?? '').includes('is:unread');
        return ok({ messages: MAIL.filter((m) => !unread || m.labelIds.includes('UNREAD')).map((m) => ({ id: m.id })) });
      }
      const one = /\/messages\/(m\d)$/.exec(p);
      if (one && method === 'GET') return ok(gmailMessage(MAIL.find((m) => m.id === one[1]) ?? MAIL[0]!));
      if (p.endsWith('/messages/send')) return ok({ id: 'sent1', threadId: 't1' });
      if (p.endsWith('/drafts')) return ok({ id: 'draft1' });
      if (p.endsWith('/batchModify')) return ok('', 204);
      if (p.endsWith('/trash')) return ok({ id: 'x' });
      const thread = /\/threads\/(t\d)$/.exec(p);
      if (thread) return ok({ messages: MAIL.filter((m) => m.threadId === thread[1]).map(gmailMessage) });
    }
    if (url.host === 'www.googleapis.com' && p.startsWith('/calendar/')) {
      if (p.endsWith('/freeBusy')) return ok({ calendars: { primary: { busy: EVENTS().map((e) => ({ start: e.start.dateTime, end: e.end.dateTime })) } } });
      if (p.endsWith('/events') && method === 'GET') return ok({ items: EVENTS() });
      if (method === 'DELETE') return ok('', 204);
      const sent = init?.body ? JSON.parse(String(init.body)) : {};
      return ok({ id: 'e9', htmlLink: 'https://calendar.google.com/event?eid=demo', ...sent });
    }
    if (url.host === 'www.googleapis.com' && (p.startsWith('/drive/') || p.startsWith('/upload/drive/'))) {
      if (p.startsWith('/upload/')) return ok({ id: 'f9', name: 'New doc', webViewLink: 'https://docs.google.com/document/d/f9' });
      if (p.endsWith('/files')) {
        return ok({ files: [{ id: 'f1', name: 'Trip plan: Lisbon', mimeType: 'application/vnd.google-apps.document', modifiedTime: new Date().toISOString(), webViewLink: 'https://docs.google.com/document/d/f1', owners: [{ displayName: 'You' }] }] });
      }
      if (p.endsWith('/export') || url.searchParams.get('alt') === 'media') return ok('Lisbon, 4 nights. Flights booked. Still to do: hotel near Alfama, dinner at Ramiro.');
      return ok({ id: 'f1', name: 'Trip plan: Lisbon', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/f1' });
    }
    if (url.host === 'api.spotify.com') {
      if (p === '/v1/me') return ok({ display_name: 'Demo' });
      if (p === '/v1/search') return ok({ tracks: { items: TRACKS } });
      if (p === '/v1/me/player' && method === 'GET') return ok({ is_playing: true, item: TRACKS[0], device: { name: 'Living room', volume_percent: 40 } });
      if (p === '/v1/me/player/devices') return ok({ devices: [{ id: 'd1', name: 'Living room', type: 'Speaker', is_active: true }] });
      if (p === '/v1/me/playlists' && method === 'GET') return ok({ items: [{ id: 'p1', name: 'Focus', uri: 'spotify:playlist:p1', owner: { display_name: 'Demo' } }] });
      if (p === '/v1/me/playlists') return ok({ id: 'p9', external_urls: { spotify: 'https://open.spotify.com/playlist/p9' } });
      if (/\/playlists\/\w+\/items$/.test(p)) return ok({ snapshot_id: 's' });
      return ok('', 204);
    }
    if (url.host === 'api.stripe.com') {
      if (p === '/v1/balance') return ok({ available: [{ amount: 184250, currency: 'usd' }], pending: [{ amount: 32000, currency: 'usd' }] });
      if (p === '/v1/payment_intents') return ok({ data: [{ id: 'pi_demo1', amount: 12000, currency: 'usd', status: 'succeeded', description: 'Workshop ticket', created: Math.floor(Date.now() / 1000) - 86400 }] });
      if (p === '/v1/prices') return ok({ id: 'price_demo' });
      if (p === '/v1/payment_links') return ok({ url: 'https://buy.stripe.com/test_demo' });
      if (p === '/v1/refunds') return ok({ id: 're_demo', status: 'succeeded' });
      if (p === '/v1/issuing/cardholders') return ok({ data: [{ id: 'ich_demo' }] });
      if (p === '/v1/issuing/cards') return ok({ id: 'ic_demo', last4: '4242' });
      if (p.startsWith('/v1/issuing/cards/')) {
        return ok({ id: 'ic_demo', status: method === 'POST' ? 'canceled' : 'active', number: '4000009990000021', cvc: '123', exp_month: 12, exp_year: 2029 });
      }
    }
    if (url.host === 'oauth2.googleapis.com' || url.host === 'accounts.spotify.com') return ok({ access_token: 'demo', expires_in: 3600 });
    return ok({ error: { message: `demo network has no answer for ${method} ${url.href}` } }, 404);
  };
}

/** Pull the JSON back out of a tool result (untrusted results arrive wrapped in a tag). */
function payload(results: ToolResult[] | undefined, name: string): any {
  const hit = results?.find((r) => r.name === name);
  if (!hit) return null;
  const text = hit.output.replace(/^<untrusted_content[^>]*>\n?/, '').replace(/\n?<\/untrusted_content>$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

const lastUser = (history: Msg[]) => {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role === 'user') return m.text.replace(/^\[[^\]]*\]\n/, '').toLowerCase();
  }
  return '';
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** What the pretend model does. Enough to show every kind of moment in the interface. */
function script({ history, results, step }: { history: Msg[]; results: ToolResult[] | undefined; step: number }): MockStep {
  const said = lastUser(history);
  const name = getSettings().userName || 'there';

  if (results?.length) {
    const r = results[0]!;
    if (r.output.startsWith('The user declined')) return { text: 'No problem, I\'ve left it. Want me to change anything, or drop it?' };
    if (r.output.startsWith('This is waiting')) return { text: 'That\'s waiting for your OK. It\'ll go as soon as you approve it.' };
    if (r.isError) return { text: `That didn't work: ${r.output.replace(/^That did not work: /, '')}` };

    const events = payload(results, 'calendar_list')?.events;
    const mail = payload(results, 'gmail_search')?.messages;
    if (events && mail) {
      return {
        text:
          `Morning, ${name}. Three things today:\n\n` +
          events.map((e: any) => `- **${clock(e.start)}** ${e.title}${e.location ? ` at ${e.location}` : ''}`).join('\n') +
          `\n\nTwo unread emails. The one that needs you: **Priya** wants to move Thursday's planning session to 3pm. ` +
          `You're free then. Want me to say yes?`,
      };
    }
    if (events) {
      return { text: `You've got three things today:\n\n${events.map((e: any) => `- **${clock(e.start)}** ${e.title}${e.location ? ` at ${e.location}` : ''}`).join('\n')}\n\nThe afternoon is clear until the dentist at 4.` };
    }
    if (mail) {
      return { text: `Two unread. **Priya** is asking to move Thursday's planning session to 3pm, and your notebook order has shipped (arriving Saturday). Sam also asked about dinner on Friday.\n\nWant me to reply to Priya?` };
    }
    if (r.name === 'gmail_send') return { text: 'Sent. I told Priya 3pm on Thursday works.' };
    if (r.name === 'spotify_search') {
      const track = payload(results, 'spotify_search')?.results?.[0];
      return { toolCalls: [{ name: 'spotify_play', input: { uri: track?.uri } }] };
    }
    if (r.name === 'spotify_play') return { text: 'Playing *Weightless* by Marconi Union in the living room. Say the word if you want it quieter.' };
    if (r.name === 'remember') return { text: 'Got it. I\'ll remember that.' };
    if (r.name === 'routine_create') return { text: 'Done. I\'ll have a short brief ready at 7:30 each weekday: your day, plus any email that actually needs you.' };
    if (r.name === 'wallet_pay') return { text: 'Approved. The one-time card is ready under **Wallet** in the menu. It only works for this purchase.' };
    if (r.name === 'drive_search') return { text: 'Found it: **Trip plan: Lisbon**. Flights are booked; still open are the hotel near Alfama and dinner at Ramiro.' };
    return { text: 'Done.' };
  }

  if (step > 0) return { text: 'Done.' };
  if (/\b(brief|morning)\b/.test(said) && !/every|each|weekday/.test(said)) {
    return { toolCalls: [
      { name: 'calendar_list', input: { from: today(), to: today() } },
      { name: 'gmail_search', input: { query: 'is:unread in:inbox', max: 5 } },
    ] };
  }
  if (/every|each morning|weekday|routine/.test(said)) {
    return { text: 'On it.', toolCalls: [{ name: 'routine_create', input: {
      title: 'Morning brief', time: '07:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      instructions: 'Give a short morning brief: today\'s calendar, then any unread email that needs a reply. Skip newsletters and receipts.',
    } }] };
  }
  if (/reply|tell priya|say yes|yes please|send/.test(said)) {
    return { text: 'Here\'s what I\'d send:', toolCalls: [{ name: 'gmail_send', input: {
      to: ['priya@studio-north.example'], subject: '', reply_to_message_id: 'm1',
      body: `Hi Priya,\n\n3pm on Thursday works well. See you then.\n\n${name === 'there' ? 'Thanks' : name}`,
    } }] };
  }
  if (/calendar|today|schedule|my day/.test(said)) return { toolCalls: [{ name: 'calendar_list', input: { from: today(), to: today() } }] };
  if (/mail|inbox|unread/.test(said)) return { toolCalls: [{ name: 'gmail_search', input: { query: 'is:unread in:inbox', max: 5 } }] };
  if (/play|music|song|calm|focus/.test(said)) return { toolCalls: [{ name: 'spotify_search', input: { query: 'calm ambient', type: 'track', limit: 2 } }] };
  if (/remember|i prefer|i like/.test(said)) {
    return { toolCalls: [{ name: 'remember', input: { text: said.replace(/^(please\s+)?remember( that)?\s*/, '').replace(/^./, (c) => c.toUpperCase()) || 'A preference', category: 'preference' } }] };
  }
  if (/buy|pay|order|purchase/.test(said)) {
    return { text: 'I can set that up.', toolCalls: [{ name: 'wallet_pay', input: {
      amount: 24, merchant: 'Field Notes Shop', merchant_url: 'https://fieldnotes.example/checkout',
      reason: 'Two more pocket notebooks, same as your last order.',
    } }] };
  }
  if (/lisbon|trip|doc|drive|file/.test(said)) return { toolCalls: [{ name: 'drive_search', input: { query: 'Lisbon' } }] };
  if (/^(hi|hey|hello)\b/.test(said)) return { text: `Hey ${name}. What's on your mind?` };
  return {
    text: 'This is demo mode, so I\'m working from a script and pretend accounts. Try asking about your day, your inbox, some music, or tell me to remember something.',
  };
}

export function startDemo(): typeof fetch {
  setDemoConnections(true);
  setProviderOverride(createMock(script, { wordDelayMs: Number(process.env.ARLO_DEMO_DELAY ?? 28) }));
  const far = Date.now() + 365 * 24 * 3600_000;
  for (const service of ['google', 'spotify']) {
    setSecret(`${service}.tokens`, JSON.stringify({ access_token: 'demo', refresh_token: 'demo', expires_at: far, account: 'Demo' }));
  }
  setSecret('stripe.key', 'rk_test_demo');
  updateSettings({ wallet: { ...getSettings().wallet, enabled: true } });
  return fakeFetch();
}
