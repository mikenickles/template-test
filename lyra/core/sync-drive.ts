/**
 * Sync snapshots in Lyra's hidden app folder in Google Drive ("appDataFolder").
 * The folder doesn't appear in Drive, and the permission for it can't see or
 * change any of your own files. Every snapshot is encrypted before upload.
 */
import { DRIVE_APPDATA, TokenSource, type GoogleAuth } from "./connectors/google.ts";
import type { HomeBeat, SeenMark, SnapshotInfo, SyncRemote } from "./sync.ts";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const MAX_BYTES = 5 * 1024 * 1024; // a single-request upload's limit

interface DriveFile {
  id: string;
  appProperties?: Record<string, string>;
}

export class DriveSyncRemote implements SyncRemote {
  private tokens: TokenSource;

  constructor(
    auth: GoogleAuth,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {
    this.tokens = new TokenSource(auth, [DRIVE_APPDATA]);
  }

  /** Ask for the sync permission (shows Google's screen if needed). */
  static async connect(auth: GoogleAuth): Promise<void> {
    const r = await auth.authorize([DRIVE_APPDATA], true);
    if (!r.grantedScopes.includes(DRIVE_APPDATA)) throw new Error("Google didn't allow Lyra's sync folder.");
  }

  private async call(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.tokens.get();
    const r = await this.fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
    if (r.status === 401 && !retried) {
      await this.tokens.invalidate();
      return this.call(url, init, true);
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      if (r.status === 403 && /insufficient|scope/i.test(detail)) throw new Error("Lyra needs permission for its sync folder. Turn sync off and on to approve it.");
      throw new Error(`Google Drive said ${r.status}. ${detail.slice(0, 160)}`);
    }
    return r;
  }

  async list(): Promise<SnapshotInfo[]> {
    const q = new URLSearchParams({
      spaces: "appDataFolder",
      fields: "files(id,appProperties)",
      pageSize: "100",
      q: "trashed = false",
    });
    const r = (await (await this.call(`${API}?${q}`)).json()) as { files: DriveFile[] };
    return r.files
      .filter((f) => f.appProperties?.rev)
      .map((f) => ({
        id: f.id,
        rev: Number(f.appProperties!.rev),
        device: f.appProperties!.device ?? "",
        deviceName: f.appProperties!.deviceName ?? "another device",
        savedAt: f.appProperties!.savedAt ?? "",
        kind: f.appProperties!.kind === "conflict" ? "conflict" : "snapshot",
      }));
  }

  /** Small marker files with no content, only properties: the home base's heartbeat, each device's "up to date" mark. */
  private async markers(key: "home" | "seen"): Promise<DriveFile[]> {
    const q = new URLSearchParams({
      spaces: "appDataFolder",
      fields: "files(id,appProperties)",
      pageSize: "20",
      q: `trashed = false and appProperties has { key='${key}' and value='1' }`,
    });
    return ((await (await this.call(`${API}?${q}`)).json()) as { files: DriveFile[] }).files;
  }

  private async homeFile(): Promise<DriveFile | undefined> {
    return (await this.markers("home"))[0];
  }

  async seen(): Promise<SeenMark[]> {
    return (await this.markers("seen")).flatMap((f) => {
      const p = f.appProperties;
      return p?.device && p.at ? [{ device: p.device, deviceName: p.deviceName ?? "", at: p.at }] : [];
    });
  }

  async markSeen(mark: SeenMark): Promise<void> {
    const mine = (await this.markers("seen")).find((f) => f.appProperties?.device === mark.device);
    const appProperties = { seen: "1", device: mark.device, deviceName: mark.deviceName.slice(0, 40), at: mark.at };
    const init = { headers: { "Content-Type": "application/json" } };
    if (mine) await this.call(`${API}/${encodeURIComponent(mine.id)}`, { ...init, method: "PATCH", body: JSON.stringify({ appProperties }) });
    else await this.call(API, { ...init, method: "POST", body: JSON.stringify({ name: "lyra-seen.json", parents: ["appDataFolder"], appProperties }) });
  }

  async home(): Promise<HomeBeat | undefined> {
    const p = (await this.homeFile())?.appProperties;
    return p?.device && p.at ? { device: p.device, deviceName: p.deviceName ?? "your computer", at: p.at } : undefined;
  }

  async setHome(beat: HomeBeat | null): Promise<void> {
    const f = await this.homeFile();
    if (!beat) {
      if (f) await this.remove(f.id);
      return;
    }
    const appProperties = { home: "1", device: beat.device, deviceName: beat.deviceName.slice(0, 40), at: beat.at };
    const init = { headers: { "Content-Type": "application/json" } };
    if (f) await this.call(`${API}/${encodeURIComponent(f.id)}`, { ...init, method: "PATCH", body: JSON.stringify({ appProperties }) });
    else await this.call(API, { ...init, method: "POST", body: JSON.stringify({ name: "lyra-home.json", parents: ["appDataFolder"], appProperties }) });
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.call(`${API}/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
  }

  async upload(bytes: Uint8Array, info: Omit<SnapshotInfo, "id">): Promise<SnapshotInfo> {
    if (bytes.length > MAX_BYTES) throw new Error("Lyra's data has grown too big to sync in one go. Make a backup instead for now.");
    const meta = {
      name: `lyra-${info.kind ?? "snapshot"}-${info.rev}.lyra`,
      parents: ["appDataFolder"],
      appProperties: {
        rev: String(info.rev),
        device: info.device,
        deviceName: info.deviceName.slice(0, 40),
        savedAt: info.savedAt,
        kind: info.kind ?? "snapshot",
      },
    };
    const boundary = `lyra${crypto.randomUUID().replace(/-/g, "")}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      bytes as BlobPart,
      `\r\n--${boundary}--`,
    ]);
    const r = (await (
      await this.call(`${UPLOAD}?uploadType=multipart&fields=id`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      })
    ).json()) as { id: string };
    return { ...info, id: r.id };
  }

  async remove(id: string): Promise<void> {
    await this.call(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
