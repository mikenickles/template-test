import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { runTurn } from "./chat.ts";
import { isLoopback, type Config, type ProviderId } from "./config.ts";
import { authUrl, disconnect, exchangeCode } from "./connectors/google/oauth.ts";
import { Connectors } from "./connectors/registry.ts";
import { getMessage, getSetting, listMessages, openDb, setSetting, updateMessageMeta, type DB } from "./db.ts";
import { isSection, listItems, MemoryStore, SECTIONS } from "./memory.ts";
import { createProvider, listProviders, type ProviderChoice } from "./providers/index.ts";
import type { ModelProvider } from "./providers/types.ts";

export interface AppDeps {
  db?: DB;
  /** Tests pass a provider directly instead of choosing one from settings. */
  provider?: ModelProvider;
}

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "fake"];

export async function buildApp(cfg: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const db = deps.db ?? openDb(cfg.dbPath);
  const memory = new MemoryStore(db, cfg.memoryPath, cfg.userName);
  const connectors = new Connectors(cfg);
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  app.addHook("onClose", async () => {
    await connectors.reset();
    if (!deps.db) db.close();
  });

  // ---------- access ----------
  // Requests from this computer must use a local host name (blocks DNS rebinding).
  // Requests from anywhere else (your phone over Tailscale) need the access token.
  const COOKIE = "lyra_token";
  const tokenOk = (t: string | undefined) => {
    if (!cfg.accessToken || !t) return false;
    const a = Buffer.from(t);
    const b = Buffer.from(cfg.accessToken);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const cookieToken = (req: FastifyRequest) =>
    req.headers.cookie
      ?.split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === COOKIE)?.[1];
  const hostName = (req: FastifyRequest) => (req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");

  app.addHook("onRequest", async (req, reply) => {
    const fromHere = isLoopback(req.ip) || req.ip === "::ffff:127.0.0.1";
    if (fromHere && (isLoopback(hostName(req)) || hostName(req) === cfg.host)) return;
    const q = (req.query as Record<string, string> | undefined)?.token;
    if (req.method === "GET" && q && tokenOk(q)) {
      reply
        .header("set-cookie", `${COOKIE}=${encodeURIComponent(q)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`)
        .redirect(req.url.split("?")[0] || "/");
      return reply;
    }
    const cookie = cookieToken(req);
    if (cookie && tokenOk(decodeURIComponent(cookie))) return;
    reply.code(401).type("text/plain").send("Lyra is private. Open the pairing link printed when Lyra started.");
    return reply;
  });

  // ---------- provider choice ----------
  const choice = (): ProviderChoice => {
    const saved = getSetting(db, "provider");
    if (saved) {
      const c = JSON.parse(saved) as ProviderChoice;
      if (PROVIDERS.includes(c.provider)) return c;
    }
    const fallback = listProviders(cfg).find((p) => p.id === cfg.defaultProvider && p.ready) ?? listProviders(cfg).find((p) => p.ready)!;
    return { provider: fallback.id, model: fallback.defaultModel };
  };
  const provider = () => deps.provider ?? createProvider(cfg, choice());

  const state = () => ({
    name: "Lyra",
    userName: cfg.userName,
    choice: choice(),
    providers: listProviders(cfg),
    connectors: connectors.status(),
  });

  app.get("/api/state", async () => state());

  app.put("/api/settings", async (req, reply) => {
    const body = req.body as Partial<ProviderChoice> | undefined;
    const info = listProviders(cfg).find((p) => p.id === body?.provider);
    if (!info) return reply.code(400).send({ error: "Unknown provider." });
    const model = (typeof body?.model === "string" && body.model.trim()) || info.defaultModel;
    if (!/^[\w.:/-]{1,100}$/.test(model)) return reply.code(400).send({ error: "That model name looks wrong." });
    setSetting(db, "provider", JSON.stringify({ provider: info.id, model }));
    return state();
  });

  // ---------- chat ----------
  app.get("/api/messages", async (req) => {
    const q = req.query as { before?: string; limit?: string };
    return { messages: listMessages(db, Math.min(Number(q.limit) || 60, 200), q.before ? Number(q.before) : undefined) };
  });

  let running: AbortController | undefined;

  app.post("/api/chat", async (req, reply) => {
    const body = req.body as { text?: unknown } | undefined;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return reply.code(400).send({ error: "Say something first." });
    if (text.length > 20_000) return reply.code(400).send({ error: "That message is too long." });
    if (running) return reply.code(409).send({ error: "Lyra is still answering the last message." });

    let p: ModelProvider;
    try {
      p = provider();
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }

    running = new AbortController();
    const ctrl = running;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const ping = setInterval(() => send("ping", {}), 15_000);
    try {
      const saved = await runTurn(
        { db, memory, connectors, provider: p, userName: cfg.userName },
        text,
        {
          text: (d) => send("text", { d }),
          status: (label) => send("status", { label }),
          memory: (note) => send("memory", note),
        },
        ctrl.signal,
      );
      send("done", { message: saved, user: listMessages(db, 2)[0] });
    } finally {
      clearInterval(ping);
      running = undefined;
      res.end();
    }
  });

  app.post("/api/chat/stop", async () => {
    running?.abort();
    return { ok: true };
  });

  // ---------- memory ----------
  const memoryView = () => {
    const content = memory.read();
    return {
      content,
      sections: SECTIONS.map((s) => ({ name: s, items: listItems(content, s) })),
      history: memory.history(),
    };
  };

  app.get("/api/memory", async () => memoryView());

  app.put("/api/memory", async (req, reply) => {
    const content = (req.body as { content?: unknown } | undefined)?.content;
    if (typeof content !== "string" || content.length > 200_000) return reply.code(400).send({ error: "Bad memory file." });
    memory.replace(content);
    return memoryView();
  });

  app.post("/api/memory/restore", async (req, reply) => {
    const id = Number((req.body as { id?: unknown } | undefined)?.id);
    try {
      memory.restore(id);
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
    return memoryView();
  });

  /** Undo a note shown under a chat message, or answer a held suggestion. */
  app.post("/api/memory/note", async (req, reply) => {
    const b = req.body as { messageId?: number; index?: number; action?: string } | undefined;
    const msg = b?.messageId ? getMessage(db, b.messageId) : undefined;
    const note = msg?.meta.memory?.[b?.index ?? -1];
    if (!msg || !note || !isSection(note.section)) return reply.code(404).send({ error: "That note is gone." });

    if (b?.action === "undo" && !note.undone) {
      if (note.kind === "saved") {
        const r = memory.forget(note.section, note.text);
        if ("error" in r) return reply.code(409).send({ error: "That line was already changed." });
      } else if (note.kind === "removed") memory.remember(note.section, note.text);
      else return reply.code(400).send({ error: "Nothing to undo." });
      note.undone = true;
    } else if ((b?.action === "accept" || b?.action === "dismiss") && note.kind === "suggested" && note.suggestionId) {
      const r = memory.resolveSuggestion(note.suggestionId, b.action === "accept");
      note.kind = b.action === "accept" ? "saved" : "dismissed";
      note.text = r.text;
      if (r.snapshotId) note.snapshotId = r.snapshotId;
    } else return reply.code(400).send({ error: "Unknown action." });

    updateMessageMeta(db, msg.id, msg.meta);
    return { message: getMessage(db, msg.id) };
  });

  // ---------- Google ----------
  const pending = new Map<string, number>();
  const redirectUri = () => `http://localhost:${cfg.port}/auth/google/callback`;

  app.get("/auth/google/start", async (req, reply) => {
    if (!isLoopback(hostName(req))) return reply.redirect(`http://localhost:${cfg.port}/auth/google/start`);
    try {
      const state = randomBytes(16).toString("hex");
      pending.set(state, Date.now() + 10 * 60_000);
      return reply.redirect(authUrl(cfg.google, redirectUri(), state));
    } catch (e) {
      return reply.redirect(`/#/access?error=${encodeURIComponent((e as Error).message)}`);
    }
  });

  app.get("/auth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const expires = q.state ? pending.get(q.state) : undefined;
    if (q.state) pending.delete(q.state);
    if (!expires || expires < Date.now()) return reply.redirect(`/#/access?error=${encodeURIComponent("That sign-in link expired. Try again.")}`);
    if (q.error || !q.code) return reply.redirect(`/#/access?error=${encodeURIComponent("Google sign-in was cancelled.")}`);
    try {
      await exchangeCode(cfg.google, redirectUri(), q.code, cfg.googleTokenPath);
      await connectors.reset();
      return reply.redirect("/#/access?connected=gmail");
    } catch (e) {
      return reply.redirect(`/#/access?error=${encodeURIComponent((e as Error).message)}`);
    }
  });

  app.post("/api/connectors/gmail/disconnect", async () => {
    await disconnect(cfg.google, cfg.googleTokenPath);
    await connectors.reset();
    return state();
  });

  // ---------- the web app ----------
  if (existsSync(cfg.webDist)) {
    await app.register(fastifyStatic, { root: cfg.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply: FastifyReply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found." });
    });
  }

  return app;
}
