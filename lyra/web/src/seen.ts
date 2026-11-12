// What you've seen in each chat, on this device, for the "new" marks in the sidebar.
import { api } from "./api";

const KEY = "lyra.seen";
type Seen = Record<string, number>;
const subs = new Set<() => void>();

function read(): Seen | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}

function write(s: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // no storage: nothing is marked new
  }
  subs.forEach((f) => f());
}

/** The first time, everything that's already there counts as seen. */
export async function seenNow(): Promise<Seen> {
  const s = read();
  if (s) return s;
  const all = await api.latestMessageIds();
  write(all);
  return all;
}

/** Looking at a chat: everything up to `messageId` is seen. */
export function markSeen(channelId: number | null, messageId: number): void {
  const s = read() ?? {};
  const key = channelId === null ? "main" : String(channelId);
  if ((s[key] ?? 0) >= messageId) return;
  write({ ...s, [key]: messageId });
}

export function onSeen(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
