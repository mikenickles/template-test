import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/config.ts";
import { GMAIL_READONLY } from "../server/connectors/google/oauth.ts";
import { Connectors } from "../server/connectors/registry.ts";

function cfgWithToken(scope: string) {
  const dataDir = mkdtempSync(join(tmpdir(), "lyra-conn-"));
  const cfg = loadConfig({ dataDir, google: { clientId: "id.apps.googleusercontent.com", clientSecret: "secret" } });
  writeFileSync(cfg.googleTokenPath, JSON.stringify({ refresh_token: "r", scope, connected_at: "now", email: "sam@example.com" }));
  return cfg;
}

describe("Gmail connector over MCP", () => {
  it("starts the real server process and exposes only the read tools", async () => {
    const c = new Connectors(cfgWithToken(GMAIL_READONLY));
    try {
      const tools = await c.tools();
      expect(tools.map((t) => t.name).sort()).toEqual(["gmail__read_thread", "gmail__search_mail"]);
      expect(c.status()[0]).toMatchObject({ state: "connected", account: "sam@example.com" });
    } finally {
      await c.reset();
    }
  }, 30_000);

  it("refuses to start with a token that can send mail", async () => {
    const c = new Connectors(cfgWithToken(`${GMAIL_READONLY} https://www.googleapis.com/auth/gmail.send`));
    try {
      expect(await c.tools()).toEqual([]);
      expect(c.status()[0].state).toBe("error");
      expect(c.status()[0].detail).toContain("not read-only");
    } finally {
      await c.reset();
    }
  }, 30_000);

  it("rejects tools outside the allowlist", async () => {
    const c = new Connectors(cfgWithToken(GMAIL_READONLY));
    expect(await c.call("gmail__send_message", {})).toMatchObject({ isError: true });
    expect(c.owns("gmail__anything")).toBe(true);
    expect(c.owns("remember")).toBe(false);
  });
});
