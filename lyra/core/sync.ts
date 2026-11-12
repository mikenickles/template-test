/**
 * Hand-off sync: each device keeps its own full copy of Lyra and works alone.
 * When something changes, the device uploads an encrypted snapshot (the same
 * format as a backup) to a remote: Lyra's hidden folder in your Google Drive.
 * When another device opens, it loads the newest snapshot first.
 *
 * Snapshots are numbered (rev). A device remembers which snapshot its data is
 * built on (base). It never uploads over a newer snapshot it hasn't loaded:
 *  - remote has nothing newer than base  -> upload if there are local changes
 *  - remote is newer, no local changes   -> load it (the app then restarts)
 *  - remote is newer AND local changes   -> conflict: the user picks a side
 * The last few snapshots are kept, so a wrong pick can be undone.
 */
import type { Lyra } from "./lyra.ts";
import type { SecretStore } from "./lyra.ts";
import type { TextStore } from "./memory.ts";

export interface SnapshotInfo {
  id: string;
  rev: number;
  device: string;
  deviceName: string;
  savedAt: string;
  /** "conflict": a side the user didn't keep, saved just in case. Never loaded automatically. */
  kind?: "snapshot" | "conflict";
}

export interface SyncRemote {
  list(): Promise<SnapshotInfo[]>;
  download(id: string): Promise<Uint8Array>;
  upload(bytes: Uint8Array, info: Omit<SnapshotInfo, "id">): Promise<SnapshotInfo>;
  remove(id: string): Promise<void>;
}

export interface SyncState {
  enabled: boolean;
  device: string;
  deviceName: string;
  /** the snapshot this device's data is built on */
  base?: { id: string; rev: number };
  /** changed since base */
  dirty: boolean;
  lastSync?: string;
  lastError?: string;
  /** set when both sides changed: the other device's newest snapshot */
  conflict?: SnapshotInfo;
  /** set right after loading another device's snapshot (don't resume its workers) */
  justPulled?: boolean;
}

export type SyncResult = "off" | "up-to-date" | "pushed" | "pulled" | "conflict" | "busy";

const STATE_FILE = "sync.json";
const PASS_KEY = "sync.passphrase";
const KEEP = 10;

const newer = (a: SnapshotInfo, b: SnapshotInfo) => a.rev - b.rev || a.savedAt.localeCompare(b.savedAt) || a.id.localeCompare(b.id);

export function latestSnapshot(list: SnapshotInfo[]): SnapshotInfo | undefined {
  return list.filter((s) => s.kind !== "conflict").sort((a, b) => newer(b, a))[0];
}

export async function readSyncState(texts: TextStore, defaultName: string): Promise<SyncState> {
  const raw = await texts.read(STATE_FILE).catch(() => null);
  if (raw) {
    try {
      return JSON.parse(raw) as SyncState;
    } catch {
      // fall through to a fresh state
    }
  }
  return { enabled: false, device: crypto.randomUUID(), deviceName: defaultName, dirty: false };
}

