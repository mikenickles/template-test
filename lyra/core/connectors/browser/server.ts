/**
 * The user's own browser as a connector: Lyra opens and reads pages in its own window there,
 * through Lyra's extension and the Windows app. What a page says comes back wrapped as outside
 * content, like email, so nothing on a web page can steer Lyra.
 *
 * (0.60, step 2) Lyra can also use the page: follow links, type into fields, pick options and
 * press buttons that only show or find things. Anything that could send, buy, book, post,
 * delete or change an account (`needsOk`) is never done here: Lyra makes a card with
 * propose_browser_step, and only the user's tap does it. Password and card fields are never
 * typed into (logins come later, through the user's password manager).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Something on the page Lyra can use, numbered by the extension (the number is only good until the page changes). */
export interface BrowserControl {
  ref: number;
  kind: "link" | "button" | "field" | "select" | "check";
  label: string;
  /** an input's type (text, search, email, password…) */
  type?: string;
  href?: string;
  /** the form it's in: how it sends, and whether it's a search */
  form?: { method: "get" | "post"; search: boolean };
  /** a password, card number or security code field: never typed into */
  secret?: boolean;
  options?: string[];
}

export interface BrowserPage {
  title: string;
  url: string;
  text: string;
  links: { text: string; href: string }[];
  controls?: BrowserControl[];
}

export type BrowserStep =
  | { op: "click"; ref: number; label: string }
  | { op: "type"; ref: number; label: string; text: string; enter?: boolean }
  | { op: "choose"; ref: number; label: string; option: string }
  | { op: "submit"; ref: number; label: string }
  | { op: "back" };

export interface BrowserLink {
  status(): Promise<{ listening: boolean; connected: boolean; agent: string }>;
  open(url: string): Promise<BrowserPage>;
  read(): Promise<BrowserPage>;
  close(): Promise<void>;
  /** (0.60) use the page; missing on a Windows app from before shell 6 */
  act?(step: BrowserStep): Promise<BrowserPage>;
}

/** What Lyra typed on the pages it's on, so a card can show what a button would send. */
export class BrowserSession {
  page: BrowserPage | null = null;
  typed: { url: string; label: string; text: string }[] = [];
  seen(p: BrowserPage): BrowserPage {
    // a different site: what was typed before doesn't belong to this one
    if (this.page && host(this.page.url) !== host(p.url)) this.typed = [];
    this.page = p;
    return p;
  }
  note(url: string, label: string, text: string): void {
    this.typed = [...this.typed.filter((t) => !(t.label === label && host(t.url) === host(url))), { url, label, text }].slice(-12);
  }
  typedOn(url: string): { label: string; text: string }[] {
    return this.typed.filter((t) => host(t.url) === host(url)).map(({ label, text }) => ({ label, text }));
  }
}

export const host = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// words on a button or link that mean something leaves, gets bought, booked, posted, deleted or changed
const RISKY =
  /\b(buy|pay|payment|purchase|order|checkout|check out|place|confirm|submit|send|post|publish|tweet|reply|share|delete|remove|discard|cancel|unsubscribe|subscribe|book|reserve|schedule|sign ?up|register|join|create account|donate|transfer|withdraw|deposit|apply|agree|accept|approve|authori[sz]e|save|update|upload|change|reset|close account|log ?out|sign ?out|proceed|complete|finish|claim|redeem|bid|rent|trade|sell|invite|follow|vote|report|enroll|activate|renew|upgrade|downgrade)\b/i;

/**
 * (0.60) Does doing this need the user's OK? Following a plain link, typing into a field and
 * searching don't. Pressing a button or link whose words say it sends, buys, books, posts,
 * deletes or changes something does, and so does any button that sends a form that isn't a
 * search (a form that posts is how sites take orders, messages and changes). A button with no
 * words on it is treated as risky too.
 */
