/**
 * (0.63) Money as connectors: "bank" (SimpleFIN, balances and transactions) and "ynab" (the
 * budget). Read only: there are no tools that move, pay or change anything, and every answer
 * comes back wrapped as outside content (merchant names are other people's words).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { describeAccounts, describeTransactions, fetchAccounts, pickTransactions, spendingSummary, type BankAccount, type Http } from "./simplefin.ts";
import { ynabMonth, ynabTransactions } from "./ynab.ts";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const ro = { readOnlyHint: true, openWorldHint: true } as const;

/** SimpleFIN asks apps to keep requests few (about once a day per connection is the norm). */
export const BANK_FRESH_MS = 2 * 3_600_000;

export class BankCache {
  private data: { at: number; accounts: BankAccount[]; errors: string[] } | null = null;
  constructor(private readonly access: () => Promise<string | null>, private readonly http: Http) {}
  forget() {
    this.data = null;
  }
  async get(now = Date.now()): Promise<{ at: number; accounts: BankAccount[]; errors: string[] }> {
    if (this.data && now - this.data.at < BANK_FRESH_MS) return this.data;
    const access = await this.access();
    if (!access) throw new Error("No bank is connected. Tell the user they can connect one from the Tomo page.");
    const r = await fetchAccounts(access, this.http, 90, now);
    this.data = { at: now, ...r };
    return this.data;
  }
}

export function createBankServer(cache: BankCache, timeZone?: string): McpServer {
  const server = new McpServer({ name: "lyra-bank", version: "0.1.0" });
  const note = (errors: string[]) => (errors.length ? `\n\nSimpleFIN notes: ${errors.slice(0, 3).join(" · ")}` : "");
  server.registerTool(
    "accounts",
    { title: "Bank balances", description: "The user's bank and card accounts with their current balances (read only, through SimpleFIN).", inputSchema: {}, annotations: ro },
    async () => {
      const d = await cache.get();
      return text(describeAccounts(d.accounts, timeZone) + note(d.errors));
    },
  );
  server.registerTool(
    "transactions",
    {
      title: "Bank transactions",
      description: "Transactions from the user's linked accounts, newest first. Negative amounts are money out.",
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().describe("How far back (default 30)."),
        account: z.string().optional().describe("Part of an account or bank name."),
        search: z.string().optional().describe("Words in the description, like a store name."),
        direction: z.enum(["out", "in", "both"]).optional(),
        min_amount: z.number().min(0).optional().describe("Only amounts at least this big."),
      },
      annotations: ro,
    },
    async ({ days, account, search, direction, min_amount }) => {
      const d = await cache.get();
      const list = pickTransactions(d.accounts, { days, account, search, min: min_amount, out: direction === "out" ? true : direction === "in" ? false : undefined });
      return text(describeTransactions(list, timeZone) + note(d.errors));
    },
  );
  server.registerTool(
    "spending",
    {
      title: "Spending summary",
      description: "Totals worked out exactly: money out and in over the last N days and the biggest places. Use this for 'how much did I spend' questions instead of adding transactions up yourself.",
      inputSchema: { days: z.number().int().min(1).max(90).optional().describe("Default 30.") },
      annotations: ro,
    },
    async ({ days }) => {
      const d = await cache.get();
      return text(spendingSummary(d.accounts, days ?? 30));
    },
  );
  return server;
}

export function createYnabServer(token: () => Promise<string | null>, http: Http): McpServer {
  const server = new McpServer({ name: "lyra-ynab", version: "0.1.0" });
  const need = async () => {
    const t = await token();
    if (!t) throw new Error("YNAB isn't connected. Tell the user they can connect it from the Tomo page.");
    return t;
  };
  server.registerTool(
    "budget",
    { title: "This month's budget", description: "The user's YNAB budget this month: what's left in each category, what's overspent, and what's ready to assign.", inputSchema: {}, annotations: ro },
    async () => text(await ynabMonth(await need(), http)),
  );
  server.registerTool(
    "budget_transactions",
    {
      title: "YNAB transactions",
      description: "Recent transactions in YNAB with their categories.",
      inputSchema: { days: z.number().int().min(1).max(120).optional().describe("Default 30."), search: z.string().optional().describe("Payee, category or memo words.") },
      annotations: ro,
    },
    async ({ days, search }) => text(await ynabTransactions(await need(), http, days ?? 30, search)),
  );
  return server;
}
