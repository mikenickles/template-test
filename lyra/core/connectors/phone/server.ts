/**
 * The phone's notifications as a connector (0.45): texts, chats, deliveries and app alerts,
 * kept on the phone once the user turns on Notification access. It can only look. Results
 * come back wrapped as outside content like mail, so nothing in a notification can steer Lyra.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface PhoneNotice {
  app: string;
  pkg: string;
  title: string;
  text: string;
  /** ms since 1970 */
  at: number;
  /** a chat or text message (not an app alert) */
  msg?: boolean;
}

export interface NoticeSource {
  recent(sinceMs: number): Promise<PhoneNotice[]>;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

/** "Today 3:42 PM", "Yesterday 9:10 AM" or "Tue 9:10 AM", in the user's zone */
export function noticeTime(at: number, timeZone?: string, now = Date.now()): string {
  const day = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  const time = new Date(at).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  if (day(at) === day(now)) return `Today ${time}`;
  if (day(at) === day(now - 86_400_000)) return `Yesterday ${time}`;
  return `${new Date(at).toLocaleDateString("en-US", { timeZone, weekday: "short" })} ${time}`;
}

/** One line each, newest first: "- Today 3:42 PM · WhatsApp · Mom: Are you coming Sunday?" */
export function describeNotices(list: PhoneNotice[], timeZone?: string, now = Date.now()): string {
  return [...list]
    .sort((a, b) => b.at - a.at)
    .map((n) => `- ${noticeTime(n.at, timeZone, now)} · ${n.app}${n.msg ? " (message)" : ""} · ${n.title}${n.text ? `: ${n.text}` : ""}`)
    .join("\n");
}

export function filterNotices(list: PhoneNotice[], o: { app?: string; search?: string; messagesOnly?: boolean }): PhoneNotice[] {
  const app = o.app?.trim().toLowerCase();
  const words = (o.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((n) => {
    if (o.messagesOnly && !n.msg) return false;
    if (app && !n.app.toLowerCase().includes(app) && !n.pkg.toLowerCase().includes(app)) return false;
    const hay = `${n.app} ${n.title} ${n.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function createPhoneServer(source: NoticeSource, timeZone?: string): McpServer {
  const server = new McpServer({ name: "lyra-phone", version: "0.1.0" });
  server.registerTool(
    "recent_notifications",
    {
      title: "Recent phone notifications",
      description:
        "The notifications on the user's phone from the last hours (up to 48): texts and chats, deliveries, bank and app alerts. Newest first. Use it for 'did anyone text me?', 'what did Mom say?', 'is my package here?', or to see what's waiting when briefing. Sign-in codes are blanked out.",
      inputSchema: {
        hours: z.number().min(1).max(48).optional().describe("How far back, in hours (default 12)."),
        app: z.string().optional().describe("Only this app, e.g. 'WhatsApp', 'Messages', 'Amazon'."),
        search: z.string().optional().describe("Only ones containing these words, e.g. a name."),
        messages_only: z.boolean().optional().describe("Only texts and chats."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ hours, app, search, messages_only }) => {
      const since = Date.now() - (hours ?? 12) * 3600_000;
      const list = filterNotices(await source.recent(since), { app, search, messagesOnly: messages_only });
      if (!list.length) return text(`No notifications${app ? ` from ${app}` : ""}${search ? ` mentioning "${search}"` : ""} in the last ${hours ?? 12} hours.`);
      const shown = list.sort((a, b) => b.at - a.at).slice(0, 60);
      return text(`${describeNotices(shown, timeZone)}${list.length > shown.length ? `\n(${list.length - shown.length} older not shown)` : ""}`);
    },
  );
  return server;
}