export function needsOk(c: BrowserControl, op: "click" | "submit" = "click"): boolean {
  if (c.secret) return true;
  const words = c.label.trim();
  if (op === "submit") return !(c.form?.search || c.type === "search");
  if (c.kind === "link") return RISKY.test(words);
  if (c.kind === "button") {
    if (!words || RISKY.test(words)) return true;
    if (c.form && !c.form.search && c.form.method === "post") return true;
    return false;
  }
  // ticking a box or picking an option only changes the form on screen
  return false;
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
  if (u.username || u.password) throw new Error("Tomo doesn't open addresses with a name or password in them.");
  return u.toString();
}

/** The page for Lyra: what it is, its text, its links (to go further) and what on it can be used. */
export function describePage(p: BrowserPage): string {
  const body = p.text.length > MAX_TEXT ? `${p.text.slice(0, MAX_TEXT)}\n[…cut, ${p.text.length - MAX_TEXT} more characters]` : p.text;
  const links = p.links.slice(0, 40).map((l) => `- ${l.text} → ${l.href}`);
  const controls = (p.controls ?? []).slice(0, 100).map(describeControl);
  return [
    `${p.title || "(no title)"}`,
    p.url,
    "",
    body || "(no text on the page)",
    // links are listed with what's on the page when there is that list (each with its address)
    ...(links.length && !controls.length ? ["", "Links:", ...links] : []),
    ...(controls.length ? ["", "On the page (use the [number] with click / type_text / choose_option; ⚑ = needs the user's OK through propose_browser_step):", ...controls] : []),
  ].join("\n");
}

function describeControl(c: BrowserControl): string {
  const what =
    c.kind === "field" ? `${c.type && c.type !== "text" ? `${c.type} ` : ""}field` : c.kind === "select" ? `choice of ${(c.options ?? []).slice(0, 8).join(" / ")}` : c.kind;
  const label = c.label ? `"${c.label}"` : "(no label)";
  if (c.secret) return `[${c.ref}] ${label} ${what}: private, Tomo never types here`;
  const flag = (c.kind === "link" || c.kind === "button") && needsOk(c) ? " ⚑" : "";
  const form = c.kind === "field" && c.form ? (c.form.search ? " (search: Enter is fine)" : " (Enter would send the form ⚑)") : "";
  const to = c.kind === "link" && c.href ? ` → ${c.href.slice(0, 160)}` : "";
  return `[${c.ref}] ${label} ${what}${form}${flag}${to}`;
}

export const NOT_CONNECTED =
  "Tomo's extension isn't connected. Tell the user to open their browser (with Tomo's extension added) while Tomo is open on the computer; the Tomo page has the steps.";

const OLD_APP = "Update Tomo on this computer (the full Windows install from the Lyra Updates folder) so it can click and type in the browser.";
const OLD_EXTENSION = "Tomo's extension needs a reload to click and type: in the browser's extensions page, press reload on Tomo. Tell the user.";

/** The control a step is about, from the page as Lyra last saw it. */
function controlFor(session: BrowserSession, ref: number): BrowserControl {
  const c = session.page?.controls?.find((x) => x.ref === ref);
  if (!c) throw new Error(`There's no [${ref}] on the page as last read. Read the page again (read_page) and use a number from it.`);
  return c;
}

export const PROPOSE_HINT = (c: BrowserControl, op: "click" | "submit") =>
  `Not done: ${op === "submit" ? `pressing Enter in "${c.label}" sends the form` : `"${c.label || "that button"}" could send, buy, book, post, delete or change something`}, so it needs the user's OK. ` +
  `Call propose_browser_step with ref ${c.ref}${op === "submit" ? ' and op "submit"' : ""}: that puts a card in the chat, and only the user's tap does it.`;

