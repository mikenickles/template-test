import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import type { Config } from "../config.ts";
import type { ToolDef } from "../providers/types.ts";
import { wrapUntrusted } from "../untrusted.ts";
import { loadToken } from "./google/oauth.ts";

export type ConnectorState = "connected" | "not_connected" | "not_configured" | "error";

export interface ConnectorStatus {
  id: string;
  label: string;
  access: string;
  state: ConnectorState;
  account?: string;
  detail?: string;
}

interface Spec {
  id: string;
  label: string;
  access: string;
  /** Only these tools are ever shown to the model, whatever the server offers. */
  allow: string[];
  /** What Lyra shows while the tool runs. */
  labels: Record<string, string>;
  configured(cfg: Config): boolean;
  account(cfg: Config): string | undefined;
  connected(cfg: Config): boolean;
  launch(cfg: Config): { command: string; args: string[]; env: Record<string, string> };
}

const root = resolve(import.meta.dirname, "../..");

function baseEnv(): Record<string, string> {
  const keep = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

const SPECS: Spec[] = [
  {
    id: "gmail",
    label: "Mail",
    access: "Can read your mail",
    allow: ["search_mail", "read_thread"],
    labels: { search_mail: "Searching your mail", read_thread: "Reading the thread" },
    configured: (cfg) => !!(cfg.google.clientId && cfg.google.clientSecret),
    connected: (cfg) => !!loadToken(cfg.googleTokenPath),
    account: (cfg) => loadToken(cfg.googleTokenPath)?.email,
    launch: (cfg) => ({
      command: process.execPath,
      args: ["--import", "tsx", resolve(root, "server/connectors/gmail/server.ts")],
      env: {
        ...baseEnv(),
        GOOGLE_CLIENT_ID: cfg.google.clientId ?? "",
        GOOGLE_CLIENT_SECRET: cfg.google.clientSecret ?? "",
        LYRA_GOOGLE_TOKEN_PATH: cfg.googleTokenPath,
      },
    }),
  },
];

const SEP = "__";
const MAX_RESULT_CHARS = 24_000;

export class Connectors {
  private clients = new Map<string, Promise<Client>>();
  private errors = new Map<string, string>();

  constructor(private cfg: Config) {}

  status(): ConnectorStatus[] {
    return SPECS.map((s) => {
      const base = { id: s.id, label: s.label, access: s.access };
      if (!s.configured(this.cfg)) return { ...base, state: "not_configured" as const };
      if (!s.connected(this.cfg)) return { ...base, state: "not_connected" as const };
      const err = this.errors.get(s.id);
      return { ...base, state: err ? ("error" as const) : ("connected" as const), account: s.account(this.cfg), detail: err };
    });
  }

  private active(): Spec[] {
    return SPECS.filter((s) => s.configured(this.cfg) && s.connected(this.cfg));
  }

  private client(spec: Spec): Promise<Client> {
    let p = this.clients.get(spec.id);
    if (!p) {
      p = (async () => {
        const { command, args, env } = spec.launch(this.cfg);
        const transport = new StdioClientTransport({ command, args, env, cwd: root, stderr: "pipe" });
        let stderr = "";
        transport.stderr?.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
        const client = new Client({ name: "lyra", version: "0.1.0" });
        transport.onclose = () => this.clients.delete(spec.id);
        try {
          await client.connect(transport);
        } catch (e) {
          const why = stderr.match(/Error: (.+)/)?.[1] ?? (e as Error).message;
          throw new Error(`${spec.label} connector didn't start: ${why}`);
        }
        return client;
      })();
      p.catch((e: Error) => {
        this.errors.set(spec.id, e.message);
        this.clients.delete(spec.id);
      });
      this.clients.set(spec.id, p);
    }
    return p;
  }

  /** Tools from every connected connector, limited to each one's allowlist. */
  async tools(): Promise<ToolDef[]> {
    const out: ToolDef[] = [];
    for (const spec of this.active()) {
      try {
        const { tools } = await (await this.client(spec)).listTools();
        if (!this.errors.get(spec.id)?.includes("expired")) this.errors.delete(spec.id);
        for (const t of tools) {
          if (!spec.allow.includes(t.name)) continue;
          out.push({
            name: `${spec.id}${SEP}${t.name}`,
            description: `[${spec.label}] ${t.description ?? ""}`,
            schema: t.inputSchema as Record<string, unknown>,
          });
        }
      } catch (e) {
        this.errors.set(spec.id, (e as Error).message);
      }
    }
    return out;
  }

  owns(toolName: string): boolean {
    return SPECS.some((s) => toolName.startsWith(`${s.id}${SEP}`));
  }

  label(toolName: string): string {
    const [id, name] = toolName.split(SEP);
    return SPECS.find((s) => s.id === id)?.labels[name] ?? "Checking";
  }

  /** Run a connector tool. The result always comes back wrapped as untrusted data. */
  async call(toolName: string, input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
    const [id, name] = toolName.split(SEP);
    const spec = SPECS.find((s) => s.id === id);
    if (!spec || !spec.allow.includes(name)) return { content: `Unknown tool ${toolName}.`, isError: true };
    try {
      const res = await (await this.client(spec)).callTool({ name, arguments: input });
      const blocks = (res.content as { type: string; text?: string }[] | undefined) ?? [];
      let text = blocks.map((b) => (b.type === "text" ? b.text : `[${b.type} left out]`)).join("\n");
      if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n[…cut for length]`;
      if (res.isError && /invalid_grant|invalid_token|Token has been expired or revoked/i.test(text)) {
        this.errors.set(spec.id, "The Google sign-in expired. Tap to reconnect.");
        return { content: `${spec.label} sign-in expired. Tell the user to reconnect it on Lyra's access page.`, isError: true };
      }
      return { content: wrapUntrusted(spec.id, text), isError: !!res.isError };
    } catch (e) {
      return { content: `${spec.label} failed: ${(e as Error).message}`, isError: true };
    }
  }

  /** Drop running connectors, e.g. after Gmail is connected or disconnected. */
  async reset(): Promise<void> {
    const all = [...this.clients.values()];
    this.clients.clear();
    this.errors.clear();
    await Promise.all(all.map((p) => p.then((c) => c.close()).catch(() => {})));
  }
}
