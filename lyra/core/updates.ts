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
  /** a phone update uploaded in pieces (Lyra-<v>.apk.part1of4 …), in order */
  parts?: string[];
}

/** Lyra-0.12.1.apk.part2of4: one piece of a phone update too big to upload whole. */
export function parsePartName(name: string): { version: string; part: number; total: number } | null {
  const m = name.match(/^Lyra-(\d+\.\d+\.\d+)\.apk\.part(\d+)of(\d+)$/);
  if (!m) return null;
  const part = Number(m[2]);
  const total = Number(m[3]);
  return part >= 1 && part <= total && total <= 50 ? { version: m[1], part, total } : null;
}

/** Turn complete sets of pieces into one phone update each; incomplete sets are ignored until the rest arrive. */
export function joinParts(pieces: { id: string; name: string; size: number }[]): UpdateFile[] {
  const sets = new Map<string, { total: number; ids: Map<number, string>; size: number }>();
  for (const p of pieces) {
    const info = parsePartName(p.name);
    if (!info) continue;
    const key = `${info.version}/${info.total}`;
    const set = sets.get(key) ?? { total: info.total, ids: new Map(), size: 0 };
    if (!set.ids.has(info.part)) {
      set.ids.set(info.part, p.id);
      set.size += p.size;
    }
    sets.set(key, set);
  }
  const out: UpdateFile[] = [];
  for (const [key, set] of sets) {
    if (set.ids.size !== set.total) continue;
    const version = key.split("/")[0];
    const parts = Array.from({ length: set.total }, (_, i) => set.ids.get(i + 1)!);
    out.push({ id: parts[0], name: `Lyra-${version}.apk`, kind: "apk", version, size: set.size, parts });
  }
  return out;
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
      out.push(...joinParts(r.files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0) }))));
    }
    return out;
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.get(`${API}/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
  }

  /** The whole file, putting a split phone update back together. */
  async fetchUpdate(file: UpdateFile): Promise<Uint8Array> {
    if (!file.parts) return this.download(file.id);
    const pieces: Uint8Array[] = [];
    for (const id of file.parts) pieces.push(await this.download(id));
    const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of pieces) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}
