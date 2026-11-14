import fs from 'node:fs';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import QRCode from 'qrcode';
import { notificationsAfter, latestNotificationId, recentActivity } from './agent/activity.ts';
import { approvalView, decide, declineAllPending, listApprovals } from './agent/approvals.ts';
import { liveTurn, runTurn, stopAllTurns, stopTurn } from './agent/loop.ts';
import { addMemory, clearMemories, deleteMemory, listMemories } from './agent/memory.ts';
import { deleteRoutine, listRoutines, routineView } from './agent/schedule.ts';
import { freshStart, recentVisible } from './agent/thread.ts';
import { COOKIE, completePairing, identify, listDevices, revokeAllDevices, revokeDevice, sameOrigin, startPairing } from './auth.ts';
import type { Who } from './auth.ts';
import { DEMO, lanAddresses, ROOT, WEB_DIR } from './config.ts';
import { isConnected } from './connections.ts';
import { emit, subscribe } from './events.ts';
import { deleteSecret, deleteSecretsWithPrefix, hasSecret, setSecret } from './secrets.ts';
import { getSettings, hasProviderKey, updateSettings } from './settings.ts';
import type { Settings } from './settings.ts';
import type { ProviderId } from './providers/types.ts';
import { runApproved } from './tools/execute.ts';
import { gmailAddress } from './tools/gmail.ts';
import { beginAuth, connectedAccount, disconnect, finishAuth, redirectUri } from './tools/oauth.ts';
import type { OAuthService } from './tools/oauth.ts';
import { spotifyName } from './tools/spotify.ts';
import { cancelPayment, checkStripeKey, linkCliPath, revealCard, walletStatus } from './tools/wallet.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

/** The only files served from node_modules. */
const VENDOR: Record<string, string> = {
  'marked.js': 'node_modules/marked/lib/marked.esm.js',
  'purify.js': 'node_modules/dompurify/dist/purify.es.mjs',
  'instrument-sans.woff2': 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
};

/** Nothing is ever loaded from another site, even if a reply tries to make the page do so. */
const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; " +
  "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  who: Who | null;
  body: Record<string, unknown>;
  params: string[];
}

/** public: anyone who can reach the hub. any: this computer or a paired phone. local: this computer only. */
type Access = 'public' | 'any' | 'local';
type Handler = (c: Ctx) => unknown | Promise<unknown>;

function headers(res: ServerResponse, type: string, extra: Record<string, string> = {}) {
  res.setHeader('content-type', type);
  res.setHeader('content-security-policy', CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}

function json(res: ServerResponse, status: number, data: unknown) {
  headers(res, 'application/json; charset=utf-8', { 'cache-control': 'no-store' });
  res.writeHead(status).end(JSON.stringify(data));
}

function sendFile(res: ServerResponse, file: string) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    headers(res, 'text/plain; charset=utf-8');
    res.writeHead(404).end('Not found');
    return;
  }
  headers(res, MIME[path.extname(file)] ?? 'application/octet-stream', { 'cache-control': 'no-cache' });
  res.writeHead(200);
  fs.createReadStream(file).pipe(res);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, 'That is too large.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  // Requiring JSON means a cross-site form post can never reach a handler.
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Could not read that request.');
  }
}

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');

export interface ServerHooks {
  port: number;
  /** Called when "allow my phone to connect" is switched, so the listener can be rebound. */
  onRemoteAccessChange: () => void;
  fetch: typeof fetch;
}

