/**
 * (0.63) Bank accounts through SimpleFIN Bridge: read only. The user links their banks on
 * SimpleFIN's site and pastes a one-time setup token; Tomo claims it once for a private access
 * URL (kept with the API keys, never synced) and reads balances and transactions with it.
 * Nothing here can move money: the protocol has no way to.
 */

/** A request the platform makes natively (no browser CORS), or plain fetch in tests. */
export type Http = (url: string, init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; text: string }>;

export interface BankTxn {
  id: string;
  /** seconds since 1970 */
  posted: number;
  /** negative = money out */
  amount: number;
  description: string;
  pending?: boolean;
}

export interface BankAccount {
  id: string;
  org: string;
  name: string;
  currency: string;
  balance: number;
  available?: number;
  /** seconds since 1970 */
  balanceDate: number;
  transactions: BankTxn[];
}

const BRIDGE = /^https:\/\/([a-z0-9-]+\.)*simplefin\.org(\/|$)/i;

/** The setup token is a base64-encoded claim URL on SimpleFIN's bridge. */
export function claimUrl(token: string): string {
  const t = token.trim().replace(/\s+/g, "");
  if (!t) throw new Error("Paste the setup token from SimpleFIN first.");
  let url: string;
  try {
    url = atob(t).trim();
  } catch {
    throw new Error("That doesn't look like a SimpleFIN setup token. Copy the whole token and try again.");
  }
  if (!BRIDGE.test(url)) throw new Error("That doesn't look like a SimpleFIN setup token. Copy the whole token and try again.");
  return url;
}

/** Split "https://user:pass@host/path" into the base URL and a Basic auth header. */
export function accessParts(access: string): { base: string; auth: string } {
  let u: URL;
  try {
    u = new URL(access.trim());
  } catch {
    throw new Error("SimpleFIN sent back something unexpected. Try a new setup token.");
  }
  if (u.protocol !== "https:" || !u.username || !BRIDGE.test(`https://${u.host}/`)) throw new Error("SimpleFIN sent back something unexpected. Try a new setup token.");
  const auth = `Basic ${btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`)}`;
  u.username = "";
  u.password = "";
  return { base: u.toString().replace(/\/$/, ""), auth };
}

/** Trade the one-time setup token for the access URL. A used token can't be claimed again. */
export async function claim(token: string, http: Http): Promise<string> {
  const r = await http(claimUrl(token), { method: "POST", body: "" });
  if (r.status === 403) throw new Error("That setup token was already used. Make a new one on SimpleFIN and paste that.");
  if (r.status < 200 || r.status >= 300) throw new Error(`SimpleFIN said no (${r.status}). Try a new setup token.`);
  const access = r.text.trim();
  accessParts(access); // checks it
  return access;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** The /accounts answer, made tidy. Unknown fields are ignored; bad rows are dropped. */
export function parseAccounts(json: unknown): { accounts: BankAccount[]; errors: string[] } {
  const o = (json ?? {}) as { errors?: unknown[]; accounts?: Record<string, unknown>[] };
  const errors = (o.errors ?? []).map((e) => String(e)).filter(Boolean);
  const accounts = (o.accounts ?? [])
    .filter((a) => a && typeof a === "object" && a.id)
    .map((a) => {
      const org = (a.org ?? {}) as { name?: string; domain?: string };
      const txns = Array.isArray(a.transactions) ? (a.transactions as Record<string, unknown>[]) : [];
      return {
        id: String(a.id),
        org: String(org.name ?? org.domain ?? "Bank"),
        name: String(a.name ?? "Account"),
        currency: String(a.currency ?? "USD"),
        balance: num(a.balance),
        ...(a["available-balance"] !== undefined ? { available: num(a["available-balance"]) } : {}),
        balanceDate: num(a["balance-date"]),
        transactions: txns
          .filter((t) => t && t.id !== undefined)
          .map((t) => ({
            id: String(t.id),
            posted: num(t.posted) || num(t.transacted_at),
            amount: num(t.amount),
            description: String(t.description ?? t.payee ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
            ...(t.pending ? { pending: true } : {}),
          })),
      } satisfies BankAccount;
    });
  return { accounts, errors };
}

/** Balances and the last `days` of transactions (SimpleFIN keeps about 90). */
export async function fetchAccounts(access: string, http: Http, days = 45, now = Date.now()): Promise<{ accounts: BankAccount[]; errors: string[] }> {
  const { base, auth } = accessParts(access);
  const start = Math.floor(now / 1000) - Math.min(Math.max(days, 1), 90) * 86_400;
  const r = await http(`${base}/accounts?start-date=${start}&pending=1`, { method: "GET", headers: { Authorization: auth } });
  if (r.status === 403 || r.status === 401) throw new Error("SimpleFIN stopped accepting Tomo's access. Reconnect your bank from the Tomo page.");
  if (r.status === 402) throw new Error("Your SimpleFIN subscription needs attention on their site.");
  if (r.status < 200 || r.status >= 300) throw new Error(`SimpleFIN didn't answer (${r.status}). Try again in a bit.`);
  let json: unknown;
  try {
    json = JSON.parse(r.text);
  } catch {
    throw new Error("SimpleFIN sent back something unexpected.");
  }
  return parseAccounts(json);
}

