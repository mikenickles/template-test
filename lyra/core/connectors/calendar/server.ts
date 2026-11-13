/**
 * Lyra's Google Calendar connector: an in-app MCP server that can only look
 * at your schedule. Google grants only calendar.readonly, and there is no
 * tool that creates, changes or answers an event.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenSource } from "../google.ts";
import { googleGet } from "../google-http.ts";

const API = "https://www.googleapis.com/calendar/v3";

export interface CalEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; responseStatus?: string }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  hangoutLink?: string;
}

function fmtDay(d: Date, tz: string) {
  return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(d: Date, tz: string) {
  return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

/** One readable line (plus detail lines) per event, in the phone's time zone. */
export function describeEvent(e: CalEvent, tz: string): string {
  let when: string;
  if (e.start?.date) {
    // all-day: end date is exclusive
    const s = new Date(`${e.start.date}T12:00:00Z`);
    const endDate = e.end?.date ? new Date(new Date(`${e.end.date}T12:00:00Z`).getTime() - 86_400_000) : s;
    when = endDate.getTime() > s.getTime() ? `${fmtDay(s, "UTC")} to ${fmtDay(endDate, "UTC")}, all day` : `${fmtDay(s, "UTC")}, all day`;
  } else if (e.start?.dateTime) {
    const s = new Date(e.start.dateTime);
    const en = e.end?.dateTime ? new Date(e.end.dateTime) : undefined;
    const sameDay = en && fmtDay(s, tz) === fmtDay(en, tz);
    when = `${fmtDay(s, tz)}, ${fmtTime(s, tz)}${en ? ` to ${sameDay ? fmtTime(en, tz) : `${fmtDay(en, tz)} ${fmtTime(en, tz)}`}` : ""}`;
  } else when = "(no time)";

  const lines = [`- ${when} · ${e.summary?.trim() || "(no title)"}${e.status === "cancelled" ? " (cancelled)" : ""}`];
  if (e.location) lines.push(`  where: ${e.location}`);
  const me = e.attendees?.find((a) => a.self);
  if (me?.responseStatus && me.responseStatus !== "accepted") lines.push(`  your answer: ${me.responseStatus === "needsAction" ? "not answered" : me.responseStatus}`);
  const others = (e.attendees ?? []).filter((a) => !a.self);
  if (others.length) lines.push(`  with: ${others.slice(0, 6).map((a) => a.displayName || a.email).join(", ")}${others.length > 6 ? ` and ${others.length - 6} more` : ""}`);
  if (e.organizer && !e.organizer.self && (e.organizer.displayName || e.organizer.email)) lines.push(`  organizer: ${e.organizer.displayName || e.organizer.email}`);
  if (e.hangoutLink) lines.push(`  video call: yes`);
  // for moving it or answering it with the user's OK (propose_reschedule / propose_rsvp)
  if (e.id && e.status !== "cancelled") lines.push(`  id: ${e.id}${e.organizer?.self || !e.organizer ? " (yours)" : ""}`);
  if (e.description) lines.push(`  notes: ${e.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}`);
  return lines.join("\n");
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

/** Accepts "2026-11-14", or a full ISO time; returns an ISO timestamp. */
export function toInstant(s: string, endOfDay = false): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`);
    return d.toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`"${s}" isn't a date I understand. Use YYYY-MM-DD.`);
  return d.toISOString();
}

export function createCalendarServer(tokens: TokenSource, fetchFn: typeof fetch = fetch, timeZone?: string): McpServer {
  const g = googleGet(API, "Google Calendar", tokens, fetchFn);
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const server = new McpServer({ name: "lyra-calendar", version: "0.1.0" });

  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "See events on the user's calendar in a date range (default: the next 7 days), optionally matching words. Times are in the user's time zone.",
      inputSchema: {
        from: z.string().optional().describe("Start date, YYYY-MM-DD (default: now)."),
        to: z.string().optional().describe("End date, YYYY-MM-DD, inclusive."),
        days: z.number().int().min(1).max(62).optional().describe("Instead of 'to': how many days from 'from' (default 7)."),
        query: z.string().optional().describe("Only events whose text matches these words."),
        calendar_id: z.string().optional().describe("A calendar id from list_calendars (default: the main calendar)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ from, to, days, query, calendar_id }) => {
      const timeMin = from ? toInstant(from) : new Date().toISOString();
      const timeMax = to ? toInstant(to, true) : new Date(new Date(timeMin).getTime() + (days ?? 7) * 86_400_000).toISOString();
      const cal = encodeURIComponent(calendar_id || "primary");
      const r = await g.json<{ items?: CalEvent[]; summary?: string }>(`/calendars/${cal}/events`, {
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
        q: query || undefined,
      });
      const items = (r.items ?? []).filter((e) => e.status !== "cancelled");
      const range = `${fmtDay(new Date(timeMin), tz)} to ${fmtDay(new Date(timeMax), tz)}`;
      if (!items.length) return text(`No events ${query ? `matching "${query}" ` : ""}from ${range}.`);
      return text(`${items.length} event(s) from ${range} (${tz}):\n${items.map((e) => describeEvent(e, tz)).join("\n")}`);
    },
  );

  server.registerTool(
    "list_calendars",
    {
      title: "List calendars",
      description: "The calendars the user can see (their own, family, shared), with ids for list_events.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const r = await g.json<{ items?: { id: string; summary?: string; primary?: boolean; accessRole?: string }[] }>("/users/me/calendarList", {
        maxResults: 50,
      });
      const items = r.items ?? [];
      if (!items.length) return text("No calendars found.");
      return text(items.map((c) => `- ${c.summary ?? c.id}${c.primary ? " (main)" : ""} · id: ${c.id}`).join("\n"));
    },
  );

  return server;
}