export function createBrowserServer(link: BrowserLink, session = new BrowserSession()): McpServer {
  const server = new McpServer({ name: "lyra-browser", version: "0.1.0" });
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const m = (e as Error).message;
      if (/NOT_CONNECTED/.test(m)) throw new Error(NOT_CONNECTED);
      if (/Not something the browser link does/.test(m)) throw new Error(OLD_APP);
      if (/extension can't do/.test(m)) throw new Error(OLD_EXTENSION);
      throw e;
    }
  };
  server.registerTool(
    "open_page",
    {
      title: "Open a page",
      description:
        "Open a web page in Tomo's own window in the user's browser, where they're signed in to their sites, and read it: its title, text and links. Use it for pages that need their sign-in (their accounts, orders, bookings) or that web search can't read. It only reads; nothing is clicked or sent. Only open what the user asked about.",
      inputSchema: { url: z.string().describe("The page's address, https://...") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => text(describePage(session.seen(await guard(() => link.open(checkUrl(url)))))),
  );
  server.registerTool(
    "read_page",
    {
      title: "Read the page again",
      description: "Read the page open in Tomo's browser window again, e.g. after it finished loading more.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => text(describePage(session.seen(await guard(() => link.read())))),
  );
  const act = async (step: BrowserStep) => {
    if (!link.act) throw new Error(OLD_APP);
    return text(describePage(session.seen(await guard(() => link.act!(step)))));
  };
  server.registerTool(
    "click",
    {
      title: "Click",
      description:
        "Click a link or button on the page in Tomo's browser window, by its [number] from the last read. Fine for following links, opening details, next pages, filters, 'show more', adding to a cart. Things marked ⚑ (they could send, buy, book, post, delete or change something) are refused here: use propose_browser_step for those. Returns the page after the click.",
      inputSchema: { ref: z.number().int().describe("The [number] of the link or button") },
      annotations: { openWorldHint: true },
    },
    async ({ ref }) => {
      const c = controlFor(session, ref);
      if (c.kind !== "link" && c.kind !== "button" && c.kind !== "check") throw new Error(`[${ref}] is a ${c.kind}: use type_text or choose_option.`);
      if (needsOk(c)) throw new Error(PROPOSE_HINT(c, "click"));
      return act({ op: "click", ref, label: c.label });
    },
  );
  server.registerTool(
    "type_text",
    {
      title: "Type into a field",
      description:
        "Type into a field on the page by its [number]: a search box, a form field, a date. Replaces what's there. Set enter only for a search (it's refused when Enter would send any other form: that needs propose_browser_step). Never for passwords or card numbers: those fields are refused.",
      inputSchema: {
        ref: z.number().int(),
        text: z.string().max(2000),
        enter: z.boolean().optional().describe("Press Enter after typing (searches only)"),
      },
      annotations: { openWorldHint: true },
    },
    async ({ ref, text: words, enter }) => {
      const c = controlFor(session, ref);
      if (c.kind !== "field") throw new Error(`[${ref}] isn't a field to type in.`);
      if (c.secret) throw new Error("That's a password or card field. Tomo never types those: the user fills it in themselves.");
      if (enter && needsOk(c, "submit")) throw new Error(PROPOSE_HINT(c, "submit"));
      const r = await act({ op: "type", ref, label: c.label, text: words, enter: !!enter });
      session.note(session.page?.url ?? "", c.label || `field ${ref}`, words);
      return r;
    },
  );
  server.registerTool(
    "choose_option",
    {
      title: "Pick an option",
      description: "Pick an option in a drop-down on the page by its [number], by the option's text.",
      inputSchema: { ref: z.number().int(), option: z.string() },
      annotations: { openWorldHint: true },
    },
    async ({ ref, option }) => {
      const c = controlFor(session, ref);
      if (c.kind !== "select") throw new Error(`[${ref}] isn't a drop-down.`);
      const r = await act({ op: "choose", ref, label: c.label, option });
      session.note(session.page?.url ?? "", c.label || `choice ${ref}`, option);
      return r;
    },
  );
  server.registerTool(
    "go_back",
    {
      title: "Go back",
      description: "Go back one page in Tomo's browser window.",
      inputSchema: {},
      annotations: { openWorldHint: true },
    },
    async () => act({ op: "back" }),
  );
  return server;
}
