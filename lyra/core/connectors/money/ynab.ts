/**
 * (0.63) YNAB, read only: the user pastes a personal access token from YNAB's Developer
 * Settings; Tomo reads this month's categories and recent transactions from their last-used
 * budget. Amounts come in milliunits (1000 = 1.00).
 */
import { money, type Http } from "./simplefin.ts";

const API = "https://api.ynab.com/v1";

export async function ynabGet<T>(token: string, path: string, http: Http): Promise<T> {
  const r = await http(`${API}${path}`, { method: "GET", headers: { Authorization: `Bearer ${token.trim()}` } });
  if (r.status === 401) throw new Error("YNAB didn't accept the token. Make a new one in YNAB's Developer Settings and reconnect.");
  if (r.status === 429) throw new Error("YNAB says Tomo asked too often. Try again in a while.");
  if (r.status < 200 || r.status >= 300) throw new Error(`YNAB didn't answer (${r.status}).`);
  return (JSON.parse(r.text) as { data: T }).data;
}

/** Checks a token works; returns nothing useful beyond that. */
export async function checkToken(token: string, http: Http): Promise<void> {
  if (!/^[\w-]{20,200}$/.test(token.trim())) throw new Error("That doesn't look like a YNAB personal access token.");
  await ynabGet<unknown>(token, "/user", http);
}

interface Category {
  name: string;
  category_group_name?: string;
  budgeted: number;
  activity: number;
  balance: number;
  hidden?: boolean;
  deleted?: boolean;
  goal_target?: number | null;
}

const m = (milli: number) => money(milli / 1000);

export function describeMonth(month: { month?: string; to_be_budgeted?: number; activity?: number; categories?: Category[] }): string {
  const cats = (month.categories ?? []).filter((c) => !c.hidden && !c.deleted && (c.budgeted || c.activity || c.balance));
  const over = cats.filter((c) => c.balance < 0);
  const lines = cats
    .sort((a, b) => a.activity - b.activity)
    .slice(0, 40)
    .map((c) => `- ${c.category_group_name ? `${c.category_group_name} › ` : ""}${c.name}: ${m(c.balance)} left (budgeted ${m(c.budgeted)}, spent ${m(-c.activity)})`);
  return [
    `Month ${month.month ?? ""}: ${month.to_be_budgeted !== undefined ? `${m(month.to_be_budgeted)} ready to assign` : ""}`.trim(),
    over.length ? `Overspent: ${over.map((c) => `${c.name} (${m(c.balance)})`).join(", ")}` : "Nothing overspent.",
    lines.join("\n"),
  ].join("\n");
}

interface Txn {
  date: string;
  amount: number;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string;
  memo?: string | null;
  deleted?: boolean;
}

export function describeYnabTransactions(list: Txn[], search?: string, max = 60): string {
  const words = (search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const rows = list
    .filter((t) => !t.deleted)
    .filter((t) => words.every((w) => `${t.payee_name ?? ""} ${t.category_name ?? ""} ${t.memo ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return "No transactions match.";
  return rows
    .slice(0, max)
    .map((t) => `- ${t.date} · ${t.payee_name ?? "(no payee)"} · ${m(t.amount)}${t.category_name ? ` · ${t.category_name}` : ""}${t.account_name ? ` · ${t.account_name}` : ""}`)
    .join("\n");
}

export async function ynabMonth(token: string, http: Http): Promise<string> {
  const d = await ynabGet<{ month: Parameters<typeof describeMonth>[0] }>(token, "/budgets/last-used/months/current", http);
  return describeMonth(d.month);
}

export async function ynabTransactions(token: string, http: Http, days: number, search?: string, now = Date.now()): Promise<string> {
  const since = new Date(now - Math.min(Math.max(days, 1), 120) * 86_400_000).toISOString().slice(0, 10);
  const d = await ynabGet<{ transactions: Txn[] }>(token, `/budgets/last-used/transactions?since_date=${since}`, http);
  return describeYnabTransactions(d.transactions, search);
}
