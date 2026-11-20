import http from 'node:http';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { Orchestrator } from './orchestrator.js';
import { PAIR_PAGE } from './pairpage.js';
import { pairingLink, qrSvg } from './qr.js';

export const VERSION = '0.1.0';
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
const newPairingCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** How long the pairing page keeps saying "Paired with …" after a phone pairs. */
const JUST_PAIRED_MS = 60_000;

/**
 * The hub's HTTP API. Everything except /api/hub and /api/pair needs the
 * bearer token a phone receives when it pairs with the code shown on the PC.
 */
export class Hub {
  constructor({ store, providers, name, onPairingCode = () => {} }) {
    this.store = store;
    this.providers = providers;
    this.name = name;
    this.onPairingCode = onPairingCode;
    this.subscribers = new Map(); // roomId -> Set<ServerResponse>
    this.orchestrator = new Orchestrator({ store, providers, emit: (...args) => this.#emit(...args) });
    this.pairFailures = 0;
    this.pairLockedUntil = 0;
    this.pairingCode = newPairingCode();
    this.addresses = [];
    this.justPaired = null;
    this.server = http.createServer((req, res) => this.#handle(req, res));
    this.#seed();
  }

  listen(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => resolve(this.server.address().port));
    });
  }

  /** The LAN addresses (host:port) a phone can use to reach this hub, best first. */
  setAddresses(addresses) {
    this.addresses = addresses;
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
    this.discovery?.close();
    for (const set of this.subscribers.values()) for (const res of set) res.end();
    this.server.close();
    this.server.closeAllConnections?.();
    this.store.flush();
  }

