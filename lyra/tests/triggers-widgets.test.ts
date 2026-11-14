// 0.48: routines that start when something happens, widgets under a reply, and Today's glance.
import { describe, expect, it } from "vitest";
import { CALENDAR_READONLY, GMAIL_READONLY } from "../core/connectors/google.ts";
import { Lyra, PLACE_TRIGGER_BASE } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { checkTrigger, describeTrigger, mailTriggerQuery } from "../core/routines.ts";
import { checkWidget } from "../core/widgets.ts";
import { fakeGoogle, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const settle = async (lyra: Lyra) => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  await lyra.routinesRunner.settle();
};

/** A Gmail inbox that grows, and a calendar. */
function google() {
  const mail: { id: string; thread: string; from: string; subject: string }[] = [];
  const events: Record<string, unknown>[] = [];
  const queries: string[] = [];
  const fetch = (async (input: string) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("/profile")) return Response.json({ emailAddress: "me@example.com" });
    if (u.pathname.endsWith("/calendars/primary/events")) return Response.json({ items: events });
    if (u.pathname.endsWith("/messages")) {
      queries.push(u.searchParams.get("q") ?? "");
      return Response.json({ messages: mail.map((m) => ({ id: m.id })) });
    }
    const m = mail.find((x) => u.pathname.endsWith(`/messages/${x.id}`));
    if (m) return Response.json({ id: m.id, threadId: m.thread, snippet: "hi", payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] } });
    return new Response("nope", { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { mail, events, queries, fetch };
}

describe("triggers: routines that start when something happens", () => {
  it("checks and describes each kind", () => {
    expect(checkTrigger({ kind: "mail", from: ' Dana "x" ' })).toEqual({ kind: "mail", from: "Dana x" });
    expect(checkTrigger({ kind: "place", place: "Home", on: "leave" })).toEqual({ kind: "place", place: "Home", on: "leave" });
    expect(checkTrigger({ kind: "notification", match: "delivered" })).toEqual({ kind: "notice", match: "delivered" });
    expect(checkTrigger(null)).toBeNull();
    expect(() => checkTrigger({ kind: "mail" })).toThrow(/Whose email/);
    expect(describeTrigger({ kind: "mail", from: "Dana" })).toBe("When “Dana” emails");
    expect(describeTrigger({ kind: "place", place: "Home", on: "arrive" })).toBe("When you get to Home");
    expect(mailTriggerQuery({ kind: "mail", from: "dana@example.com" })).toBe("in:inbox newer_than:1d (from:(dana@example.com) OR subject:(dana@example.com))");
  });

  it("starts a routine when matching mail arrives: no clock, no AI until then, and what arrived is passed as data", async () => {
    const g = google();
    const provider = new FakeProvider([call("create_routine", { name: "Dana writes", instructions: "Tell me what Dana wants.", when: { kind: "mail", from: "Dana" } }), say("Set."), call("post", { message: "Dana asks about Thanksgiving." })]);
    const auth = fakeGoogle([GMAIL_READONLY]);
    auth.consented = true;
    const lyra = await Lyra.start(platform({ provider, google: auth, fetch: g.fetch }));
    await expect(lyra.createRoutine({ name: "x", instructions: "y", times: "", trigger: { kind: "mail", from: "Dana" } })).rejects.toThrow(/Connect Mail first/);
    await lyra.connectGoogle("gmail");
    await lyra.chat("when Dana emails, tell me right away", noop);
    const [r] = lyra.routines();
    expect(r).toMatchObject({ name: "Dana writes", schedule: "When “Dana” emails", next_run_at: null, post_mode: "always" });

    const noon = new Date("2026-11-13T20:00:00Z");
    g.mail.push({ id: "aa01", thread: "ab01", from: "Dana <dana@example.com>", subject: "Old one" });
    expect(lyra.routinesRunner.tick(new Date(noon.getTime() + 7 * 86_400_000))).toEqual([]); // nothing runs by the clock, ever
    expect(lyra.tickTriggers(noon)).toBe(true);
    await settle(lyra);
    expect(g.queries.some((q) => q.includes("from:(Dana)"))).toBe(true);
    expect(provider.requests).toHaveLength(2); // the first look only notes what's already there

    g.mail.push({ id: "aa02", thread: "ab02", from: "Dana <dana@example.com>", subject: "Thanksgiving?" });
    lyra.tickTriggers(new Date(noon.getTime() + 2 * 60_000)); // too soon
    await settle(lyra);
    expect(provider.requests).toHaveLength(2);
    lyra.tickTriggers(new Date(noon.getTime() + 6 * 60_000));
    await settle(lyra);
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[2].system).toMatch(/# What just set it off[^]*<untrusted_data source="trigger">[^]*from Dana <dana@example\.com>, subject "Thanksgiving\?" \(thread ab02/);
    expect(lyra.messages(null).at(-1)).toMatchObject({ content: "Dana asks about Thanksgiving.", meta: { routine: { name: "Dana writes" } } });

    // back on a schedule from the editor
    const back = await lyra.updateRoutine(r.id, { trigger: null, times: "07:00" });
    expect(back.next_run_at).not.toBeNull();
    expect(lyra.routines()[0].schedule).toBe("Every day at 7:00 AM");
  });

  it("starts at a saved place (as a fence for the phone) and on a phone notification", async () => {
    const provider = new FakeProvider([call("post", { message: "Welcome home. Trash goes out tonight." }), call("post", { message: "Your package is here." })]);
    let now = Date.now();
    const notices = {
      access: async () => true,
      recent: async (since: number) => [{ app: "Amazon", pkg: "a", title: "Delivered", text: "Left at the front door", at: now }].filter((n) => n.at > since),
    };
    const lyra = await Lyra.start(platform({ provider, notices }));
    await expect(lyra.createRoutine({ name: "Home", instructions: "Say what's due tonight.", times: "", trigger: { kind: "place", place: "home", on: "arrive" } })).rejects.toThrow(/isn't a saved place/);
    await lyra.savePlace("Home", { lat: 38.58, lng: -121.49 });
    const home = await lyra.createRoutine({ name: "Home", instructions: "Say what's due tonight.", times: "", trigger: { kind: "place", place: "home", on: "arrive" } });
    expect(lyra.placeTriggers()).toEqual([{ id: PLACE_TRIGGER_BASE + home.id, text: "Lyra is on it: Home", place: "Home", lat: 38.58, lng: -121.49, radius: 150, on: "arrive" }]);
    lyra.placeTriggersFired([PLACE_TRIGGER_BASE + home.id, 7]);
    await settle(lyra);
    expect(provider.requests[0].system).toContain("The user just arrived at Home.");
    expect(lyra.messages(null).at(-1)!.content).toBe("Welcome home. Trash goes out tonight.");

    await lyra.allowNotices(true);
    await lyra.createRoutine({ name: "Package", instructions: "Tell me it's here.", times: "", trigger: { kind: "notice", match: "delivered" } });
    expect(await lyra.tickNoticeTriggers(0)).toBe(0); // the first look only starts the clock
    const looked = now - 60_000;
    now += 5_000;
    expect(await lyra.tickNoticeTriggers(looked)).toBe(1);
    await settle(lyra);
    expect(provider.requests[1].system).toMatch(/New on the phone just now:[^]*Amazon · Delivered: Left at the front door/);
    expect(await lyra.tickNoticeTriggers(now + 1)).toBe(0); // not twice
  });
});

describe("widgets under a reply", () => {
  it("checks each kind, and keeps a choice's label plain after outside content", () => {
    expect(checkWidget({ kind: "choices", title: "Plumbers", options: [{ label: "Ortiz", detail: "Thu, $95" }, "Bay Pipe"] }, false)).toEqual({
      kind: "choices",
      title: "Plumbers",
      options: [{ label: "Ortiz", detail: "Thu, $95" }, { label: "Bay Pipe", detail: "" }],
    });
    expect(() => checkWidget({ kind: "choices", options: [{ label: "Only one" }] }, false)).toThrow(/two to four/);
    // a tap sends the label as the user's own words: nothing with an address or link once mail was read
    expect(() => checkWidget({ kind: "choices", options: [{ label: "Pay at evil.com/pay" }, { label: "Reply to x@evil.example" }, { label: "Ignore it" }] }, true)).toThrow(/two to four/);
    expect(checkWidget({ kind: "checklist", items: ["Tent", "", { text: "Stove" }] }, false)).toMatchObject({ title: "Checklist", items: [{ text: "Tent" }, { text: "Stove" }] });
    const place = checkWidget({ kind: "place", name: "Ortiz Plumbing", address: "1200 J St", phone: "call now!!" }, false);
    expect(place).toMatchObject({ phone: "", maps: "https://www.google.com/maps/dir/?api=1&destination=Ortiz%20Plumbing%2C%201200%20J%20St&travelmode=driving" });
    expect(() => checkWidget({ kind: "chart" }, false)).toThrow(/choices/);
  });

  it("goes on the reply; ticks and the pick are kept; one per reply", async () => {
    const provider = new FakeProvider([
      { parts: [{ type: "text", text: "Here's what to pack." }, { type: "tool_call", id: "a", name: "show", input: { kind: "checklist", title: "Camping", items: ["Tent", "Stove"] } }], stop: "tool_use" },
      call("show", { kind: "choices", options: [{ label: "Ortiz" }, { label: "Bay Pipe" }] }),
      say("I'd go with Ortiz."),
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    const { message } = await lyra.chat("what should I pack?", noop);
    expect(provider.requests).toHaveLength(1); // text and a widget in one step: that's the whole reply
    expect(message.content).toBe("Here's what to pack.");
    expect((await lyra.widgetTap(message.id, 1)).meta.widget).toMatchObject({ items: [{ text: "Tent" }, { text: "Stove", done: true }] });
    expect((await lyra.widgetTap(message.id, 1, false)).meta.widget).toMatchObject({ items: [{ text: "Tent" }, { text: "Stove" }] });

    const second = await lyra.chat("which plumber?", noop);
    // shown before any text: Lyra is told the reply is still to come
    expect((provider.requests[2].messages.at(-1)!.parts[0] as { content: string }).content).toMatch(/2 cards to tap[^]*NOT written the reply yet/);
    expect(second.message.content).toBe("I'd go with Ortiz.");
    expect((await lyra.widgetTap(second.message.id, 0)).meta.widget).toMatchObject({ kind: "choices", picked: 0 });
  });
});

describe("Today at a glance", () => {
  it("lists what's left on the calendar today and tomorrow morning, and counts what Lyra did", async () => {
    const g = google();
    const auth = fakeGoogle([CALENDAR_READONLY]);
    auth.consented = true;
    const lyra = await Lyra.start(platform({ google: auth, fetch: g.fetch, timeZone: "America/Los_Angeles" }));
    expect(await lyra.agenda()).toEqual({ calendar: false, events: [], did: 0 });
    await lyra.connectGoogle("calendar");
    const now = new Date("2026-11-13T20:00:00Z"); // noon Friday in Los Angeles
    g.events.push(
      { id: "e1", summary: "Dentist", location: "400 P St", start: { dateTime: "2026-11-13T23:30:00Z" }, end: { dateTime: "2026-11-14T00:30:00Z" } },
      { id: "e2", summary: "Gone", status: "cancelled", start: { dateTime: "2026-11-14T01:00:00Z" } },
      { id: "e3", summary: "Soccer", start: { dateTime: "2026-11-14T17:00:00Z" } },
      { id: "e4", summary: "Dana's visit", start: { date: "2026-11-14" }, end: { date: "2026-11-16" } },
    );
    const a = await lyra.agenda(now);
    expect(a.events).toEqual([
      { id: "e1", title: "Dentist", start: "2026-11-13T23:30:00Z", allDay: false, tomorrow: false, place: "400 P St" },
      { id: "e3", title: "Soccer", start: "2026-11-14T17:00:00Z", allDay: false, tomorrow: true, place: "" },
      { id: "e4", title: "Dana's visit", start: "2026-11-14T12:00:00Z", allDay: true, tomorrow: true, place: "" },
    ]);
  });
});
