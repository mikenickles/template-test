import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { directionsLink, driveSeconds, leaveAt, matchPlace, tripsFrom } from "../core/places.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });

/** The phone's location, made up: at home, and a Costco 5 km away. */
const phonePlaces = (access: "none" | "while-open" | "always" = "always") => ({
  access: async () => access,
  here: async () => ({ lat: 38.58, lng: -121.49 }),
  find: async (q: string) => (/costco/i.test(q) ? [{ lat: 38.62, lng: -121.45, label: "Costco, 1600 Expo Pkwy, Sacramento, CA" }] : []),
});

describe("place reminders", () => {
  it("are set from chat by a saved place's name or by looking one up near you, and go off once", async () => {
    const provider = new FakeProvider([
      call("remind_at_place", { text: "Grab milk", place: "Costco" }),
      say("Done, I'll remind you when you get there."),
      call("remind_at_place", { text: "Call Mom", place: "home", on: "arrive" }, "c2"),
      say("Done."),
      call("remind_at_place", { text: "x", place: "the moon" }, "c3"),
      say("Couldn't find it."),
    ]);
    const lyra = await Lyra.start(platform({ provider, places: phonePlaces() }));
    await lyra.savePlace("Home", { lat: 38.58, lng: -121.49 });
    expect(matchPlace(lyra.places(), "my home")?.name).toBe("Home");

    await lyra.chat("remind me to grab milk when I get to Costco", noop);
    await lyra.chat("remind me to call mom when I get home", noop);
    const { message } = await lyra.chat("remind me about something on the moon", noop);
    expect(message.meta.tools).toContainEqual({ name: "remind_at_place", ok: false });
    expect(lyra.placeReminders().map((r) => [r.text, r.place, r.on_event])).toEqual([
      ["Grab milk", "Costco (Costco, 1600 Expo Pkwy)", "arrive"],
      ["Call Mom", "Home", "arrive"],
    ]);
    // Lyra sees them, and can cancel one by its #p id
    expect(provider.requests.at(-1)!.system).toMatch(/#p1 on arriving at Costco/);

    // the phone's geofence went off (it showed the notification itself): done, said in the chat, once
    const id = lyra.placeReminders()[0].id;
    await lyra.placeRemindersFired([id]);
    await lyra.placeRemindersFired([id]);
    expect(lyra.placeReminders().map((r) => r.text)).toEqual(["Call Mom"]);
    expect(lyra.messages(null).filter((m) => m.meta.placeReminder).map((m) => m.content)).toEqual(["Reminder at Costco (Costco, 1600 Expo Pkwy): Grab milk"]);
  });

  it("on a computer, only a saved place works; without location, it says what to do", async () => {
    const lyra = await Lyra.start(platform());
    await expect(lyra.remindAtPlace("Grab milk", "Costco", "arrive", null)).rejects.toThrow(/looking places up works on the phone/);
    await lyra.savePlace("Work", { lat: 1, lng: 2 });
    expect((await lyra.remindAtPlace("Water the plant", "work", "leave", null)).on_event).toBe("leave");
    const off = await Lyra.start(platform({ places: phonePlaces("none") }));
    await expect(off.remindAtPlace("x", "Costco", "arrive", null)).rejects.toThrow(/Location isn't allowed/);
    await expect(off.savePlace("Home")).rejects.toThrow(/Allow location first/);
  });
});

describe("leave-now", () => {
  it("picks events with a real place in the next hours, and works out when to leave", () => {
    const now = new Date("2026-11-14T16:00:00Z");
    const trips = tripsFrom(
      [
        { id: "a", summary: "Soccer", location: "Del Dayo field", start: { dateTime: "2026-11-14T17:00:00Z" } },
        { id: "b", summary: "Standup", location: "https://meet.google.com/abc", start: { dateTime: "2026-11-14T17:30:00Z" } },
        { id: "c", summary: "No school", location: "School", start: { date: "2026-11-14" } },
        { id: "d", summary: "Cancelled", status: "cancelled", location: "Gym", start: { dateTime: "2026-11-14T18:00:00Z" } },
        { id: "e", summary: "Dinner", location: "Nona's", start: { dateTime: "2026-11-15T03:00:00Z" } },
      ],
      now,
    );
    expect(trips.map((t) => t.id)).toEqual(["a"]);
    // 18 minutes' drive: leave 28 minutes before (10 minutes' margin)
    expect(leaveAt("2026-11-14T17:00:00Z", 18 * 60)!.toISOString()).toBe("2026-11-14T16:32:00.000Z");
    // 40 minutes: a 15-minute margin
    expect(leaveAt("2026-11-14T17:00:00Z", 40 * 60)!.toISOString()).toBe("2026-11-14T16:05:00.000Z");
    // just around the corner: no nudge
    expect(leaveAt("2026-11-14T17:00:00Z", 120)).toBeNull();
    expect(directionsLink({ lat: 1.5, lng: -2 })).toBe("https://www.google.com/maps/dir/?api=1&destination=1.5,-2&travelmode=driving");
  });

  it("asks OpenStreetMap for the drive, and copes when it can't answer", async () => {
    const asked: string[] = [];
    const ok = (async (url: string) => {
      asked.push(url);
      return Response.json({ code: "Ok", routes: [{ duration: 1080.4 }] });
    }) as unknown as typeof fetch;
    expect(await driveSeconds({ lat: 38.58, lng: -121.49 }, { lat: 38.62, lng: -121.45 }, ok)).toBe(1080.4);
    expect(asked[0]).toBe("https://router.project-osrm.org/route/v1/driving/-121.49,38.58;-121.45,38.62?overview=false");
    const down = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
    expect(await driveSeconds({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, down)).toBeNull();
  });
});

describe("voice memos", () => {
  it("become a card of things to tap, like a scanned paper", async () => {
    const lyra = await Lyra.start(platform({ provider: new FakeProvider() }));
    const { message } = await lyra.chat("Voice memo: call the plumber about Thursday and book Rowan's dentist and buy a gift for Dana", noop);
    expect(message.meta.scan?.title).toBe("From your memo");
    expect(message.meta.scan?.items.map((i) => i.text)).toEqual(["call the plumber about Thursday", "book Rowan's dentist", "buy a gift for Dana"]);
    await lyra.scanAction(message.id, "all");
    expect(lyra.reminders()).toHaveLength(1);
    expect(lyra.tasks({}).length).toBe(2);
  });
});
