// A small client for Chrome's DevTools connection, which drives the Treehouse browser. Chrome only listens on
// this PC (127.0.0.1), and this client refuses to connect anywhere else.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Opens a WebSocket to a DevTools address on this PC. Resolves with { send, close } and emits 'message'. */
export function openSocket(address) {
  const url = new URL(address);
  if (url.protocol !== 'ws:' || !LOOPBACK.has(url.hostname)) {
    return Promise.reject(new Error('The browser connection must stay on this PC.'));
  }
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port,
      path: url.pathname + url.search,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key },
    });
    req.setTimeout(10_000, () => req.destroy(new Error('The browser did not answer.')));
    req.on('error', reject);
    req.on('response', (res) => reject(new Error(`The browser refused the connection (${res.statusCode}).`)));
    req.on('upgrade', (res, socket, head) => {
      const expected = crypto.createHash('sha1').update(key + GUID).digest('base64');
      if (res.headers['sec-websocket-accept'] !== expected) {
        socket.destroy();
        return reject(new Error('The browser answered strangely.'));
      }
      socket.setNoDelay(true);
      resolve(new Socket(socket, head));
    });
    req.end();
  });
}

class Socket extends EventEmitter {
  #socket;
  #buffer = Buffer.alloc(0);
  #parts = [];

  constructor(socket, head) {
    super();
    this.#socket = socket;
    socket.on('data', (chunk) => this.#read(chunk));
    socket.on('close', () => this.emit('close'));
    socket.on('error', () => socket.destroy());
    if (head?.length) this.#read(head);
  }

  #read(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const b = this.#buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      let length = b[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (b.length < 4) return;
        length = b.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (b.length < 10) return;
        length = Number(b.readBigUInt64BE(2));
        offset = 10;
      }
      // Frames from the browser are never masked.
      if (b.length < offset + length) return;
      const payload = b.subarray(offset, offset + length);
      this.#buffer = b.subarray(offset + length);
      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode === 0x9) {
        this.#write(0xa, payload);
        continue;
      }
      if (opcode === 0x1 || opcode === 0x0) {
        this.#parts.push(Buffer.from(payload));
        if (fin) {
          const text = Buffer.concat(this.#parts).toString('utf8');
          this.#parts = [];
          this.emit('message', text);
        }
      }
    }
  }

  #write(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    const header = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    if (length < 126) header[1] = 0x80 | length;
    else if (length < 65536) {
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    const masked = Buffer.alloc(length);
    for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.#socket.write(Buffer.concat([header, mask, masked]));
  }

  send(text) {
    this.#write(0x1, Buffer.from(text, 'utf8'));
  }

  close() {
    if (this.#socket.destroyed) return;
    try {
      this.#write(0x8, Buffer.alloc(0));
    } catch {
      // Already gone.
    }
    this.#socket.end();
  }
}

/** One DevTools connection to the browser, with commands sent to it or to one of its tabs. */
export class Cdp extends EventEmitter {
  #socket;
  #next = 1;
  #pending = new Map();
  closed = false;

  static async connect(address) {
    return new Cdp(await openSocket(address));
  }

  constructor(socket) {
    super();
    this.#socket = socket;
    socket.on('message', (text) => this.#receive(text));
    socket.on('close', () => {
      this.closed = true;
      for (const { reject } of this.#pending.values()) reject(new Error('The browser closed.'));
      this.#pending.clear();
      this.emit('close');
    });
  }

  #receive(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.id && this.#pending.has(message.id)) {
      const { resolve, reject } = this.#pending.get(message.id);
      this.#pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message ?? 'The browser said no.'));
      else resolve(message.result ?? {});
    } else if (message.method) {
      this.emit(message.method, message.params ?? {}, message.sessionId);
    }
  }

  /** Sends a DevTools command, to the browser or (with sessionId) to one tab. */
  send(method, params = {}, sessionId = undefined, timeout = 30_000) {
    if (this.closed) return Promise.reject(new Error('The browser closed.'));
    const id = this.#next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('The browser took too long.'));
      }, timeout);
      this.#pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.#socket.close();
  }
}
