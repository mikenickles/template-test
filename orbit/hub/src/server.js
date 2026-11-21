import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { FileError, Files, MAX_FILE_BYTES } from './files.js';
import { FolderError, Folders } from './folders.js';
import { MemoryError, addNote, addProfileNote, cleanName, removeNote, removeProfileNote } from './memory.js';
import { GUIDE, INTRO_ROOM_NAME } from './intro.js';
import { UpdateError, Updates, openFolder } from './updates.js';
import { ScheduleError, Scheduler } from './schedules.js';
import { ABILITIES, Orchestrator } from './orchestrator.js';
import { ProviderError } from './errors.js';
import { PAIR_PAGE } from './pairpage.js';
import { canPickFolder, pickFolder } from './picker.js';
import { avatarFrom, migrateAvatars } from './characters.js';
import { Ledger } from './usage.js';
import { APP_POLICY, webAsset } from './web.js';
import { pairingLink, qrSvg } from './qr.js';

/** The hub's version: the app and the hub are released together, so this is the app's version too. */
export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const DISCOVERY_PROBE = 'ORBIT_DISCOVER';
const MAX_BODY = 1024 * 1024;
const MAX_PAIR_FAILURES = 5;
const PAIR_LOCK_MS = 60_000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * The desktop app signs in with a cookie, since browsers can't attach a header to live updates or
 * pictures. HttpOnly keeps it from scripts; SameSite=Strict keeps other sites from sending it.
 */