  #rotatePairingCode() {
    this.pairingCode = newPairingCode();
    this.pairFailures = 0;
    this.onPairingCode(this.pairingCode);
  }

  /** First run: a small starter crew so the app isn't empty. */
  #seed() {
    if (!this.store.isNew || this.store.state.agents.length) return;
    const real = this.providers.isConfigured('anthropic');
    const provider = real ? 'anthropic' : 'demo';
    const model = real ? 'claude-opus-5-5' : 'demo';
    const starters = [
      ['Nova', 'the planner', 'You break problems into clear steps and keep the group on track.', { shape: 0, color: 7, eyes: 1 }],
      ['Pixel', 'the builder', 'You turn plans into concrete drafts, code, and examples.', { shape: 1, color: 5, eyes: 5 }],
      ['Sage', 'the skeptic', 'You look for gaps, risks, and simpler alternatives, and say so plainly.', { shape: 4, color: 2, eyes: 2 }],
    ];
    const now = Date.now();
    const agents = starters.map(([agentName, role, instructions, avatar]) => ({
      id: crypto.randomUUID(), name: agentName, role, instructions, provider, model, avatar, createdAt: now,
    }));
    this.store.state.agents.push(...agents);
    this.store.state.rooms.push({
      id: crypto.randomUUID(), name: 'First huddle', agentIds: agents.map((a) => a.id),
      mode: real ? 'lead' : 'roundtable', leadId: real ? agents[0].id : null, createdAt: now, updatedAt: now,
    });
    this.store.save();
  }

  #emit(roomId, event, data) {
    for (const res of this.subscribers.get(roomId) ?? []) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  #roomView(room) {
    const last = this.store.messages(room.id).findLast((m) => m.text);
    const run = this.orchestrator.runState(room.id);
    return {
      ...room,
      active: run.active,
      speaking: run.agentId,
      preview: last ? { author: last.author.name, text: last.text.replace(/\s+/g, ' ').slice(0, 140) } : null,
    };
  }

  #authenticate(req) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const device = token && this.store.state.devices.find((d) => d.tokenHash === hashToken(token));
    if (!device) throw new HttpError(401, 'This phone is not paired with the hub.');
    device.lastSeenAt = Date.now();
    return device;
  }

  async #body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request is too large.');
      chunks.push(chunk);
    }
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
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'The hub hit an internal error.' : err.message }));
    }
  }

  async #route(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const key = `${req.method} /${parts.map((p, i) => (i === 2 && parts[0] === 'api' ? ':id' : p)).join('/')}`;
    const id = parts[2];

    if (key === 'GET /api/hub') return { app: 'orbit-hub', name: this.name, version: VERSION };
    if (key === 'POST /api/pair') return this.#pair(await this.#body(req));

    // The pairing page shows the live code, so only the PC itself may open it.
    if (url.pathname === '/pair' || url.pathname === '/pair.json') {
      if (!LOOPBACK.has(req.socket.remoteAddress)) {
        throw new HttpError(403, 'The pairing page only opens on the PC running the hub.');
      }
      if (url.pathname === '/pair') {
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
      };
    }

    const device = this.#authenticate(req);
    switch (key) {
      case 'GET /api/state':
        return {
          hub: { name: this.name, version: VERSION },
          agents: this.store.state.agents,
          rooms: this.store.state.rooms.map((r) => this.#roomView(r)),
          providers: this.providers.list(),
        };
      case 'DELETE /api/device': {
        this.store.state.devices = this.store.state.devices.filter((d) => d.id !== device.id);
        this.store.save();
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
      case 'DELETE /api/providers/:id/key':
        if (!this.providers.takesKey(id)) throw new HttpError(404, "That provider doesn't use a key.");
        this.providers.removeKey(id);
        return this.providers.list().find((p) => p.id === id);

      case 'POST /api/agents': {
        const agent = { id: crypto.randomUUID(), createdAt: Date.now(), ...this.#agentFields(await this.#body(req)) };
        this.store.state.agents.push(agent);
        this.store.save();
        return agent;
      }
      case 'PUT /api/agents/:id': {
        const agent = this.store.agent(id);
        if (!agent) throw new HttpError(404, 'That agent no longer exists.');
        Object.assign(agent, this.#agentFields(await this.#body(req)));
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

      case 'POST /api/rooms': {
        const now = Date.now();
        const room = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...this.#roomFields(await this.#body(req)) };
        this.store.state.rooms.push(room);
        this.store.save();
        return this.#roomView(room);
      }
      case 'PUT /api/rooms/:id': {
        const room = this.#requireRoom(id);
        Object.assign(room, this.#roomFields(await this.#body(req)));
        this.store.save();
        return this.#roomView(room);
      }
      case 'DELETE /api/rooms/:id': {
        this.orchestrator.stop(id);
        this.store.state.rooms = this.store.state.rooms.filter((r) => r.id !== id);
        delete this.store.state.messages[id];
        this.store.save();
        return { ok: true };
      }
    }

    if (parts[0] === 'api' && parts[1] === 'rooms' && parts.length === 4) {
      const room = this.#requireRoom(id);
      switch (`${req.method} ${parts[3]}`) {
        case 'GET messages':
          return { messages: this.store.messages(room.id), run: this.orchestrator.runState(room.id) };
        case 'POST messages': {
          const body = text((await this.#body(req)).text, 20000);
          if (!body) throw new HttpError(400, 'Message is empty.');
          if (!room.agentIds.length) throw new HttpError(400, 'Add at least one agent to this room first.');
          return this.orchestrator.post(room.id, body);
        }
        case 'DELETE messages':
          this.orchestrator.stop(room.id);
          await this.orchestrator.idle(room.id);
          this.store.state.messages[room.id] = [];
          this.store.save();
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

  #requireRoom(id) {
    const room = this.store.room(id);
    if (!room) throw new HttpError(404, 'That room no longer exists.');
    return room;
  }

  #agentFields(body) {
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
      avatar: body.avatar && typeof body.avatar === 'object' ? body.avatar : {},
    };
  }

  #roomFields(body) {
    const name = text(body.name, 60);
    if (!name) throw new HttpError(400, 'Give the room a name.');
    const agentIds = [...new Set(Array.isArray(body.agentIds) ? body.agentIds : [])].filter((a) => this.store.agent(a));
    if (!agentIds.length) throw new HttpError(400, 'Pick at least one agent.');
    const mode = body.mode === 'lead' ? 'lead' : 'roundtable';
    const leadId = mode === 'lead' ? (agentIds.includes(body.leadId) ? body.leadId : agentIds[0]) : null;
    return { name, agentIds, mode, leadId };
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
