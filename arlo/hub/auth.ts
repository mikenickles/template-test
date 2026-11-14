import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { db, now } from './db.ts';

/**
 * Who is calling.
 *
 *  local  - a browser on this computer, talking to 127.0.0.1 directly. This is
 *           the owner's seat: the only place keys, limits and devices change.
 *  device - a phone that was paired with a one-time code.
 */
export type Who = { kind: 'local' } | { kind: 'device'; id: string; name: string };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FORWARDED = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded'];

/**
 * True only for a direct connection from this machine addressed to localhost.
 * Checking the Host header defeats DNS rebinding; refusing forwarded requests
 * means a reverse proxy in front of the hub never inherits the owner's seat.
 */
export function isLocal(req: IncomingMessage, port: number): boolean {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return false;
  if (FORWARDED.some((h) => req.headers[h] !== undefined)) return false;
  const host = req.headers.host ?? '';
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

/** Browsers send Origin on cross-site requests; anything that is not this very site is refused. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const COOKIE = 'arlo_device';

function tokenFrom(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

export function identify(req: IncomingMessage, port: number): Who | null {
  if (isLocal(req, port)) return { kind: 'local' };
  const token = tokenFrom(req);
  if (!token) return null;
  const row = db().prepare('select id, name, last_seen from devices where token_hash = ?').get(hash(token)) as
    | { id: string; name: string; last_seen: number | null }
    | undefined;
  if (!row) return null;
  if (!row.last_seen || now() - row.last_seen > 60_000) {
    db().prepare('update devices set last_seen = ? where id = ?').run(now(), row.id);
  }
  return { kind: 'device', id: row.id, name: row.name };
}

// --- Pairing: a short code shown on the computer, typed or scanned on the phone. ---

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LIFETIME_MS = 10 * 60_000;
const MAX_WRONG = 8;

let pairing: { code: string; expires: number; wrong: number } | null = null;

export function startPairing(): { code: string; expires: number } {
  const bytes = crypto.randomBytes(8);
  const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  pairing = { code, expires: now() + CODE_LIFETIME_MS, wrong: 0 };
  return { code, expires: pairing.expires };
}

/** Exchange a pairing code for a long-lived device token. Codes work once and die after a few wrong guesses. */
export function completePairing(code: string, name: string): { token: string; id: string } | null {
  if (!pairing || now() > pairing.expires) {
    pairing = null;
    return null;
  }
  const given = Buffer.from(code.trim().toUpperCase());
  const wanted = Buffer.from(pairing.code);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    if (++pairing.wrong >= MAX_WRONG) pairing = null;
    return null;
  }
  pairing = null;
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomBytes(6).toString('hex');
  db().prepare('insert into devices(id, name, token_hash, created_at) values(?, ?, ?, ?)')
    .run(id, name.trim().slice(0, 40) || 'Phone', hash(token), now());
  return { token, id };
}

export function listDevices() {
  return db().prepare('select id, name, created_at, last_seen from devices order by created_at desc').all();
}

export function revokeDevice(id: string): boolean {
  return db().prepare('delete from devices where id = ?').run(id).changes > 0;
}

export function revokeAllDevices(): void {
  db().exec('delete from devices');
}
