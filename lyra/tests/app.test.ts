import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { FakeProvider } from "../server/providers/fake.ts";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function make(extra: Parameters<typeof loadConfig>[0] = {}, script: ConstructorParameters<typeof FakeProvider>[0] = []) {
  const dataDir = mkdtempSync(join(tmpdir(), "lyra-app-"));
  const cfg = loadConfig({ dataDir, accessToken: "secret-token", userName: "Sam", webDist: "/nonexistent", ...extra });
  const app = await buildApp(cfg, { provider: new FakeProvider(script) });
  apps.push(app);
  return app;
}

const local = { remoteAddress: "127.0.0.1", headers: { host: "localhost:4310" } };

describe("access control", () => {
  it("lets this computer in on a local host name", async () => {
    const app = await make();
    const res = await app.inject({ method: "GET", url: "/api/state", ...local });
    expect(res.statusCode).toBe(200);
    expect(res.json().connectors[0]).toMatchObject({ id: "gmail", state: "not_configured" });
  });

  it("blocks DNS rebinding (local address, foreign host name)", async () => {
    const app = await make();
    const res = await app.inject({ method: "GET", url: "/api/state", remoteAddress: "127.0.0.1", headers: { host: "evil.example:4310" } });
    expect(res.statusCode).toBe(401);
  });

  it("requires the token from other devices, then remembers it in a cookie", async () => {
    const app = await make();
    const phone = { remoteAddress: "100.101.102.103", headers: { host: "pc.tailnet.ts.net:4310" } };
    expect((await app.inject({ method: "GET", url: "/api/state", ...phone })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/?token=wrong", ...phone })).statusCode).toBe(401);
    const pair = await app.inject({ method: "GET", url: "/?token=secret-token", ...phone });
    expect(pair.statusCode).toBe(302);
    const cookie = String(pair.headers["set-cookie"]).split(";")[0];
    const ok = await app.inject({ method: "GET", url: "/api/state", remoteAddress: phone.remoteAddress, headers: { ...phone.headers, cookie } });
    expect(ok.statusCode).toBe(200);
  });
});

describe("chat over SSE", () => {
  it("streams text, memory notes and a final message", async () => {
    const app = await make({}, [
      { parts: [{ type: "tool_call", id: "c1", name: "remember", input: { section: "People", text: "Rowan turns 7 on Nov 14" } }], stop: "tool_use" },
      { parts: [{ type: "text", text: "Got it." }], stop: "end" },
    ]);
    const res = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "Rowan turns 7 on Nov 14" }, ...local });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = res.body
      .trim()
      .split("\n\n")
      .map((b) => b.match(/^event: (\w+)/)![1]);
    expect(events).toEqual(["memory", "text", "text", "done"]);

    const mem = (await app.inject({ method: "GET", url: "/api/memory", ...local })).json();
    expect(mem.sections.find((s: { name: string }) => s.name === "People").items).toEqual(["Rowan turns 7 on Nov 14"]);

    const msgs = (await app.inject({ method: "GET", url: "/api/messages", ...local })).json().messages;
    expect(msgs).toHaveLength(2);

    // undo the note from the chat
    const undo = await app.inject({ method: "POST", url: "/api/memory/note", payload: { messageId: msgs[1].id, index: 0, action: "undo" }, ...local });
    expect(undo.json().message.meta.memory[0].undone).toBe(true);
    const after = (await app.inject({ method: "GET", url: "/api/memory", ...local })).json();
    expect(after.sections.find((s: { name: string }) => s.name === "People").items).toEqual([]);
  });

  it("rejects empty messages and non-JSON bodies", async () => {
    const app = await make();
    expect((await app.inject({ method: "POST", url: "/api/chat", payload: { text: "  " }, ...local })).statusCode).toBe(400);
    const textPlain = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: "hello",
      remoteAddress: "127.0.0.1",
      headers: { host: "localhost:4310", "content-type": "text/plain" },
    });
    expect(textPlain.statusCode).toBe(400);
  });

  it("validates settings", async () => {
    const app = await make();
    expect((await app.inject({ method: "PUT", url: "/api/settings", payload: { provider: "nope" }, ...local })).statusCode).toBe(400);
    const ok = await app.inject({ method: "PUT", url: "/api/settings", payload: { provider: "gemini", model: "gemini-3.8-flash" }, ...local });
    expect(ok.json().choice).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
  });
});