const COOKIE = 'orbit_token';
const signInCookie = (token) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=315360000`;
const cookieToken = (req) =>
  String(req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE)?.[1] ?? '';
const newPairingCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** How long the pairing page keeps saying "Paired with …" after a phone pairs. */
const JUST_PAIRED_MS = 60_000;

/**
 * The hub's HTTP API. Everything except /api/hub and /api/pair needs the
 * bearer token a phone receives when it pairs with the code shown on the PC.
 */
export class Hub {
  constructor({ store, providers, folders = new Folders(), prices = {}, name, onPairingCode = () => {}, updates = null, onRestart = null }) {
    this.store = store;
    // Updates saved in the updates folder; `onRestart` is how the hub restarts itself once one is installed.
    this.updates = updates ?? new Updates({
      dir: path.join(store.dir, 'updates'),
      hubDir: fileURLToPath(new URL('..', import.meta.url)),
      current: VERSION,
    });
    this.onRestart = onRestart;
    this.providers = providers;
    this.folders = folders;
    this.ledger = new Ledger(store, prices);
    this.files = new Files(store);
    this.files.sweep();
    this.name = name;
    this.onPairingCode = onPairingCode;
    this.subscribers = new Map(); // roomId -> Set<ServerResponse>
    this.watchers = new Set(); // phones following every room, to notify when replies land
    this.orchestrator = new Orchestrator({
      store, providers, folders, ledger: this.ledger, files: this.files, emit: (...args) => this.#emit(...args),
    });
    this.scheduler = new Scheduler({ store, orchestrator: this.orchestrator, log: (line) => console.log(line) });
    this.pairFailures = 0;
    this.pairLockedUntil = 0;
    this.pairingCode = newPairingCode();
    this.addresses = [];
    this.remoteAddresses = [];
    this.justPaired = null;
    this.server = http.createServer((req, res) => this.#handle(req, res));
    this.#seed();
    if (migrateAvatars(this.store.state.agents)) this.store.save();
    this.#letGuidesHire();
  }

  listen(port, host = '0.0.0.0') {
    this.scheduler.start();
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => resolve(this.server.address().port));
    });
  }

  /**
   * Where a phone can reach this hub (host:port): on the home network, best first, and through a
   * private VPN like Tailscale for when the phone is away from home.
   */
  setAddresses(addresses, remote = []) {
    this.addresses = addresses;
    this.remoteAddresses = remote;
  }

  /** What the pairing QR code holds: the hub's address and the current code. */
  pairingLink() {
    const host = this.addresses[0] ?? `localhost:${this.server.address()?.port ?? ''}`;
    return pairingLink({ host, code: this.pairingCode, name: this.name });
  }

  /** Answer LAN broadcasts from the app's "Find my hub" button. */
  startDiscovery(discoveryPort, httpPort) {
    this.discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.discovery.on('error', (err) => console.warn(`[orbit] LAN discovery unavailable: ${err.message}`));
    this.discovery.on('message', (msg, peer) => {
      if (msg.toString().trim() !== DISCOVERY_PROBE) return;
      const reply = JSON.stringify({ app: 'orbit-hub', name: this.name, port: httpPort });
      this.discovery.send(reply, peer.port, peer.address);
    });
    this.discovery.bind(discoveryPort);
  }

  close() {
    this.scheduler.stop();
    this.discovery?.close();
    for (const set of this.subscribers.values()) for (const res of set) res.end();
    for (const res of this.watchers) res.end();
    this.server.close();
    this.server.closeAllConnections?.();
    this.store.flush();
  }

  #rotatePairingCode() {
    this.pairingCode = newPairingCode();
    this.pairFailures = 0;
    this.onPairingCode(this.pairingCode);
  }

  /**
   * First run: with a Claude key, the guide opens a getting-to-know-you chat. Without one, the app asks
   * for a key first, and the intro starts once it has one.
   */
  #seed() {
    if (!this.store.isNew || this.store.state.agents.length) return;
    if (this.providers.isConfigured('anthropic') && this.providers.supportsAbilities?.('anthropic')) this.#startIntro();
  }

  /**
   * The getting-to-know-you chat: the agent asked for, else the first one on Claude, else a new guide.
   * Reuses the agent's intro room if it has one. Returns the room.
   */
  #startIntro(agentId = null) {
    const capable = (a) => a && this.providers.supportsAbilities(a.provider) && this.providers.isConfigured(a.provider);
    let guide = capable(this.store.agent(agentId)) ? this.store.agent(agentId) : this.store.state.agents.find(capable);
    if (!guide) {
      if (!this.providers.isConfigured('anthropic')) {
        throw new HttpError(400, 'Getting to know you needs Claude. Add an Anthropic key in Settings, under Model providers.');
      }
      guide = {
        id: crypto.randomUUID(), name: GUIDE.name, role: GUIDE.role, instructions: GUIDE.instructions,
        provider: 'anthropic', model: this.providers.list().find((p) => p.id === 'anthropic')?.models?.[0] ?? 'claude-opus-5-5',
        avatar: { character: GUIDE.character }, abilities: ['web', 'memory', 'crew'], createdAt: Date.now(),
      };
      // A guide named like an existing agent would confuse @mentions.
      if (this.store.state.agents.some((a) => a.name.toLowerCase() === guide.name.toLowerCase())) guide.name = 'Orbi';
      this.store.state.agents.push(guide);
    }
    const existing = this.store.state.rooms.find((r) => r.intro && r.agentIds.length === 1 && r.agentIds[0] === guide.id);
    if (existing) return existing;
    const now = Date.now();
    const room = { id: crypto.randomUUID(), name: INTRO_ROOM_NAME, agentIds: [guide.id], mode: 'roundtable', leadId: null, intro: true, createdAt: now, updatedAt: now };
    this.store.state.rooms.push(room);
    this.store.save();
    this.orchestrator.greet(room.id, guide.id);
    return room;
  }

  /** Guides from before hiring existed get the ability once; after that it is the user's switch. */
  #letGuidesHire() {
    const flags = (this.store.state.flags ??= {});
    if (flags.guidesHire) return;
    for (const room of this.store.state.rooms.filter((r) => r.intro)) {
      const guide = this.store.agent(room.agentIds[0]);
      if (guide && !(guide.abilities ?? []).includes('crew')) guide.abilities = [...(guide.abilities ?? []), 'crew'];
    }
    flags.guidesHire = true;
    this.store.save();
  }

  /** What the whole crew knows about the user. */
  #profile() {
    return (this.store.state.profile ??= { name: '', notes: [] });
  }

  #emit(roomId, event, data) {
    for (const res of this.subscribers.get(roomId) ?? []) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    if (event === 'run' && !data.active) this.scheduler?.finished(roomId);
    if (!this.watchers.size) return;
    // Watchers get the outline only: who is working where, and each finished reply.
    if (event === 'run') {
      this.#watch('run', this.#runView(roomId, data));
    } else if (event === 'message' && data.author?.type === 'agent' && data.status !== 'streaming') {
      this.#watch('reply', {
        roomId,
        room: this.store.room(roomId)?.name ?? '',
        id: data.id,
        author: data.author.name,
        text: data.text.replace(/\s+/g, ' ').trim().slice(0, 300),
        status: data.status,
        error: data.error ?? null,
      });
    }
  }

  #watch(event, data) {
    for (const res of this.watchers) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /** A room's run as watchers see it, with names so a notification can say who is replying where. */
  #runView(roomId, run = this.orchestrator.runState(roomId)) {
    return {
      roomId,
      room: this.store.room(roomId)?.name ?? '',
      active: run.active,
      agentId: run.agentId,
      agent: this.store.agent(run.agentId)?.name ?? null,
    };
  }

  #roomView(room) {
    const last = this.store.messages(room.id).findLast((m) => m.text);
    const run = this.orchestrator.runState(room.id);
    return {
      ...room,
      active: run.active,
      speaking: run.agentId,
      // Plain words for a one-line preview: no Markdown marks.
      preview: last ? { author: last.author.name, text: last.text.replace(/\*\*|~~|`+|^#+\s|^>\s?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 140) } : null,
    };
  }

  #authenticate(req) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken(req);
    const device = token && this.store.state.devices.find((d) => d.tokenHash === hashToken(token));
    if (!device) throw new HttpError(401, 'This phone is not paired with the hub.');
    device.lastSeenAt = Date.now();
    return device;
  }

  async #raw(req, limit, tooLarge) {
    if (Number(req.headers['content-length']) > limit) throw new HttpError(413, tooLarge);
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, tooLarge);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async #body(req) {
    const chunks = [await this.#raw(req, MAX_BODY, 'Request is too large.')].filter((b) => b.length);
    if (!chunks.length) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through
    }
    throw new HttpError(400, 'Body must be a JSON object.');
  }

  async #handle(req, res) {
    try {
      const url = new URL(req.url, 'http://hub');
      const result = await this.#route(req, res, url);
      if (result === undefined) return; // the route took over the response (SSE)
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[orbit] request failed:', err);
      if (res.headersSent) return res.end();
      // A refused upload may still be arriving; close the connection rather than read the rest of it.
      res.writeHead(status, { 'content-type': 'application/json', ...(status === 413 ? { connection: 'close' } : {}) });
      res.end(JSON.stringify({ error: status === 500 ? 'The hub hit an internal error.' : err.message }));
    }
  }

  async #route(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const key = `${req.method} /${parts.map((p, i) => (i === 2 && parts[0] === 'api' ? ':id' : p)).join('/')}`;
    const id = parts[2];

    if (key === 'GET /api/hub') return { app: 'orbit-hub', name: this.name, version: VERSION };
    if (key === 'POST /api/pair') {
      const fields = await this.#body(req);
      const paired = this.#pair(fields);
      // The desktop app on another computer signs in with a cookie rather than keeping the token.
      if (fields.web) res.setHeader('set-cookie', signInCookie(paired.token));
      return fields.web ? { hub: paired.hub } : paired;
    }

    // The desktop app itself: a fixed set of files, open to any browser that can reach the hub.
    // Using it still needs this PC (localhost) or a pairing code.
    if (req.method === 'GET' && url.pathname !== '/pair') {
      const asset = webAsset(url.pathname);
      if (asset) {
        res.writeHead(200, {
          'content-type': asset.type,
          'cache-control': /\.(ttf|png|webp)$/.test(url.pathname) ? 'public, max-age=86400' : 'no-cache',
          'content-security-policy': APP_POLICY,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        });
        res.end(asset.body);
        return undefined;
      }
    }

    // The hub's own page shows the live pairing code and shares folders, so only the PC itself may use it.
    if (url.pathname === '/pair' || url.pathname === '/pair.json') {
      this.#localOnly(req);
      if (url.pathname !== '/pair.json') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(PAIR_PAGE);
        return undefined;
      }
      const recent = this.justPaired && Date.now() - this.justPaired.at < JUST_PAIRED_MS;
      return {
        code: this.pairingCode,
        address: this.addresses[0] ?? `localhost:${this.server.address().port}`,
        svg: qrSvg(this.pairingLink()),
        justPaired: recent ? this.justPaired.name : null,
        folders: this.folders.list(),
        canPick: canPickFolder(),
      };
    }
    if (parts[0] === 'local') return this.#localRoute(req, res, parts);

    const device = this.#authenticate(req);
    switch (key) {
      case 'GET /api/state':
        await this.providers.checkLocal?.();
        return {
          hub: { name: this.name, version: VERSION, addresses: this.addresses, remote: this.remoteAddresses },
          agents: this.store.state.agents,
          rooms: this.store.state.rooms.map((r) => this.#roomView(r)),
          providers: this.providers.list(),
          updates: this.updates.status(),
          profile: this.#profile(),
          folders: this.folders.list(),
          schedules: this.scheduler.list(),
        };
      case 'GET /api/events':
        return this.#follow(req, res);
      case 'POST /api/files': {
        // A photo or file for a message: raw bytes, typed by Content-Type, named by X-File-Name.
        const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        let name = 'file';
        try {
          name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file'));
        } catch {
          // keep the default
        }
        const bytes = await this.#raw(req, MAX_FILE_BYTES, 'That file is too large. Attach files up to 20 MB.');
        try {
          return this.files.save(bytes, name, type);
        } catch (err) {
          if (err instanceof FileError) throw new HttpError(400, err.message);
          throw err;
        }
      }
      // Updates the user saved in the updates folder: phones fetch the app from here, and the PC installs its own.
      case 'GET /api/updates/:id': {
        const app = id === 'app' ? this.updates.appFile() : null;
        if (!app) throw new HttpError(404, 'There is no app update waiting on this PC.');
        res.writeHead(200, {
          'content-type': 'application/vnd.android.package-archive',
          'content-length': app.size,
          'content-disposition': `attachment; filename="${path.basename(app.file)}"`,
          'cache-control': 'no-store',
        });
        const stream = fs.createReadStream(app.file);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        return undefined;
      }
      case 'POST /api/updates/:id': {
        // Both only from this PC: it is where the update files were saved, and where Orbit restarts.
        this.#localOnly(req, true);
        if (id === 'open') {
          openFolder(this.updates.dir);
          return { ok: true };
        }
        if (id !== 'apply') throw new HttpError(404, 'Not found.');
        if (this.restarting) throw new HttpError(409, 'Orbit is already updating.');
        let installed;
        try {
          installed = this.updates.install();
        } catch (err) {
          if (err instanceof UpdateError) throw new HttpError(400, err.message);
          throw err;
        }
        this.restarting = true;
        // The answer reaches the page first; then the hub restarts on the new files.
        setTimeout(() => this.onRestart?.(installed.version), 400).unref();
        return { ok: true, version: installed.version };
      }
      case 'GET /api/files/:id': {
        const meta = this.files.meta(id);
        const bytes = meta && this.files.read(id);
        if (!bytes) throw new HttpError(404, 'That file is gone.');
        res.writeHead(200, { 'content-type': meta.type, 'content-length': bytes.length, 'cache-control': 'private, max-age=31536000, immutable' });
        res.end(bytes);
        return undefined;
      }
      // Scheduled messages: the hub posts them into their room at the set time, on the PC's clock.
      case 'GET /api/schedules':
        return { schedules: this.scheduler.list() };
      case 'POST /api/schedules':
        return this.#scheduling(async () => this.scheduler.create(await this.#body(req)));
      case 'PUT /api/schedules/:id':
        return this.#scheduling(async () => this.scheduler.update(id, await this.#body(req)));
      case 'DELETE /api/schedules/:id':
        this.scheduler.remove(id);
        return { ok: true };
      // Results of scheduled runs since a time, for a phone that was asleep.
      case 'GET /api/notices':
        return { notices: this.scheduler.noticesSince(Number(url.searchParams.get('since')) || 0), now: Date.now() };
      case 'GET /api/usage': {
        // Estimated spend and tokens, per agent and room, over the last N days.
        const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
        return this.ledger.summary(days);
      }
      case 'DELETE /api/device': {
        this.store.state.devices = this.store.state.devices.filter((d) => d.id !== device.id);
        this.store.save();
        res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        return { ok: true };
      }
      case 'GET /api/providers/:id/models':
        if (!this.providers.has(id)) throw new HttpError(404, 'Unknown provider.');
        return { models: await this.providers.models(id) };
      case 'PUT /api/providers/:id/key': {
        // Keys are checked with the provider before they're saved, so a typo never replaces a working key.
        if (!this.providers.takesKey(id)) throw new HttpError(404, "That provider doesn't use a key.");
        const apiKey = text((await this.#body(req)).apiKey, 500);
        if (!apiKey) throw new HttpError(400, 'Paste a key first.');
        const check = await this.providers.checkKey(id, apiKey);
        if (!check.ok) throw new HttpError(check.unreachable ? 502 : 400, check.message);
        this.providers.setKey(id, apiKey);
        return this.providers.list().find((p) => p.id === id);
      }
      case 'POST /api/providers/:id/pull': {
        // Downloads a model into a local runtime (Ollama). Progress shows on the provider in /api/state.
        if (!this.providers.has(id)) throw new HttpError(404, 'Unknown provider.');
        try {
          this.providers.pull(id, (await this.#body(req)).model);
        } catch (err) {
          if (err instanceof ProviderError) throw new HttpError(400, err.message);
          throw err;
        }
        return this.providers.list().find((p) => p.id === id);
      }
      case 'DELETE /api/providers/:id/pull':
        if (!this.providers.has(id)) throw new HttpError(404, 'Unknown provider.');
        this.providers.clearDownload(id);
        return this.providers.list().find((p) => p.id === id);
      case 'DELETE /api/providers/:id/key':
        if (!this.providers.takesKey(id)) throw new HttpError(404, "That provider doesn't use a key.");
        this.providers.removeKey(id);
        return this.providers.list().find((p) => p.id === id);

      // A phone can stop sharing a folder, but only the PC can share one.
      case 'DELETE /api/folders/:id':
        this.folders.remove(id);
        return { folders: this.folders.list() };

      case 'POST /api/agents': {
        const agent = { id: crypto.randomUUID(), createdAt: Date.now(), ...this.#agentFields(await this.#body(req)) };
        this.store.state.agents.push(agent);
        this.store.save();
        return agent;
      }
      case 'PUT /api/agents/:id': {
        const agent = this.store.agent(id);
        if (!agent) throw new HttpError(404, 'That agent no longer exists.');
        Object.assign(agent, this.#agentFields(await this.#body(req), agent));
        this.store.save();
        return agent;
      }
      // An agent's memory: notes added from the app. Agents add their own while replying.
      case 'POST /api/agents/:id/memory': {
        const agent = this.store.agent(id);
        if (!agent) throw new HttpError(404, 'That agent no longer exists.');
        try {
          addNote(agent, (await this.#body(req)).text, 'you');
        } catch (err) {
          if (err instanceof MemoryError) throw new HttpError(400, err.message);
          throw err;
        }
        this.store.save();
        return agent;
      }
      case 'DELETE /api/agents/:id': {
        this.store.state.agents = this.store.state.agents.filter((a) => a.id !== id);
        for (const room of this.store.state.rooms) {
          room.agentIds = room.agentIds.filter((a) => a !== id);
          if (room.leadId === id) room.leadId = room.agentIds[0] ?? null;
        }
        this.store.save();
        return { ok: true };
      }

      // The getting-to-know-you chat, started from the app.
      case 'POST /api/intro':
        return this.#roomView(this.#startIntro((await this.#body(req)).agentId ?? null));

      // What the whole crew knows about the user: their name, and notes added here or by agents.
      case 'PUT /api/profile': {
        const profile = this.#profile();
        profile.name = cleanName((await this.#body(req)).name);
        this.store.save();
        return profile;
      }

      case 'POST /api/rooms': {
        const now = Date.now();
        const room = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...this.#roomFields(await this.#body(req)) };
        this.store.state.rooms.push(room);
        this.store.save();
        return this.#roomView(room);
      }
      case 'PUT /api/rooms/:id': {
        const room = this.#requireRoom(id);
        Object.assign(room, this.#roomFields(await this.#body(req), room));
        this.store.save();
        return this.#roomView(room);
      }
      case 'DELETE /api/rooms/:id': {
        this.orchestrator.stop(id);
        this.scheduler.forgetRoom(id);
        this.store.state.rooms = this.store.state.rooms.filter((r) => r.id !== id);
        delete this.store.state.messages[id];
        this.store.save();
        this.files.sweep();
        return { ok: true };
      }
    }

    if (parts[0] === 'api' && parts[1] === 'profile' && parts[2] === 'notes') {
      const profile = this.#profile();
      if (req.method === 'POST' && parts.length === 3) {
        try {
          addProfileNote(profile, (await this.#body(req)).text, 'you');
        } catch (err) {
          if (err instanceof MemoryError) throw new HttpError(400, err.message);
          throw err;
        }
        this.store.save();
        return profile;
      }
      if (req.method === 'DELETE' && parts.length === 4) {
        removeProfileNote(profile, parts[3]);
        this.store.save();
        return profile;
      }
    }

    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'agents' && parts[3] === 'memory' && parts.length === 5) {
      const agent = this.store.agent(id);
      if (!agent) throw new HttpError(404, 'That agent no longer exists.');
      removeNote(agent, parts[4]);
      this.store.save();
      return agent;
    }

    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'schedules' && parts[3] === 'run' && parts.length === 4) {
      return this.#scheduling(async () => {
        this.scheduler.run(id);
        return { ok: true };
      });
    }

    // One message: delete it, or have its agent answer again.
    if (parts[0] === 'api' && parts[1] === 'rooms' && parts[3] === 'messages' && parts.length >= 5) {
      const room = this.#requireRoom(id);
      const message = this.store.messages(room.id).find((m) => m.id === parts[4]);
      if (!message) throw new HttpError(404, 'That message is already gone.');
      if (req.method === 'DELETE' && parts.length === 5) {
        if (message.status === 'streaming') throw new HttpError(409, 'Stop this reply before deleting it.');
        this.orchestrator.remove(room.id, message.id);
        this.files.sweep();
        return { ok: true };
      }
      if (req.method === 'POST' && parts.length === 6 && parts[5] === 'retry') {
        if (message.author.type !== 'agent') throw new HttpError(400, 'Only replies can be retried.');
        if (this.orchestrator.runState(room.id).active) throw new HttpError(409, 'Wait for the crew to finish, or stop them first.');
        const agent = this.store.agent(message.author.agentId);
        if (!agent || !room.agentIds.includes(agent.id)) throw new HttpError(400, `${message.author.name} isn't in this room anymore.`);
        this.orchestrator.remove(room.id, message.id);
        this.orchestrator.retry(room.id, agent.id);
        return { ok: true };
      }
    }

    if (parts[0] === 'api' && parts[1] === 'rooms' && parts.length === 4) {
      const room = this.#requireRoom(id);
      switch (`${req.method} ${parts[3]}`) {
        case 'GET messages':
          return { messages: this.store.messages(room.id), run: this.orchestrator.runState(room.id) };
        case 'POST messages': {
          const fields = await this.#body(req);
          const body = text(fields.text, 20000);
          const ids = Array.isArray(fields.attachments) ? [...new Set(fields.attachments)].slice(0, 10) : [];
          const attachments = ids.map((a) => this.files.meta(a)).filter(Boolean).map(({ id: fileId, name, type, size }) => ({ id: fileId, name, type, size }));
          if (attachments.length < ids.length) throw new HttpError(400, 'One of the attachments is gone. Attach it again.');
          if (!body && !attachments.length) throw new HttpError(400, 'Message is empty.');
          if (!room.agentIds.length) throw new HttpError(400, 'Add at least one agent to this room first.');
          return this.orchestrator.post(room.id, body, attachments);
        }
        case 'DELETE messages':
          this.orchestrator.stop(room.id);
          await this.orchestrator.idle(room.id);
          this.store.state.messages[room.id] = [];
          delete room.summary;
          this.store.save();
          this.files.sweep();
          this.#emit(room.id, 'cleared', {});
          return { ok: true };
        case 'POST stop':
          this.orchestrator.stop(room.id);
          return { ok: true };
        case 'GET events':
          return this.#subscribe(req, res, room.id);
      }
    }
    throw new HttpError(404, 'Not found.');
  }

  #pair(body) {
    if (Date.now() < this.pairLockedUntil) {
      throw new HttpError(429, 'Too many wrong codes. Wait a minute, then use the new code shown on your PC.');
    }
    const code = String(body.code ?? '').replace(/\D/g, '');
    const expected = this.pairingCode;
    const ok = code.length === expected.length && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected));
    if (!ok) {
      // A fresh code plus a pause after a few misses keeps a six-digit code from being guessed.
      if (++this.pairFailures >= MAX_PAIR_FAILURES) {
        this.pairLockedUntil = Date.now() + PAIR_LOCK_MS;
        this.#rotatePairingCode();
      }
      throw new HttpError(403, "That code didn't match. Check the one shown on your PC.");
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const deviceName = text(body.deviceName, 60) || 'Android phone';
    this.store.state.devices.push({
      id: crypto.randomUUID(),
      name: deviceName,
      tokenHash: hashToken(token),
      createdAt: Date.now(),
    });
    this.justPaired = { name: deviceName, at: Date.now() };
    this.store.save();
    this.#rotatePairingCode();
    return { token, hub: { name: this.name, version: VERSION } };
  }

  async #scheduling(work) {
    try {
      return await work();
    } catch (err) {
      if (err instanceof ScheduleError) throw new HttpError(400, err.message);
      throw err;
    }
  }

  #requireRoom(id) {
    const room = this.store.room(id);
    if (!room) throw new HttpError(404, 'That room no longer exists.');
    return room;
  }

  /**
   * Requests for the hub's own page: only from this PC, addressed to localhost (so a web page that
   * points its own domain at this PC can't read it), and, for changes, sent by the page itself.
   */
  #localOnly(req, change = false) {
    const host = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    if (!LOOPBACK.has(req.socket.remoteAddress) || !LOCAL_HOSTS.has(host)) {
      throw new HttpError(403, 'This page only opens on the PC running the hub, at http://localhost.');
    }
    if (change && req.headers['x-orbit-local'] !== '1') throw new HttpError(403, 'Use the Orbit page on this PC.');
  }

  async #localRoute(req, res, parts) {
    this.#localOnly(req, req.method !== 'GET');
    const route = `${req.method} /${parts.slice(1).join('/')}`;
    try {
      // The desktop app on this PC signs in without a code: whoever can use this PC already can.
      if (route === 'POST /token') {
        const token = crypto.randomBytes(32).toString('base64url');
        this.store.state.devices.push({ id: crypto.randomUUID(), name: 'This PC', local: true, tokenHash: hashToken(token), createdAt: Date.now() });
        this.store.save();
        res.setHeader('set-cookie', signInCookie(token));
        return { hub: { name: this.name, version: VERSION } };
      }
      if (route === 'GET /folders') return { folders: this.folders.list() };
      if (route === 'POST /folders') {
        this.folders.add((await this.#body(req)).path);
        return { folders: this.folders.list() };
      }
      if (route === 'POST /folders/pick') {
        if (!canPickFolder()) throw new HttpError(404, 'Type the folder path instead.');
        const chosen = await pickFolder();
        if (chosen) this.folders.add(chosen);
        return { folders: this.folders.list(), cancelled: !chosen };
      }
      if (req.method === 'DELETE' && parts[1] === 'folders' && parts.length === 3) {
        this.folders.remove(parts[2]);
        return { folders: this.folders.list() };
      }
    } catch (err) {
      if (err instanceof FolderError) throw new HttpError(400, err.message);
      throw err;
    }
    throw new HttpError(404, 'Not found.');
  }

  #agentFields(body, existing = null) {
    const name = text(body.name, 40).replace(/[@\[\]]/g, '');
    if (!name) throw new HttpError(400, 'Give the agent a name.');
    const provider = text(body.provider, 40);
    if (!this.providers.has(provider)) throw new HttpError(400, 'Pick a provider for this agent.');
    const model = text(body.model, 120);
    if (!model) throw new HttpError(400, 'Pick a model for this agent.');
    return {
      name,
      role: text(body.role, 80),
      instructions: text(body.instructions, 20000),
      provider,
      model,
      avatar: avatarFrom(body.avatar, existing?.avatar),
      // An older app that doesn't know about abilities leaves them as they were.
      abilities: Array.isArray(body.abilities)
        ? ABILITIES.filter((a) => body.abilities.includes(a))
        : (existing?.abilities ?? []),
    };
  }

  #roomFields(body, existing = null) {
    const name = text(body.name, 60);
    if (!name) throw new HttpError(400, 'Give the room a name.');
    const agentIds = [...new Set(Array.isArray(body.agentIds) ? body.agentIds : [])].filter((a) => this.store.agent(a));
    if (!agentIds.length) throw new HttpError(400, 'Pick at least one agent.');
    // "auto" is best fit: only the agents suited to each message answer it.
    const mode = ['lead', 'auto'].includes(body.mode) ? body.mode : 'roundtable';
    const leadId = mode === 'lead' ? (agentIds.includes(body.leadId) ? body.leadId : agentIds[0]) : null;
    // What the room is for and rules for every agent in it. An older app that doesn't send it leaves it as it was.
    const description = typeof body.description === 'string' ? text(body.description, 2000) : (existing?.description ?? '');
    return { name, agentIds, mode, leadId, description };
  }

  /** Every room at once, for a phone that wants to know when its crew is done. Starts with what is running now. */
  #follow(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
    const running = this.store.state.rooms.filter((r) => this.orchestrator.runState(r.id).active).map((r) => this.#runView(r.id));
    res.write(`event: runs\ndata: ${JSON.stringify({ rooms: running })}\n\n`);
    this.watchers.add(res);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      this.watchers.delete(res);
    });
    return undefined;
  }

  #subscribe(req, res, roomId) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(`event: run\ndata: ${JSON.stringify(this.orchestrator.runState(roomId))}\n\n`);
    const set = this.subscribers.get(roomId) ?? new Set();
    this.subscribers.set(roomId, set);
    set.add(res);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      set.delete(res);
    });
  }
}
