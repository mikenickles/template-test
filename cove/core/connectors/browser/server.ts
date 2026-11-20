/**
 * The user's own browser as a connector (0.56, step 1): Cove opens and reads pages in its
 * own window there, through Cove's extension and the Windows app. It can only look: no
 * clicking, typing or sending yet. What a page says comes back wrapped as outside content,
 * like email, so nothing on a web page can steer Cove.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface BrowserPage {
  title: string;
  url: string;
  text: string;
  links: { text: string; href: string }[];
}

export interface BrowserLink {
  status(): Promise<{ listening: boolean; connected: boolean; agent: string }>;
  open(url: string): Promise<BrowserPage>;
  read(): Promise<BrowserPage>;
  close(): Promise<void>;
}

const MAX_TEXT = 18_000;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

/** A web address the model may open: http(s) only, no passwords in it. */
export function checkUrl(raw: string): string {
  const r = raw.trim();
  // another kind of address (a file, a script, the browser's own pages): never
  if ((/^[a-z][a-z0-9+.-]*:\/\//i.test(r) && !/^https?:\/\//i.test(r)) || /^(javascript|data|file|blob|about|chrome|vivaldi|edge|view-source|mailto):/i.test(r))
    throw new Error("Only web pages (http or https).");
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(r) ? r : `https://${r}`);
  } catch {
    throw new Error("That isn't a web address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only web pages (http or https).");
  if (u.username || u.password) throw new Error("Cove doesn't open addresses with a name or password in them.");
  return u.toString();
}

/** The page for Cove: what it is, its text, and its links (to go further). */
export function describePage(p: BrowserPage): string {
  const body = p.text.length > MAX_TEXT ? `${p.text.slice(0, MAX_TEXT)}\n[…cut, ${p.text.length - MAX_TEXT} more characters]` : p.text;
  const links = p.links.slice(0, 40).map((l) => `- ${l.text} → ${l.href}`);
  return [`${p.title || "(no title)"}`, p.url, "", body || "(no text on the page)", ...(links.length ? ["", "Links:", ...links] : [])].join("\n");
}

export const NOT_CONNECTED =
  "Cove's extension isn't connected. Tell the user to open their browser (with Cove's extension added) while Cove is open on the computer; the Cove page has the steps.";

export function createBrowserServer(link: BrowserLink): McpServer {
  const server = new McpServer({ name: "lyra-browser", version: "0.1.0" });
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (/NOT_CONNECTED/.test((e as Error).message)) throw new Error(NOT_CONNECTED);
      throw e;
    }
  };
  server.registerTool(
    "open_page",
    {
      title: "Open a page",
      description:
        "Open a web page in Cove's own window in the user's browser, where they're signed in to their sites, and read it: its title, text and links. Use it for pages that need their sign-in (their accounts, orders, bookings) or that web search can't read. It only reads; nothing is clicked or sent. Only open what the user asked about.",
      inputSchema: { url: z.string().describe("The page's address, https://...") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => text(describePage(await guard(() => link.open(checkUrl(url))))),
  );
  server.registerTool(
    "read_page",
    {
      title: "Read the page again",
      description: "Read the page open in Cove's browser window again, e.g. after it finished loading more.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => text(describePage(await guard(() => link.read()))),
  );
  return server;
}
