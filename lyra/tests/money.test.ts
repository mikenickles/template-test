// 0.63: money, read only. Bank accounts through SimpleFIN Bridge (a one-time setup token is
// claimed for a private access URL kept with the keys) and YNAB (a personal access token).
// Nothing here can move money, and what comes back is outside content.
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessParts, claimUrl, parseAccounts, pickTransactions, spendingSummary, type Http } from "../core/connectors/money/simplefin.ts";
import { describeMonth } from "../core/connectors/money/ynab.ts";
import { pastTense } from "../core/chat.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

const NOW = Date.UTC(2026, 10, 25, 18);
const s = (daysAgo: number) => Math.floor(NOW / 1000) - daysAgo * 86_400;
const ACCOUNTS = {
  errors: [],
  accounts: [
    {
      org: { domain: "mybank.example", name: "My Bank", "sfin-url": "https://beta-bridge.simplefin.org/simplefin" },
      id: "ACT-1",
      name: "Checking",
      currency: "USD",
      balance: "2450.10",
      "available-balance": "2400.10",
      "balance-date": s(0),
      transactions: [
        { id: "T1", posted: s(1), amount: "-84.50", description: "PG&E WEB ONLINE" },
        { id: "T2", posted: s(2), amount: "-12.40", description: "Blue Bottle Coffee #1234" },
        { id: "T3", posted: s(3), amount: "-15.60", description: "Blue Bottle Coffee #1234" },
        { id: "T4", posted: s(5), amount: "3200.00", description: "Payroll ACME" },
        { id: "T5", posted: s(0), amount: "-40.00", description: "Gas station", pending: true },
        { id: "T6", posted: s(50), amount: "-999.00", description: "Old" },
      ],
    },
    { org: { name: "Card Co" }, id: "ACT-2", name: "Visa", currency: "USD", balance: "-310.00", "balance-date": s(0), transactions: [] },
  ],
};
const ACCESS = "https://user123:secret456@beta-bridge.simplefin.org/simplefin";
const TOKEN = btoa("https://beta-bridge.simplefin.org/simplefin/claim/abc123");

function fakeBridge() {
  const log: string[] = [];
  let claimed = false;
  const http: Http = async (url, init) => {
    log.push(`${init.method} ${url}${init.headers?.Authorization ? ` ${init.headers.Authorization}` : ""}`);
    if (url.endsWith("/claim/abc123")) {
      if (claimed) return { status: 403, text: "Forbidden" };
      claimed = true;
      return { status: 200, text: ACCESS };
    }
    if (url.startsWith("https://beta-bridge.simplefin.org/simplefin/accounts")) return init.headers?.Authorization === `Basic ${btoa("user123:secret456")}` ? { status: 200, text: JSON.stringify(ACCOUNTS) } : { status: 403, text: "" };
    if (url.startsWith("https://api.ynab.com/v1/user")) return init.headers?.Authorization === "Bearer good-token-1234567890abc" ? { status: 200, text: '{"data":{"user":{"id":"u"}}}' } : { status: 401, text: "" };
    if (url.startsWith("https://api.ynab.com/v1/budgets/last-used/months/current"))
      return {
        status: 200,
        text: JSON.stringify({ data: { month: { month: "2026-11-01", to_be_budgeted: 125000, categories: [{ name: "Groceries", category_group_name: "Food", budgeted: 600000, activity: -450250, balance: 149750 }, { name: "Dining out", budgeted: 150000, activity: -190000, balance: -40000 }] } } }),
      };
    return { status: 404, text: "" };
  };
  return { http, log };
}

