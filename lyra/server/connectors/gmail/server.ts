/**
 * Lyra's Gmail connector: a small MCP server that can only read mail.
 * It runs as its own process and is started by Lyra over stdio.
 *
 * Read-only is enforced twice: the Google token only carries the
 * gmail.readonly scope, and this server exposes no tool that writes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadToken, oauthClient, scopesAreReadOnly } from "../google/oauth.ts";
import { renderThreadMessage, summarizeListItem, type GmailMessage } from "./parse.ts";

const tokenPath = process.env.LYRA_GOOGLE_TOKEN_PATH;
if (!tokenPath) throw new Error("LYRA_GOOGLE_TOKEN_PATH is not set");
const token = loadToken(tokenPath);
if (!token) throw new Error("Gmail is not connected");
if (!scopesAreReadOnly(token.scope)) throw new Error("Refusing to start: the Gmail token is not read-only");

const client = oauthClient({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET });
client.setCredentials({ refresh_token: token.refresh_token });

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function get<T>(path: string, params: Record<string, string | number | string[]> = {}): Promise<T> {
  const res = await client.request<T>({ url: `${API}${path}`, params, paramsSerializer: serialize });
  return res.data;
}

function serialize(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) q.append(k, String(item));
  }
  return q.toString();
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

const server = new McpServer({ name: "lyra-gmail", version: "0.1.0" });

server.registerTool(
  "search_mail",
  {
    title: "Search mail",
    description:
      "Search the user's Gmail with Gmail search syntax (e.g. 'from:school newer_than:7d', 'is:unread', 'subject:invoice'). Returns sender, date, subject and a short preview for each message, newest first.",
    inputSchema: {
      query: z.string().describe("Gmail search query. Use an empty string for the latest mail."),
      max_results: z.number().int().min(1).max(25).optional().describe("How many messages to return (default 10)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, max_results }) => {
    const list = await get<{ messages?: { id: string }[] }>("/messages", {
      q: query,
      maxResults: max_results ?? 10,
    });
    const ids = (list.messages ?? []).map((m) => m.id);
    if (!ids.length) return text(`No messages match "${query}".`);
    const msgs = await Promise.all(
      ids.map((id) =>
        get<GmailMessage>(`/messages/${id}`, { format: "metadata", metadataHeaders: ["From", "Subject", "Date"] }),
      ),
    );
    return text(`${msgs.length} message(s) for "${query}":\n${msgs.map(summarizeListItem).join("\n")}`);
  },
);

server.registerTool(
  "read_thread",
  {
    title: "Read a thread",
    description: "Read a whole email thread as plain text, oldest message first. Use a thread id from search_mail.",
    inputSchema: { thread_id: z.string().regex(/^[0-9a-f]+$/i, "a Gmail thread id") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ thread_id }) => {
    const thread = await get<{ messages?: GmailMessage[] }>(`/threads/${thread_id}`, { format: "full" });
    const msgs = thread.messages ?? [];
    if (!msgs.length) return text("That thread is empty.");
    // Long threads: keep the first message and the most recent ones.
    const shown = msgs.length > 8 ? [msgs[0], ...msgs.slice(-6)] : msgs;
    const skipped = msgs.length - shown.length;
    const body = shown
      .map((m, i) => `--- Message ${i === 0 ? 1 : msgs.length - shown.length + i + 1} of ${msgs.length} ---\n${renderThreadMessage(m)}`)
      .join("\n\n");
    return text(skipped ? body.replace("\n\n---", `\n\n[${skipped} messages in the middle left out]\n\n---`) : body);
  },
);

await server.connect(new StdioServerTransport());