/** "$1,234.56", "-$12.00" */
export function money(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD" }).format(n);
  } catch {
    return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
  }
}

const day = (s: number, timeZone?: string) => new Date(s * 1000).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });

export function describeAccounts(list: BankAccount[], timeZone?: string): string {
  if (!list.length) return "No accounts are linked on SimpleFIN yet.";
  return list
    .map((a) => `- ${a.org} · ${a.name}: ${money(a.balance, a.currency)}${a.available !== undefined && a.available !== a.balance ? ` (${money(a.available, a.currency)} available)` : ""}${a.balanceDate ? `, as of ${day(a.balanceDate, timeZone)}` : ""}`)
    .join("\n");
}

export interface TxnFilter {
  days?: number;
  account?: string;
  search?: string;
  /** only money out (true) or only money in (false) */
  out?: boolean;
  min?: number;
}

export function pickTransactions(list: BankAccount[], f: TxnFilter, now = Date.now()): (BankTxn & { account: string; currency: string })[] {
  const since = Math.floor(now / 1000) - Math.min(Math.max(f.days ?? 30, 1), 90) * 86_400;
  const acct = f.account?.trim().toLowerCase();
  const words = (f.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((a) => !acct || `${a.org} ${a.name}`.toLowerCase().includes(acct))
    .flatMap((a) => a.transactions.map((t) => ({ ...t, account: `${a.org} ${a.name}`, currency: a.currency })))
    .filter((t) => t.posted >= since)
    .filter((t) => (f.out === undefined ? true : f.out ? t.amount < 0 : t.amount > 0))
    .filter((t) => (f.min ? Math.abs(t.amount) >= f.min : true))
    .filter((t) => words.every((w) => t.description.toLowerCase().includes(w)))
    .sort((a, b) => b.posted - a.posted);
}

export function describeTransactions(list: ReturnType<typeof pickTransactions>, timeZone?: string, max = 60): string {
  if (!list.length) return "No transactions match.";
  const lines = list.slice(0, max).map((t) => `- ${day(t.posted, timeZone)} · ${t.description || "(no description)"} · ${money(t.amount, t.currency)}${t.pending ? " (pending)" : ""} · ${t.account}`);
  return `${lines.join("\n")}${list.length > max ? `\n…and ${list.length - max} more` : ""}`;
}

/** Totals worked out in code (models are bad at adding up long lists). */
export function spendingSummary(list: BankAccount[], days: number, now = Date.now()): string {
  const txns = pickTransactions(list, { days }, now).filter((t) => !t.pending);
  const out = txns.filter((t) => t.amount < 0);
  const inn = txns.filter((t) => t.amount > 0);
  const total = (l: typeof txns) => l.reduce((s, t) => s + t.amount, 0);
  const byWho = new Map<string, { sum: number; n: number }>();
  for (const t of out) {
    const k = t.description.replace(/\s*#?\d{3,}.*$/, "").replace(/\s{2,}.*/, "").trim().slice(0, 40) || "(no description)";
    const e = byWho.get(k) ?? { sum: 0, n: 0 };
    e.sum += -t.amount;
    e.n++;
    byWho.set(k, e);
  }
  const top = [...byWho.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 10);
  const cur = txns[0]?.currency ?? "USD";
  return [
    `Last ${days} days (posted only): spent ${money(-total(out), cur)} in ${out.length} charges, came in ${money(total(inn), cur)} in ${inn.length}.`,
    top.length ? `Biggest places:\n${top.map(([k, e]) => `- ${k}: ${money(e.sum, cur)} (${e.n}×)`).join("\n")}` : "",
    "Transfers between the user's own accounts and card payments count as money out here; say so if it matters.",
  ]
    .filter(Boolean)
    .join("\n");
}
