/** Backups, restore, and grafting the home base's work. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import { graftHomeWork, type Grafted } from "../graft.ts";
import * as S from "../skills.ts";
import { listChannels } from "../db.ts";
import { decryptBackup, encryptBackup, fromBase64, toBase64, type BackupPayload } from "../backup.ts";
import { channelNotebookSpec } from "../memory.ts";
import * as T from "../tasks.ts";
import * as R from "../routines.ts";
import { GOOGLE_LINKS, DEVICE_SETTINGS } from "./shared.ts";
import { part } from "./part.ts";

export const backup = part({
  /** Everything Lyra knows, encrypted with the passphrase. API keys and Google sign-ins stay out. */
  async backup(passphrase: string): Promise<Uint8Array> {
    await this.db.flush();
    const files: Record<string, string> = {};
    const names = ["memory.md", "soul.md", ...listChannels(this.db).map((c) => channelNotebookSpec(c.id, c.name, c.about).file)];
    for (const n of names) {
      const t = await this.p.texts.read(n);
      if (t !== null) files[n] = t;
    }
    const payload: BackupPayload = { format: "lyra-backup", version: 1, createdAt: new Date().toISOString(), db: toBase64(this.db.exportBytes()), files };
    return encryptBackup(payload, passphrase);
  },

  /**
   * Copy the home base's own work (its posts, and its notes of what it already did) out of
   * another device's snapshot into this device's data, instead of making the user pick a side.
   * Copies nothing when a person changed things over there too.
   */
  async graft(file: Uint8Array, passphrase: string): Promise<Grafted> {
    const payload = await decryptBackup(file, passphrase);
    const other = new this.p.SQL.Database(fromBase64(payload.db));
    try {
      const r = graftHomeWork(this.db, other);
      if (r.posts) this.listeners.forEach((l) => l({ type: "message", channelId: null }));
      await this.db.flush();
      return r;
    } finally {
      other.close();
    }
  },

  /**
   * Replace everything on this phone with a backup. Afterwards this engine is
   * finished: the app must restart (reload) to load the restored data.
   */
  async restore(file: Uint8Array, passphrase: string, opts: { keepThisDevice?: boolean } = {}): Promise<{ messages: number; channels: number }> {
    const payload = await decryptBackup(file, passphrase);
    // Settings that belong to a device, not to Lyra: Google sign-ins are always this
    // device's own; for sync, this device also keeps its lock and notification choices.
    const local = opts.keepThisDevice
      ? this.db.all<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE key IN (${DEVICE_SETTINGS.map(() => "?").join(",")})`, [...DEVICE_SETTINGS])
      : [];
    let bytes: Uint8Array;
    let channels: { id: number; name: string; about: string }[];
    let messages: number;
    try {
      const probe = new this.p.SQL.Database(fromBase64(payload.db));
      messages = Number(probe.exec("SELECT count(*) FROM messages")[0]?.values[0][0] ?? 0);
      channels = (probe.exec("SELECT id, name, about FROM channels")[0]?.values ?? []).map(([id, name, about]) => ({ id: Number(id), name: String(name), about: String(about ?? "") }));
      probe.run(`DELETE FROM settings WHERE key IN (${(opts.keepThisDevice ? DEVICE_SETTINGS : GOOGLE_LINKS).map((k) => `'${k}'`).join(",")})`);
      for (const { key, value } of local) probe.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
      bytes = probe.export();
      probe.close();
    } catch {
      throw new Error("This backup is damaged and can't be restored.");
    }
    if (!this.p.blobs) throw new Error("This device can't restore backups.");

    // stop everything that could write, then swap the files underneath
    this.running?.abort();
    this.workers.stopAll();
    await this.workers.settle();
    await this.db.detach();
    await this.p.blobs.write("lyra.db", bytes);
    for (const [name, text] of Object.entries(payload.files)) {
      if (/^(memory|soul|channel-\d+)\.md$/.test(name)) await this.p.texts.write(name, text);
    }
    if (!("soul.md" in payload.files)) await this.p.texts.write("soul.md", "");
    // a channel whose notebook wasn't in the backup starts fresh, not with this phone's old file
    for (const c of channels) {
      const spec = channelNotebookSpec(c.id, c.name, c.about);
      if (!(spec.file in payload.files)) await this.p.texts.write(spec.file, spec.template);
    }
    return { messages, channels: channels.length };
  },
});
