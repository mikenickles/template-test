/**
 * Updates from your own Google Drive: a "Lyra Updates" folder holding
 *   Lyra-<version>.apk                  the phone app
 *   Lyra-app-<version>.lyrapack         the Windows app's code (small, applied on restart)
 *   Lyra-<version>-win-arm64.zip        the full Windows app (only when its shell changes)
 * Only files you own count, so a folder someone shares with you can't push an update.
 */
import type { TokenSource } from "./connectors/google.ts";

export const UPDATES_FOLDER = "Lyra Updates";
const API = "https://www.googleapis.com/drive/v3/files";

export type UpdateKind = "apk" | "pack" | "win";

export interface UpdateFile {
  id: string;
  name: string;
  kind: UpdateKind;
  version: string;
  size: number;
}

/** -1, 0 or 1, comparing "0.12.0"-style versions number by number. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function parseUpdateName(name: string): { kind: UpdateKind; version: string } | null {
  let m = name.match(/^Lyra-(\d+\.\d+\.\d+)\.apk$/);
  if (m) return { kind: "apk", version: m[1] };
  m = name.match(/^Lyra-app-(\d+\.\d+\.\d+)\.lyrapack$/);
  if (m) return { kind: "pack", version: m[1] };
  m = name.match(/^Lyra-(\d+\.\d+\.\d+)-win-arm64\.zip$/);
  if (m) return { kind: "win", version: m[1] };
  return null;
}

/** The newest file of a kind that's newer than `current`, if any. */
export function newest(files: UpdateFile[], kind: UpdateKind, current: string): UpdateFile | undefined {
  return files
    .filter((f) => f.kind === kind && compareVersions(f.version, current) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}

export class UpdateSource {
  constructor(
    private token: TokenSource,
    private fetchFn: typeof fetch,
  ) {}

  private async get(url: string): Promise<Response> {
    const r = await this.fetchFn(url, { headers: { Authorization: `Bearer ${await this.token.get()}` } });
    if (!r.ok) throw new Error(`Google Drive said ${r.status} while checking for updates.`);
    return r;
  }

  async list(): Promise<UpdateFile[]> {
    const q = (query: string, fields: string) => `${API}?${new URLSearchParams({ q: query, fields, pageSize: "100", orderBy: "modifiedTime desc" })}`;
    const folders = (await (
      await this.get(q(`name = '${UPDATES_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and 'me' in owners and trashed = false`, "files(id)"))
    ).json()) as { files: { id: string }[] };
    const out: UpdateFile[] = [];
    for (const folder of folders.files) {
      const r = (await (
        await this.get(q(`'${folder.id}' in parents and 'me' in owners and trashed = false`, "files(id,name,size)"))
      ).json()) as { files: { id: string; name: string; size?: string }[] };
      for (const f of r.files) {
        const p = parseUpdateName(f.name);
        if (p) out.push({ id: f.id, name: f.name, size: Number(f.size ?? 0), ...p });
      }
    }
    return out;
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.get(`${API}/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
  }
}