export class Sync {
  private busy = false;
  /** Every snapshot this device uploads or loads (the Windows app keeps a copy of each). */
  onSnapshot?: (bytes: Uint8Array, info: Omit<SnapshotInfo, "id">) => void;
  /** after loading a snapshot this engine is finished; ignore its writes */
  private frozen = false;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private lyra: Lyra,
    private remote: SyncRemote,
    private texts: TextStore,
    private secrets: SecretStore,
    public state: SyncState,
  ) {
    lyra.onDataChange(() => {
      if (this.state.enabled && !this.state.dirty && !this.frozen) {
        this.state.dirty = true;
        void this.save();
      }
    });
  }

  /** Saves run one after another, so the file always ends up with the latest state. */
  private save(): Promise<void> {
    const text = JSON.stringify(this.state);
    this.saving = this.saving.catch(() => {}).then(() => this.texts.write(STATE_FILE, text));
    return this.saving;
  }

  private async passphrase(): Promise<string> {
    const p = await this.secrets.get(PASS_KEY);
    if (!p) throw new Error("Sync needs its passphrase again. Turn sync off and on.");
    return p;
  }

  /** Is there anything in the remote yet? (Decides between "start" and "join".) */
  async existing(): Promise<SnapshotInfo | undefined> {
    return latestSnapshot(await this.remote.list());
  }

  /**
   * Turn sync on. With nothing in Drive yet, this device's data becomes the first
   * snapshot. If there is, the passphrase must open it, and that data replaces
   * this device's (returns "pulled": restart the app).
   */
  async enable(passphrase: string, deviceName: string): Promise<SyncResult> {
    const latest = await this.existing();
    if (latest) {
      const bytes = await this.remote.download(latest.id);
      // throws on a wrong passphrase before anything changes
      this.frozen = true;
      try {
        await this.lyra.restore(bytes, passphrase, { keepThisDevice: true });
      } catch (e) {
        this.frozen = false;
        throw e;
      }
      await this.secrets.set(PASS_KEY, passphrase);
      this.state = { ...this.state, enabled: true, deviceName, base: { id: latest.id, rev: latest.rev }, dirty: false, justPulled: true, conflict: undefined, lastError: undefined, lastSync: new Date().toISOString() };
      await this.save();
      return "pulled";
    }
    await this.secrets.set(PASS_KEY, passphrase);
    this.state = { ...this.state, enabled: true, deviceName, base: undefined, dirty: true, conflict: undefined, lastError: undefined };
    await this.save();
    return this.check();
  }

  async disable(): Promise<void> {
    await this.secrets.remove(PASS_KEY);
    this.state = { ...this.state, enabled: false, base: undefined, dirty: false, conflict: undefined, lastError: undefined };
    await this.save();
  }

  /**
   * Bring this device and the remote together. `canPull` is false while loading
   * would interrupt you (a reply being written, a worker running, a half-typed message).
   */
  async check(canPull = true): Promise<SyncResult> {
    if (!this.state.enabled) return "off";
    if (this.busy) return "busy";
    this.busy = true;
    try {
      const list = await this.remote.list();
      const latest = latestSnapshot(list);
      const ours = !latest || latest.id === this.state.base?.id;
      let result: SyncResult;
      if (ours) result = this.state.dirty || !latest ? await this.push(list) : "up-to-date";
      else if (!this.state.dirty) result = canPull ? await this.pull(latest) : "busy";
      else {
        this.state.conflict = latest;
        await this.save();
        result = "conflict";
      }
      if (result !== "busy" && result !== "conflict") {
        this.state.lastSync = new Date().toISOString();
        this.state.lastError = undefined;
        await this.save();
      }
      return result;
    } catch (e) {
      this.state.lastError = (e as Error).message;
      await this.save().catch(() => {});
      throw e;
    } finally {
      this.busy = false;
    }
  }

  /** Both sides changed: keep this device's version, or load the other one. The side not kept is saved as a conflict copy. */
  async resolve(keep: "this" | "other"): Promise<SyncResult> {
    const other = this.state.conflict;
    if (!other) return this.check();
    this.busy = true;
    try {
      const list = await this.remote.list();
      if (keep === "this") {
        // the other side's snapshot stays in the list (it's older than ours now)
        const r = await this.push(list);
        this.state.conflict = undefined;
        await this.save();
        return r;
      }
      await this.upload(list, "conflict"); // this device's changes, just in case
      const latest = latestSnapshot(list) ?? other;
      const r = await this.pull(latest);
      return r;
    } finally {
      this.busy = false;
    }
  }

  private async upload(list: SnapshotInfo[], kind: "snapshot" | "conflict"): Promise<SnapshotInfo> {
    const top = Math.max(0, ...list.map((s) => s.rev), this.state.base?.rev ?? 0);
    const bytes = await this.lyra.backup(await this.passphrase());
    const info = {
      rev: kind === "conflict" ? top : top + 1,
      device: this.state.device,
      deviceName: this.state.deviceName,
      savedAt: new Date().toISOString(),
      kind,
    };
    const made = await this.remote.upload(bytes, info);
    this.onSnapshot?.(bytes, info);
    return made;
  }

  private async push(list: SnapshotInfo[]): Promise<SyncResult> {
    const made = await this.upload(list, "snapshot");
    this.state.base = { id: made.id, rev: made.rev };
    this.state.dirty = false;
    this.state.conflict = undefined;
    await this.save();
    // keep the newest few
    const old = [...list, made].sort((a, b) => newer(b, a)).slice(KEEP);
    for (const s of old) await this.remote.remove(s.id).catch(() => {});
    return "pushed";
  }

  private async pull(latest: SnapshotInfo): Promise<SyncResult> {
    const bytes = await this.remote.download(latest.id);
    this.onSnapshot?.(bytes, latest);
    const pass = await this.passphrase();
    this.frozen = true;
    try {
      await this.lyra.restore(bytes, pass, { keepThisDevice: true });
    } catch (e) {
      this.frozen = false;
      throw e;
    }
    this.state.base = { id: latest.id, rev: latest.rev };
    this.state.dirty = false;
    this.state.conflict = undefined;
    this.state.justPulled = true;
    await this.save();
    return "pulled";
  }

  /** After the app restarts on pulled data. */
  async started(): Promise<void> {
    if (this.state.justPulled) {
      // loading the snapshot itself rewrote local files: that isn't a change of ours
      this.state.justPulled = false;
      this.state.dirty = false;
      await this.save();
    }
  }
}