export function createHandler(hooks: ServerHooks) {
  const { port } = hooks;
  const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'gemini'];
  const routes: { method: string; pattern: RegExp; access: Access; handler: Handler }[] = [];
  const route = (method: string, pattern: RegExp, access: Access, handler: Handler) => routes.push({ method, pattern, access, handler });

  function state(who: Who) {
    const s = getSettings();
    return {
      agentName: s.agentName,
      userName: s.userName,
      persona: s.persona,
      onboarded: s.onboarded,
      paused: s.paused,
      demo: DEMO,
      seat: who.kind,
      providers: Object.fromEntries(PROVIDERS.map((id) => [id, { hasKey: hasProviderKey(id), model: s.models[id] }])),
      providerOrder: s.providerOrder,
      ready: DEMO || PROVIDERS.some(hasProviderKey),
      effort: s.effort,
      quietStart: s.quietStart,
      quietEnd: s.quietEnd,
      remoteAccess: s.remoteAccess,
      googleClientId: who.kind === 'local' ? s.googleClientId : '',
      spotifyClientId: who.kind === 'local' ? s.spotifyClientId : '',
      connections: {
        google: {
          connected: isConnected('google'), account: DEMO ? 'demo@example.com' : connectedAccount('google'),
          configured: !!s.googleClientId && hasSecret('google.clientSecret'), redirect: redirectUri('google', port),
        },
        spotify: {
          connected: isConnected('spotify'), account: DEMO ? 'Demo' : connectedAccount('spotify'),
          configured: !!s.spotifyClientId, redirect: redirectUri('spotify', port),
        },
        stripe: { connected: isConnected('stripe') },
      },
      wallet: { enabled: s.wallet.enabled, perPurchase: s.wallet.perPurchase, perDay: s.wallet.perDay, currency: s.wallet.currency, linkInstalled: !!linkCliPath() },
    };
  }

  // ----- Conversation -----
  route('GET', /^\/api\/state$/, 'any', (c) => state(c.who!));
  route('GET', /^\/api\/thread$/, 'any', () => ({
    messages: recentVisible('main'),
    approvals: listApprovals().map(approvalView),
    live: liveTurn('main'),
  }));
  route('POST', /^\/api\/chat$/, 'any', (c) => {
    const text = str(c.body.text, 20000).trim();
    if (!text) throw new HttpError(400, 'Say something first.');
    void runTurn({ thread: 'main', text, interactive: true });
    return { ok: true };
  });
  route('POST', /^\/api\/stop$/, 'any', () => ({ stopped: stopTurn('main') }));
  route('POST', /^\/api\/fresh-start$/, 'any', () => {
    freshStart('main');
    return { ok: true };
  });

  // The kill switch works from anywhere, including the phone.
  route('POST', /^\/api\/pause$/, 'any', (c) => {
    const paused = c.body.paused === true;
    updateSettings({ paused });
    if (paused) {
      stopAllTurns();
      declineAllPending();
    }
    emit({ type: 'state' });
    return { paused };
  });

  route('POST', /^\/api\/approvals\/([\w-]+)$/, 'any', async (c) => {
    const decision = c.body.decision === 'approve' ? 'approve' : 'decline';
    const approval = await decide(c.params[0]!, decision, runApproved);
    if (!approval) throw new HttpError(404, 'That request is gone.');
    return approvalView(approval);
  });

  // ----- Memory, routines, activity -----
  route('GET', /^\/api\/memory$/, 'any', () => ({ memories: listMemories() }));
  route('POST', /^\/api\/memory$/, 'any', (c) => {
    const text = str(c.body.text, 500).trim();
    if (text.length < 3) throw new HttpError(400, 'Write a little more.');
    return addMemory(text, 'fact', 'you');
  });
  route('DELETE', /^\/api\/memory\/(\d+)$/, 'any', (c) => ({ deleted: deleteMemory(Number(c.params[0])) }));
  route('DELETE', /^\/api\/memory$/, 'local', () => {
    clearMemories();
    return { ok: true };
  });
  route('GET', /^\/api\/export$/, 'local', (c) => {
    const s = getSettings();
    c.res.setHeader('content-disposition', 'attachment; filename="arlo-export.json"');
    return { exported: new Date().toISOString(), agentName: s.agentName, persona: s.persona, memories: listMemories(), routines: listRoutines().map(routineView) };
  });
  route('GET', /^\/api\/routines$/, 'any', () => ({ routines: listRoutines().map(routineView) }));
  route('DELETE', /^\/api\/routines\/(\d+)$/, 'any', (c) => ({ deleted: deleteRoutine(Number(c.params[0])) }));
  route('GET', /^\/api\/activity$/, 'any', () => ({ activity: recentActivity() }));
  route('GET', /^\/api\/notifications$/, 'any', (c) => {
    const after = Number(c.url.searchParams.get('after') ?? -1);
    // A first call (no cursor) just learns where "now" is, so old news is not replayed.
    return after < 0 ? { items: [], latest: latestNotificationId() } : { items: notificationsAfter(after), latest: latestNotificationId() };
  });

  // ----- Settings -----
  // Everyday preferences can be changed from the phone. Keys, limits, account
  // connections and devices can only be changed at the computer.
  route('POST', /^\/api\/settings$/, 'any', (c) => {
    const b = c.body;
    const local = c.who!.kind === 'local';
    const patch: Partial<Settings> = {};
    if (typeof b.agentName === 'string' && b.agentName.trim()) patch.agentName = b.agentName.trim().slice(0, 24);
    if (typeof b.userName === 'string') patch.userName = b.userName.trim().slice(0, 40);
    if (typeof b.persona === 'string') patch.persona = b.persona.slice(0, 3000);
    if (typeof b.onboarded === 'boolean') patch.onboarded = b.onboarded;
    if (typeof b.quietStart === 'string' && /^\d{2}:\d{2}$/.test(b.quietStart)) patch.quietStart = b.quietStart;
    if (typeof b.quietEnd === 'string' && /^\d{2}:\d{2}$/.test(b.quietEnd)) patch.quietEnd = b.quietEnd;
    if (b.effort === 'low' || b.effort === 'medium' || b.effort === 'high') patch.effort = b.effort;

    const sensitive = ['keys', 'models', 'providerOrder', 'remoteAccess', 'wallet', 'googleClientId', 'googleClientSecret', 'spotifyClientId'];
    if (!local && sensitive.some((k) => k in b)) throw new HttpError(403, 'That can only be changed on your computer.');

    if (b.models && typeof b.models === 'object') {
      const models = { ...getSettings().models };
      for (const id of PROVIDERS) {
        const value = (b.models as Record<string, unknown>)[id];
        if (typeof value === 'string' && value.trim()) models[id] = value.trim().slice(0, 80);
      }
      patch.models = models;
    }
    if (Array.isArray(b.providerOrder)) {
      const order = b.providerOrder.filter((x): x is ProviderId => PROVIDERS.includes(x as ProviderId));
      patch.providerOrder = [...new Set([...order, ...PROVIDERS])];
    }
    if (b.keys && typeof b.keys === 'object') {
      for (const id of PROVIDERS) {
        const value = (b.keys as Record<string, unknown>)[id];
        if (typeof value !== 'string') continue;
        if (value.trim()) setSecret(`key.${id}`, value.trim());
        else deleteSecret(`key.${id}`);
      }
    }
    if (typeof b.googleClientId === 'string') patch.googleClientId = b.googleClientId.trim();
    if (typeof b.googleClientSecret === 'string' && b.googleClientSecret.trim()) setSecret('google.clientSecret', b.googleClientSecret.trim());
    if (typeof b.spotifyClientId === 'string') patch.spotifyClientId = b.spotifyClientId.trim();
    if (b.wallet && typeof b.wallet === 'object') {
      const w = b.wallet as Record<string, unknown>;
      const current = getSettings().wallet;
      const cents = (v: unknown, fallback: number) => (typeof v === 'number' && v >= 0 && v <= 10_000_000 ? Math.round(v) : fallback);
      patch.wallet = {
        enabled: typeof w.enabled === 'boolean' ? w.enabled : current.enabled,
        perPurchase: cents(w.perPurchase, current.perPurchase),
        perDay: cents(w.perDay, current.perDay),
        currency: typeof w.currency === 'string' && /^[a-z]{3}$/i.test(w.currency) ? w.currency.toLowerCase() : current.currency,
      };
    }
    const remoteChanged = typeof b.remoteAccess === 'boolean' && b.remoteAccess !== getSettings().remoteAccess;
    if (typeof b.remoteAccess === 'boolean') patch.remoteAccess = b.remoteAccess;

    updateSettings(patch);
    emit({ type: 'state' });
    if (remoteChanged) setTimeout(hooks.onRemoteAccessChange, 150);
    return state(c.who!);
  });

  // ----- Connections (computer only) -----
  const whoAmI: Record<OAuthService, (token: string) => Promise<string | undefined>> = {
    google: (token) => gmailAddress(token, hooks.fetch),
    spotify: (token) => spotifyName(token, hooks.fetch),
  };
  route('POST', /^\/api\/connect\/(google|spotify)$/, 'local', (c) => ({ url: beginAuth(c.params[0] as OAuthService, port) }));
  route('DELETE', /^\/api\/connect\/(google|spotify)$/, 'local', async (c) => {
    await disconnect(c.params[0] as OAuthService, hooks.fetch);
    emit({ type: 'state' });
    return { ok: true };
  });
  route('GET', /^\/oauth\/(google|spotify)\/callback$/, 'local', async (c) => {
    const service = c.params[0] as OAuthService;
    let message = 'Connected. You can close this tab.';
    try {
      await finishAuth(service, c.url.searchParams, hooks.fetch, whoAmI[service]);
    } catch (err) {
      message = `That didn't work: ${err instanceof Error ? err.message : 'unknown error'}`;
    }
    emit({ type: 'state' });
    c.res.statusCode = 302;
    c.res.setHeader('location', `/?notice=${encodeURIComponent(message)}`);
    c.res.end();
    return undefined;
  });
  route('POST', /^\/api\/connect\/stripe$/, 'local', async (c) => {
    const key = str(c.body.key, 300).trim();
    if (!/^(rk|sk)_(live|test)_/.test(key)) throw new HttpError(400, 'That does not look like a Stripe key. Use a restricted key (it starts with rk_).');
    setSecret('stripe.key', key);
    try {
      await checkStripeKey(hooks.fetch);
    } catch (err) {
      deleteSecret('stripe.key');
      throw new HttpError(400, `Stripe did not accept that key: ${err instanceof Error ? err.message : ''}`);
    }
    emit({ type: 'state' });
    return { ok: true };
  });
  route('DELETE', /^\/api\/connect\/stripe$/, 'local', () => {
    deleteSecret('stripe.key');
    emit({ type: 'state' });
    return { ok: true };
  });

  // One button to take everything away from Arlo.
  route('POST', /^\/api\/disconnect-everything$/, 'local', async () => {
    await disconnect('google', hooks.fetch);
    await disconnect('spotify', hooks.fetch);
    deleteSecretsWithPrefix('stripe.');
    revokeAllDevices();
    updateSettings({ wallet: { ...getSettings().wallet, enabled: false } });
    emit({ type: 'state' });
    return { ok: true };
  });

  // ----- Wallet -----
  route('GET', /^\/api\/wallet$/, 'any', () => walletStatus());
  route('GET', /^\/api\/wallet\/(\d+)\/card$/, 'any', (c) => revealCard(Number(c.params[0]), hooks.fetch));
  route('DELETE', /^\/api\/wallet\/(\d+)$/, 'any', async (c) => {
    await cancelPayment(Number(c.params[0]), hooks.fetch);
    return { ok: true };
  });

  // ----- Phone pairing -----
  route('POST', /^\/api\/pair\/start$/, 'local', async () => {
    if (!getSettings().remoteAccess) throw new HttpError(400, 'Turn on "Let my phone connect" first.');
    const { code, expires } = startPairing();
    const addresses = lanAddresses().map((ip) => `http://${ip}:${port}`);
    const link = addresses[0] ? `${addresses[0]}/pair#${code}` : null;
    const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 440, color: { dark: '#1C1B19', light: '#FFFFFF' } }) : null;
    return { code, expires, addresses, link, qr };
  });
  route('POST', /^\/api\/pair\/complete$/, 'public', (c) => {
    const result = completePairing(str(c.body.code, 16), str(c.body.name, 40));
    if (!result) throw new HttpError(403, 'That code is wrong or has expired. Get a fresh one on your computer.');
    const secure = c.req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    c.res.setHeader('set-cookie', `${COOKIE}=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure}`);
    emit({ type: 'state' });
    return { ok: true };
  });
  route('GET', /^\/api\/devices$/, 'local', () => ({ devices: listDevices() }));
  route('DELETE', /^\/api\/devices\/(\w+)$/, 'local', (c) => ({ revoked: revokeDevice(c.params[0]!) }));

  function events(c: Ctx) {
    headers(c.res, 'text/event-stream; charset=utf-8', { 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    c.res.writeHead(200);
    c.res.write('retry: 2000\n\n');
    const off = subscribe((event) => c.res.write(`data: ${JSON.stringify(event)}\n\n`));
    const beat = setInterval(() => c.res.write(': beat\n\n'), 25_000);
    c.req.on('close', () => {
      off();
      clearInterval(beat);
    });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://hub');
      const who = identify(req, port);
      const pathname = url.pathname;

      // With phone access off, only this computer is answered at all.
      if (!who && !getSettings().remoteAccess) throw new HttpError(403, 'This Arlo only answers on its own computer.');
      if (!sameOrigin(req)) throw new HttpError(403, 'Cross-site requests are not allowed.');

      if (pathname === '/api/events' && req.method === 'GET') {
        if (!who) throw new HttpError(401, 'Not paired.');
        return events({ req, res, url, who, body: {}, params: [] });
      }

      for (const r of routes) {
        if (r.method !== req.method) continue;
        const match = r.pattern.exec(pathname);
        if (!match) continue;
        if (r.access !== 'public' && !who) throw new HttpError(401, 'Not paired.');
        if (r.access === 'local' && who?.kind !== 'local') throw new HttpError(403, 'That can only be done on your computer.');
        const body = await readBody(req);
        const result = await r.handler({ req, res, url, who, body, params: match.slice(1) });
        if (!res.writableEnded && result !== undefined) json(res, 200, result);
        return;
      }

      if (req.method !== 'GET') throw new HttpError(404, 'Not found.');
      if (pathname.startsWith('/vendor/')) {
        const file = VENDOR[pathname.slice(8)];
        if (!file) throw new HttpError(404, 'Not found.');
        return sendFile(res, path.join(ROOT, file));
      }
      if (pathname === '/pair') return sendFile(res, path.join(WEB_DIR, 'pair.html'));
      if (pathname === '/') {
        if (!who) {
          res.writeHead(302, { location: '/pair' }).end();
          return;
        }
        return sendFile(res, path.join(WEB_DIR, 'index.html'));
      }
      // Static files: resolved inside web/ only.
      const file = path.join(WEB_DIR, path.normalize(pathname));
      if (!file.startsWith(WEB_DIR + path.sep)) throw new HttpError(404, 'Not found.');
      return sendFile(res, file);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('Request failed:', err);
      json(res, status, { error: err instanceof HttpError || err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };
}

export function createServer(hooks: ServerHooks): http.Server {
  return http.createServer(createHandler(hooks));
}
