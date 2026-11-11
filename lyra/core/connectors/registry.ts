import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolDef } from "../providers/types.ts";
import { wrapUntrusted } from "../untrusted.ts";
import { AUTH_EXPIRED } from "./gmail/server.ts";

export type ConnectorState = "connected" | "not_connected" | "unavailable" | "error";

export interface ConnectorStatus {
  id: string;
  label: string;
  access: string;
  state: ConnectorState;
  account?: string;
  detail?: string;
}

export interface ConnectorSpec {
  id: string;
  label: string;
  access: string;
  /** Only these tools are ever shown to the model, whatever the server offers. */
  allow: string[];
  /** What Lyra shows while the tool runs. */
  labels: Record<string, string>;
  available(): boolean;
  connected(): boolean;
  account(): string | undefined;
  /** Build the connector's MCP server. Remote servers can plug in here later. */
  server(): McpServer;
}

const SEP = "__";
const MAX_RESULT_CHARS = 24_000;

/** MCP connectors, each running in-process and reached over an MCP client. */
export class Connectors {
  private clients = new Map<string, Promise<Client>>();
  private errors = new Map<string, string>();

  constructor(private specs: ConnectorSpec[]) {}

  status(): ConnectorStatus[] {
    return this.specs.map((s) => {
      const base = { id: s.id, label: s.label, access: s.access };
      if (!s.available()) return { ...base, state: "unavailable" as const };
      if (!s.connected()) return { ...base, state: "not_connected" as const };
      const err = this.errors.get(s.id);
      return { ...base, state: err ? ("error" as const) : ("connected" as const), account: s.account(), detail: err };
    });
  }

  private active(): ConnectorSpec[] {
    return this.specs.filter((s) => s.available() && s.connected());
  }

  private client(spec: ConnectorSpec): Promise<Client> {
    let p = this.clients.get(spec.id);
    if (!p) {
      p = (async () => {
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        await spec.server().connect(serverSide);
        const client = new Client({ name: "lyra", version: "0.2.0" });
        await client.connect(clientSide);
        return client;
      })();
      p.catch(() => this.clients.delete(spec.id));
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
    return this.specs.some((s) => toolName.startsWith(`${s.id}${SEP}`));
  }

  label(toolName: string): string {
    const [id, name] = toolName.split(SEP);
    return this.specs.find((s) => s.id === id)?.labels[name] ?? "Checking";
  }

  /** Run a connector tool. The result always comes back wrapped as untrusted data. */
  async call(toolName: string, input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
    const [id, name] = toolName.split(SEP);
    const spec = this.specs.find((s) => s.id === id);
    if (!spec || !spec.allow.includes(name) || !spec.connected()) return { content: `Unknown tool ${toolName}.`, isError: true };
    try {
      const res = await (await this.client(spec)).callTool({ name, arguments: input });
      const blocks = (res.content as { type: string; text?: string }[] | undefined) ?? [];
      let text = blocks.map((b) => (b.type === "text" ? b.text : `[${b.type} left out]`)).join("\n");
      if (res.isError && text.includes(AUTH_EXPIRED)) {
        this.errors.set(spec.id, "The Google sign-in needs renewing. Tap to reconnect.");
        return { content: `${spec.label} sign-in expired. Tell the user to reconnect it from Lyra's access page.`, isError: true };
      }
      this.errors.delete(spec.id);
      if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n[…cut for length]`;
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