describe("SimpleFIN pieces", () => {
  it("decodes the setup token to a claim URL on SimpleFIN only", () => {
    expect(claimUrl(TOKEN)).toBe("https://beta-bridge.simplefin.org/simplefin/claim/abc123");
    expect(() => claimUrl(btoa("https://evil.example/claim"))).toThrow(/doesn't look like a SimpleFIN setup token/);
    expect(() => claimUrl("not base64!!")).toThrow(/setup token/);
  });
  it("splits the access URL into a base and Basic auth", () => {
    expect(accessParts(ACCESS)).toEqual({ base: "https://beta-bridge.simplefin.org/simplefin", auth: `Basic ${btoa("user123:secret456")}` });
    expect(() => accessParts("http://user:pass@beta-bridge.simplefin.org/simplefin")).toThrow();
  });
  it("parses accounts and works out spending in code", () => {
    const { accounts } = parseAccounts(ACCOUNTS);
    expect(accounts[0]).toMatchObject({ org: "My Bank", name: "Checking", balance: 2450.1, available: 2400.1 });
    expect(pickTransactions(accounts, { days: 30, search: "coffee" }, NOW).map((t) => t.id)).toEqual(["T2", "T3"]);
    const sum = spendingSummary(accounts, 30, NOW);
    expect(sum).toContain("spent $112.50 in 3 charges");
    expect(sum).toContain("came in $3,200.00");
    expect(sum).toContain("Blue Bottle Coffee: $28.00 (2×)");
    expect(sum).not.toContain("Old");
  });
});

describe("YNAB pieces", () => {
  it("reads milliunits and calls out overspending", () => {
    const t = describeMonth({ month: "2026-11-01", to_be_budgeted: 125000, categories: [{ name: "Dining out", budgeted: 150000, activity: -190000, balance: -40000 }] });
    expect(t).toContain("$125.00 ready to assign");
    expect(t).toContain("Overspent: Dining out (-$40.00)");
  });
});

describe("money connections in Tomo", () => {
  afterEach(() => vi.useRealTimers());
  it("connects a bank with a setup token once, reads it as outside content, and forgets it on disconnect", async () => {
    const bridge = fakeBridge();
    const provider = new FakeProvider([call("bank__spending", { days: 30 }), say("About $112 this month.")]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const p = platform({ provider, http: bridge.http });
    const lyra = await Lyra.start(p);
    expect(lyra.state().connectors.find((c) => c.id === "bank")?.state).toBe("not_connected");
    await lyra.connectBank(TOKEN);
    expect(await p.secrets.get("bank.access")).toBe(ACCESS);
    expect(lyra.state().connectors.find((c) => c.id === "bank")?.state).toBe("connected");
    await expect(lyra.connectBank(TOKEN)).rejects.toThrow(/already used/);

    const steps: string[] = [];
    await lyra.chat("How much did I spend this month?", { ...noop, step: (t) => steps.push(t) });
    expect(provider.requests[0].tools.map((t) => t.name)).toEqual(expect.arrayContaining(["bank__accounts", "bank__transactions", "bank__spending"]));
    // nothing that could move money
    expect(provider.requests[0].tools.some((t) => /^bank__(pay|send|transfer|move)/.test(t.name))).toBe(false);
    const result = provider.requests[1].messages.at(-1)!.parts.find((x) => x.type === "tool_result");
    expect(result && result.type === "tool_result" && result.content).toMatch(/<untrusted_data[^]*Blue Bottle[^]*<\/untrusted_data>/);
    expect(steps).toEqual(["Added up your spending"]);
    expect(bridge.log.some((l) => l.includes("/accounts?start-date="))).toBe(true);

    await lyra.disconnectBank();
    expect(await p.secrets.get("bank.access")).toBeNull();
    expect(lyra.state().connectors.find((c) => c.id === "bank")?.state).toBe("not_connected");
  });

  it("connects YNAB only with a token that works, and reads the budget", async () => {
    const bridge = fakeBridge();
    const provider = new FakeProvider([call("ynab__budget", {}), say("Dining out is $40 over.")]);
    const p = platform({ provider, http: bridge.http });
    const lyra = await Lyra.start(p);
    await expect(lyra.connectYnab("bad-token-1234567890abcdef")).rejects.toThrow(/didn't accept the token/);
    await lyra.connectYnab("good-token-1234567890abc");
    expect(lyra.state().connectors.find((c) => c.id === "ynab")?.state).toBe("connected");
    await lyra.chat("How's my budget?", noop);
    const result = provider.requests[1].messages.at(-1)!.parts.find((x) => x.type === "tool_result");
    expect(result && result.type === "tool_result" && result.content).toContain("Overspent: Dining out (-$40.00)");
  });

  it("says the steps in plain words", () => {
    expect(pastTense("Looking through your transactions")).toBe("Looked through your transactions");
    expect(pastTense("Checking your accounts")).toBe("Checked your accounts");
  });
});

describe("Tomo knows its own setup (0.63.3)", () => {
  it("puts the models, connections and switches in the prompt", async () => {
    const provider = new FakeProvider([say("You picked it for light jobs.")]);
    const lyra = await Lyra.start(platform({ provider, version: "9.9.9" }));
    lyra.deviceFacts = async () => ["Keep watch (checks with the app closed): on, every 15 minutes."];
    await lyra.chat("which model do you use for light tasks?", noop);
    const sys = JSON.stringify(provider.requests[0].system);
    expect(sys).toContain("## Your setup");
    expect(sys).toContain("Background model for light jobs");
    expect(sys).toContain("Keep watch (checks with the app closed): on");
    expect(sys).toContain("Tomo 9.9.9");
    expect(sys).toContain("Bank accounts: not connected");
  });
});
