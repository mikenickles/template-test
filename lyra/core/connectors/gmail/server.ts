/**
 * Lyra's Gmail connector: a small MCP server that can only read mail.
 * It runs inside the app and talks to Lyra over an in-memory MCP transport.
 *
 * Read-only is enforced twice: Google only grants the gmail.readonly scope,
 * and this server exposes no tool that writes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenSource } from "../google.ts";
import { AUTH_EXPIRED, googleGet, type Params } from "../google-http.ts";
import { renderThreadMessage, summarizeListItem, type GmailMessage } from "./parse.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export { AUTH_EXPIRED };

export function gmailClient(tokens: TokenSource, fetchFn: typeof fetch = fetch) {
  const g = googleGet(API, "Gmail", tokens, fetchFn);
  return <T>(path: string, params: Params = {}) => g.json<T>(path, params);
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function createGmailServer(tokens: TokenSource, fetchFn: typeof fetch = fetch): McpServer {
  const get = gmailClient(tokens, fetchFn);
  const server = new McpServer({ name: "lyra-gmail", version: "0.2.0" });

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
      const list = await get<{ messages?: { id: string }[] }>("/messages", { q: query, maxResults: max_results ?? 10 });
      const ids = (list.messages ?? []).map((m) => m.id);
      if (!ids.length) return text(`No messages match "${query}".`);
      const msgs = await Promise.all(
        ids.map((id) => get<GmailMessage>(`/messages/${id}`, { format: "metadata", metadataHeaders: ["From", "Subject", "Date"] })),
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
      const number = (i: number) => (i === 0 ? 1 : msgs.length - shown.length + i + 1);
      const parts = shown.map((m, i) => `--- Message ${number(i)} of ${msgs.length} ---\n${renderThreadMessage(m)}`);
      if (msgs.length > shown.length) parts.splice(1, 0, `[${msgs.length - shown.length} messages in the middle left out]`);
      return text(parts.join("\n\n"));
    },
  );

  return server;
}

/** Who's signed in, for display on the access page. */
export async function gmailProfile(tokens: TokenSource, fetchFn: typeof fetch = fetch): Promise<string | undefined> {
  try {
    return (await gmailClient(tokens, fetchFn)<{ emailAddress: string }>("/profile")).emailAddress;
  } catch {
    return undefined;
  }
}
