/** How a turn reads and ends: plain reply buttons, tools on demand, quick actions that end a turn, the 'How I got this' step lines, repeated text. */
import { describeDue, localToDate } from "../reminders.ts";
import { type Part, type ToolDef } from "../providers/types.ts";
import { PROPOSALS } from "./tools.ts";

/**
 * Replies offered as buttons. Tapping one sends it as the user's own message, and they see its
 * words first. After outside content was read they're kept short and plain: no address or link
 * for an email or a web page to smuggle in.
 */
export function plainOptions(options: unknown, tainted: boolean): string[] {
  return (Array.isArray(options) ? options : [])
    .map((o) => String(o).replace(/\s+/g, " ").trim())
    .filter((o) => !REPLY_OFFER.test(o))
    .filter((o) => o && o.length <= (tainted ? 48 : 60) && !(tainted && /@|:\/\/|www\.|\.(com|net|org|io)\b/i.test(o)))
    .slice(0, 3);
}

/** A button offering to answer an email. The user answers almost none, and asks when they want one drafted. */
export const REPLY_OFFER = /\b(repl(y|ies)|respond|write back|draft (a |an |the |my )?(yes|no|response|answer|email|note))\b/i;

/** (0.53.1) Tools for less frequent jobs, loaded on demand with more_tools. */
export const ON_DEMAND = new Set([
  "show_triage",
  "create_routine",
  "update_routine",
  "list_routines",
  "make_dashboard",
  "update_dashboard",
  "show_scan",
  "write_doc",
  "update_doc",
  "read_doc",
  "create_channel",
  "save_skill",
  "remind_at_place",
  "update_life_admin",
  "propose_playlist",
  "set_job_model",
]);

/** The one tool that names the on-demand ones: a line each, instead of their full schemas. */
export function moreTools(extras: ToolDef[]): ToolDef {
  const line = (t: ToolDef) => `- ${t.name}: ${t.description.split(/(?<=[.:])\s/)[0].replace(/[.:]$/, "").slice(0, 110)}`;
  return {
    name: "more_tools",
    description: `Load more of your tools for this reply, then call them in your next step. Load one whenever you need it; never tell the user you can't do one of these.\n${extras.map(line).join("\n")}`,
    schema: { type: "object", properties: { names: { type: "array", items: { type: "string" }, description: "The tools to load, by name." } }, required: ["names"] },
  };
}

/** (0.53) Quick actions: once one works, the turn can end without another model call. */
export const QUICK_DONE = new Set(["set_reminder", "follow_up", "remind_at_place", "cancel_reminder", "create_task", "update_task", "remember", "forget", "remember_person", "save_skill"]);

/** The line Lyra says after quick actions when the model wrote nothing alongside them. */
export function doneLine(calls: { name: string; input: Record<string, unknown> }[], results: Part[], timeZone?: string, now = new Date()): string {
  const when = (at: unknown) => {
    const d = localToDate(String(at ?? ""), timeZone);
    return d ? describeDue(d, timeZone, now) : "";
  };
  const one = (s: unknown, max = 60) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const lines = calls.map((c, i) => {
    const r = results[i];
    const content = r && r.type === "tool_result" ? r.content : "";
    switch (c.name) {
      case "set_reminder":
        return when(c.input.at) ? `Done, I'll remind you ${when(c.input.at)}.` : "Reminder set.";
      case "follow_up":
        return when(c.input.at) ? `I'll check back ${when(c.input.at)}.` : "I'll check back.";
      case "remind_at_place":
        return `Done, I'll remind you when you ${c.input.on === "leave" ? "leave" : "get to"} ${one(c.input.place, 40) || "there"}.`;
      case "cancel_reminder":
        return "Cancelled.";
      case "create_task":
        return /worker is on/i.test(content) ? `On it: ${one(c.input.title)}.` : `Added to your tasks: ${one(c.input.title)}.`;
      case "update_task":
        return "Updated.";
      case "remember":
        return "Noted.";
      case "forget":
        return "Forgotten.";
      case "remember_person":
        return `Noted about ${one(c.input.name, 40)}.`;
      case "save_skill":
        return "Learned it. I'll do it that way from now on.";
      default:
        return c.name in PROPOSALS ? "Here it is for you to check." : "";
    }
  });
  return [...new Set(lines.filter(Boolean))].join(" ");
}

/** Tools that only look things up: what Lyra says alongside one was said before Lyra had the answer. */
/** (0.62) "Searching your mail" → "Searched your mail", for a step with nothing more specific to say. */
export function pastTense(label: string): string | null {
  const PAST: [RegExp, string][] = [
    [/^Searching\b/, "Searched"], [/^Checking\b/, "Checked"], [/^Reading\b/, "Read"], [/^Looking at\b/, "Looked at"],
    [/^Opening\b/, "Opened"], [/^Looking through\b/, "Looked through"], [/^Adding up\b/, "Added up"], [/^Clicking\b/, "Clicked"], [/^Typing\b/, "Typed"], [/^Picking\b/, "Picked"], [/^Going back\b/, "Went back"],
  ];
  for (const [re, to] of PAST) if (re.test(label)) return label.replace(re, to);
  return null;
}

/** (0.62) one plain line for a lookup the model made, or null for tools that aren't lookups (cards, memory, reactions…). */
export function stepLine(name: string, input: Record<string, unknown>, ctx: { connectors: { owns(n: string): boolean; label(n: string): string } }): string | null {
  const str = (k: string) => String(input[k] ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const quoted = (v: string) => (v ? ` for “${v}”` : "");
  const day = (iso: string) => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : null;
    return d && !isNaN(+d) ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  };
  switch (name) {
    case "gmail__search_mail": return str("query") ? `Searched your mail${quoted(str("query"))}` : "Looked at your latest mail";
    case "gmail__read_thread": return "Read an email thread";
    case "calendar__list_events": {
      const from = day(str("from")), to = day(str("to"));
      const when = from ? (to && to !== from ? ` from ${from} to ${to}` : ` for ${from}`) : "";
      return `Checked your calendar${when}${str("query") ? `, looking for “${str("query")}”` : ""}`;
    }
    case "drive__search_files": return str("query") ? `Searched your files${quoted(str("query"))}` : "Looked at your recent files";
    case "drive__read_file": return "Read a file in your Drive";
    case "browser__open_page": {
      try { return `Opened ${new URL(str("url")).hostname.replace(/^www\./, "")}`; } catch { return "Opened a page"; }
    }
    case "look_up_person": return str("name") ? `Looked up ${str("name")}` : null;
    case "find_contact": return str("name") ? `Looked for ${str("name")} in your contacts` : null;
    case "life_admin": return "Checked your bills, subscriptions and deliveries";
    case "list_tasks": return "Checked your tasks";
    case "list_routines": return "Checked your routines";
    case "read_doc": return "Read one of your docs";
    case "read_channel": return str("channel") ? `Read the ${str("channel")} chat` : null;
    case "use_skill": return str("name") ? `Followed your “${str("name")}” skill` : null;
  }
  return ctx.connectors.owns(name) ? pastTense(ctx.connectors.label(name)) : null;
}

export const LOOKUPS = new Set(["life_admin", "read_doc", "read_channel", "list_tasks", "list_routines", "look_up_person", "find_contact", "use_skill"]);

/** Do these two pieces say the same thing? (An answer written again after a tool was refused.) */
export function sameSaid(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const A = words(a);
  const B = words(b);
  if (A.size < 6) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / A.size >= 0.7;
}
