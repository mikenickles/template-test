import fs from 'node:fs';
import path from 'node:path';

const EMPTY = { agents: [], rooms: [], messages: {}, devices: [] };

/** JSON-file persistence for the hub. One file, written atomically, debounced. */
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    fs.mkdirSync(dir, { recursive: true });
    this.state = structuredClone(EMPTY);
    this.isNew = !fs.existsSync(this.file);
    if (!this.isNew) {
      this.state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    }
    this.timer = null;
  }

  /** Schedule a write. Streaming deltas call this often, so writes are coalesced. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }

  agent(id) {
    return this.state.agents.find((a) => a.id === id);
  }

  room(id) {
    return this.state.rooms.find((r) => r.id === id);
  }

  messages(roomId) {
    return (this.state.messages[roomId] ??= []);
  }
}
