// 0.45: more things Lyra can do with the user's OK (move an event, answer an invitation,
// archive mail, write a text), the phone's notifications as a connector, and live progress.
import { describe, expect, it } from "vitest";
import { checkRsvp, checkText } from "../core/actions.ts";
import { describeNotices, filterNotices, type PhoneNotice } from "../core/connectors/phone/server.ts";
import { GMAIL_MODIFY, NeedsConsentError } from "../core/connectors/google.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { addStep, createTask, log, updateTask } from "../core/tasks.ts";
import type { DB } from "../core/db.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const TZ = "America/Los_Angeles";

function google() {
  const granted = new Set<string>();
  return {
    available: true,
    asked: [] as string[][],
    async authorize(scopes: string[], interactive: boolean) {
      this.asked.push(scopes);
      if (interactive) scopes.forEach((s) => granted.add(s));
      if (!scopes.every((s) => granted.has(s))) throw new NeedsConsentError();
      return { accessToken: `tok:${scopes.join(",")}`, grantedScopes: [...granted, "openid"], email: "sam@example.com" };
    },
  };
}

/** Gmail and Calendar, with one event the user organizes and one invitation. */
function apis() {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const events: Record<string, Record<string, unknown>> = {
    mine123: {
      id: "mine123",
      summary: "Team sync",
      start: { dateTime: "2026-11-20T17:00:00Z" },
      end: { dateTime: "2026-11-20T17:30:00Z" },
      organizer: { email: "sam@example.com", self: true },
      attendees: [{ email: "sam@example.com", self: true, responseStatus: "accepted" }, { email: "dana@example.com", responseStatus: "accepted" }],
    },
    invite456: {
      id: "invite456",
      summary: "Book club",
      start: { dateTime: "2026-11-21T02:00:00Z" },
      end: { dateTime: "2026-11-21T03:00:00Z" },
      organizer: { email: "lee@example.com", displayName: "Lee" },
      attendees: [{ email: "lee@example.com", organizer: true, responseStatus: "accepted" }, { email: "sam@example.com", self: true, responseStatus: "needsAction" }],
    },
  };
  const fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const u = String(url);
    calls.push({ method, url: u, body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    const ev = u.match(/\/calendars\/primary\/events\/([A-Za-z0-9_-]+)/);
    if (ev) return events[ev[1]] ? json({ ...events[ev[1]], htmlLink: `https://calendar.google.com/event?eid=${ev[1]}` }) : json({ error: { message: "Not Found" } }, 404);
    const th = u.match(/\/threads\/([0-9a-f]+)(\/modify)?/);
    if (th && th[2]) return json({ id: th[1] });
    if (th)
      return json({ messages: [{ payload: { headers: [{ name: "Subject", value: `Newsletter ${th[1]}` }, { name: "From", value: "Shop <news@shop.example>" }] } }] });
    if (u.includes("/profile")) return json({ emailAddress: "sam@example.com" });
    return json({ error: { message: "unexpected" } }, 404);
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

async function setup(script: GenerateResult[], extra: Partial<Parameters<typeof platform>[0]> = {}) {
  const g = google();
  const api = apis();
  const provider = new FakeProvider(script);
  const lyra = await Lyra.start(platform({ provider, google: g, fetch: api.fetch, timeZone: TZ, ...extra }));
  await lyra.connectGoogle("gmail");
  await lyra.connectGoogle("calendar");
  return { lyra, g, api, provider };
}

describe("more actions with your OK", () => {
  it("moves an event the user organizes, keeping its length, only after the tap", async () => {
    const { lyra, api, provider } = await setup([say("Sure."), call("propose_reschedule", { event_id: "mine123", start: "2026-11-20 15:00" }), say("Ready for you to check.")]);
    await lyra.chat("hi", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).not.toContain("propose_reschedule");
    await lyra.allowActions("event", true);
    const { message } = await lyra.chat("Move team sync to 3pm", noop);
    expect(provider.requests[1].tools.map((t) => t.name)).toEqual(expect.arrayContaining(["propose_reschedule", "propose_rsvp"]));
    const id = message.meta.actions![0];
    const a = lyra.action(id)!;
    expect(a).toMatchObject({ kind: "move", status: "proposed", payload: { title: "Team sync", start: "2026-11-20 15:00", end: "2026-11-20 15:30", guests: 1 } });
    expect(api.calls.filter((c) => c.method !== "GET")).toEqual([]);

    const done = await lyra.decideAction(id, "do");
    expect(done).toMatchObject({ status: "done", result: { did: "moved" } });
    const patch = api.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/events/mine123?sendUpdates=all");
    expect(patch.body).toMatchObject({ start: { dateTime: "2026-11-20T23:00:00.000Z" }, end: { dateTime: "2026-11-20T23:30:00.000Z" } });
  });

  it("won't move someone else's meeting, and answers an invitation with only the user's own reply changed", async () => {
    const { lyra, api } = await setup([
      call("propose_reschedule", { event_id: "invite456", start: "2026-11-21 19:00" }),
      call("propose_rsvp", { event_id: "invite456", response: "no", note: "Sorry, away that week!" }, "c2"),
      say("Ready."),
    ]);
    await lyra.allowActions("event", true);
    const { message } = await lyra.chat("Move book club, or else say no", noop);
    expect(message.meta.actions).toHaveLength(1);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a).toMatchObject({ kind: "rsvp", payload: { title: "Book club", response: "declined", organizer: "Lee" } });
    await lyra.decideAction(a.id, "do");
    const patch = api.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body!.attendees).toEqual([
      { email: "lee@example.com", organizer: true, responseStatus: "accepted" },
      { email: "sam@example.com", self: true, responseStatus: "declined", comment: "Sorry, away that week!" },
    ]);
    expect(() => checkRsvp({ event_id: "invite456", response: "whatever" })).toThrow(/yes/);
  });

  it("archives mail only with its own permission, listing each thread straight from Gmail", async () => {
    const { lyra, g, api } = await setup([call("propose_archive", { thread_ids: ["aa11bb22", "cc33dd44"] }), say("Ready.")]);
    expect(lyra.state().actions.archive).toBe(false);
    await lyra.allowActions("archive", true);
    expect(g.asked.at(-1)).toEqual([GMAIL_MODIFY]);
    const { message } = await lyra.chat("Clear out those newsletters", noop);
    const a = lyra.action(message.meta.actions![0])!;
    expect(a).toMatchObject({ kind: "archive", payload: { threads: [{ id: "aa11bb22", subject: "Newsletter aa11bb22", from: "Shop" }, { id: "cc33dd44" }] } });
    expect(api.calls.filter((c) => c.method === "POST")).toEqual([]);
    await lyra.decideAction(a.id, "do");
    const posts = api.calls.filter((c) => c.method === "POST");
    expect(posts.map((p) => p.url)).toEqual([
      "https://gmail.googleapis.com/gmail/v1/users/me/threads/aa11bb22/modify",
      "https://gmail.googleapis.com/gmail/v1/users/me/threads/cc33dd44/modify",
    ]);
    expect(posts[0].body).toEqual({ removeLabelIds: ["INBOX"] });
  });

  it("writes a text that opens in Messages, only on a phone", async () => {
    const opened: [string, string][] = [];
    const sms = { compose: async (n: string, b: string) => void opened.push([n, b]) };
    const desk = await setup([]);
    expect(desk.lyra.state().actions.text).toBeNull();

    const { lyra, provider } = await setup([call("propose_text", { to: "Mom", number: "+1 (555) 010-2030", body: "Running 10 min late!" }), say("Ready to send.")], { sms });
    expect(lyra.state().actions.text).toBe(true);
    const { message } = await lyra.chat("Text mom I'm running late", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).toContain("propose_text");
    const a = lyra.action(message.meta.actions![0])!;
    expect(opened).toEqual([]);
    await lyra.decideAction(a.id, "do", { body: "Running 15 min late!" });
    expect(opened).toEqual([["+1 (555) 010-2030", "Running 15 min late!"]]);
    expect(lyra.action(a.id)).toMatchObject({ status: "done", result: { did: "opened" } });
    expect(() => checkText({ number: "call me", body: "hi" })).toThrow(/phone number/);
    await lyra.allowActions("text", false);
    expect(lyra.state().actions.text).toBe(false);
  });
});

describe("the phone's notifications", () => {
  const NOW = Date.parse("2026-11-13T22:00:00Z");
  const list: PhoneNotice[] = [
    { app: "WhatsApp", pkg: "com.whatsapp", title: "Mom", text: "Are you coming Sunday?", at: NOW - 3600_000, msg: true },
    { app: "Amazon", pkg: "com.amazon.mShop", title: "Delivered", text: "Your package was left at the front door", at: NOW - 7200_000 },
  ];

  it("lists them newest first and filters by app, words and messages", () => {
    expect(describeNotices(list, TZ, NOW)).toBe(
      "- Today 1:00 PM · WhatsApp (message) · Mom: Are you coming Sunday?\n- Today 12:00 PM · Amazon · Delivered: Your package was left at the front door",
    );
    expect(filterNotices(list, { app: "amazon" })).toHaveLength(1);
    expect(filterNotices(list, { search: "sunday mom" })).toHaveLength(1);
    expect(filterNotices(list, { messagesOnly: true }).map((n) => n.app)).toEqual(["WhatsApp"]);
  });

  it("is a read-only connector that follows Android's access, and reading it counts as outside content", async () => {
    let access = false;
    const notices = { access: async () => access, recent: async () => list.map((n) => ({ ...n, at: Date.now() - 3600_000 })) };
    const provider = new FakeProvider([call("phone__recent_notifications", { hours: 6 }), say("Mom asked if you're coming Sunday.")]);
    const lyra = await Lyra.start(platform({ provider, notices, timeZone: TZ }));
    expect(lyra.state().notices).toBe(false);
    await expect(lyra.allowNotices(true)).rejects.toThrow("NEEDS_ACCESS");
    access = true;
    await lyra.syncNotices();
    expect(lyra.state().notices).toBe(true);

    const { message } = await lyra.chat("Did anyone text me?", noop);
    const result = provider.requests[1].messages.at(-1)!.parts[0] as { content: string };
    expect(result.content).toMatch(/<untrusted_data source="phone">[^]*Mom: Are you coming Sunday\?/);
    expect(message.content).toMatch(/Sunday/);

    // turned off here, it stays off even though Android still allows it
    await lyra.allowNotices(false);
    await lyra.syncNotices();
    expect(lyra.state().notices).toBe(false);
    // taken away in Android settings: off here too
    await lyra.allowNotices(true);
    access = false;
    await lyra.syncNotices();
    expect(lyra.state().notices).toBe(false);
  });
});

describe("live progress", () => {
  it("lists the tasks being worked, with Lyra's latest step and the checklist so far", async () => {
    const lyra = await Lyra.start(platform({ timeZone: TZ }));
    const db = (lyra as unknown as { db: DB }).db;
    const t = createTask(db, { title: "Find a plumber", brief: "" }, "you");
    addStep(db, t.id, "Search reviews");
    addStep(db, t.id, "Compare quotes");
    expect(lyra.liveWork()).toEqual([]);
    updateTask(db, t.id, { status: "working" }, "lyra");
    db.run("INSERT INTO worker_runs (task_id) VALUES (?)", [t.id]);
    log(db, t.id, "worker", "Found 3 plumbers with good reviews");
    db.run("UPDATE task_steps SET done = 1 WHERE task_id = ? AND position = (SELECT MIN(position) FROM task_steps WHERE task_id = ?)", [t.id, t.id]);
    const [w] = lyra.liveWork();
    expect(w).toMatchObject({ id: t.id, title: "Find a plumber", note: "Found 3 plumbers with good reviews", done: 1, total: 2 });
    expect(Math.abs(w.since - Date.now())).toBeLessThan(10_000);
  });
});
