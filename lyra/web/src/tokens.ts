// (0.52) Show each reply's token count under it. A per-device preference, off to start.
const KEY = "lyra.showTokens";

export function showTokens(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setShowTokens(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* stays as it was */
  }
  dispatchEvent(new Event("lyra:tokens"));
}

/** "12.4K tokens · 3 calls" */
export function tokenLine(u: { input: number; output: number; calls: number }): string {
  const n = u.input + u.output;
  const t = n < 10_000 ? n.toLocaleString("en-US") : `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`;
  return `${t} tokens${u.calls > 1 ? ` · ${u.calls} calls` : ""}`;
}
