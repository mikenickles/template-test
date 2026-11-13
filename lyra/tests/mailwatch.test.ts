import { describe, expect, it } from "vitest";
import { GMAIL_READONLY } from "../core/connectors/google.ts";
import { Lyra } from "../core/lyra.ts";
import { fresh, parseMailList, senderName, watchQuery } from "../core/mailwatch.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { fakeGoogle, platform } from "./helpers.ts";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });

/** A Gmail inbox that grows. */
function inbox() {
  const mail: { id: string; thread: string; from: string; subject: string; body: string }[] = [];
  const queries: string[] = [];
  const fetch = (async (input: string) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("/profile")) return Response.json({ emailAddress: "me@example.com" });
    if (u.pathname.endsWith("/messages")) {
      queries.push(u.searchParams.get("q") ?? "");
      return Response.json({ messages: mail.map((m) => ({ id: m.id })) });
    }
    const id = u.pathname.match(/\/messages\/([0-9a-f]+)$/)?.[1];
    const m = mail.find((x) => x.id === id);
    if (m) return Response.json({ id: m.id, threadId: m.thread, snippet: m.body, payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] } });
    const t = mail.find((x) => u.pathname.endsWith(`/threads/${x.thread}`));
    if (t) return Response.json({ messages: [{ id: t.id, threadId: t.thread, payload: { mimeType: "text/plain", headers: [{ name: "From", value: t.from }], body: { data: b64(t.body) } } }] });
    return new Response("nope", { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { mail, queries, fetch };
}

describe("mail watch", () => {
  it("reads search results, names senders, and builds a search for the people who matter", () => {
    const text = '<untrusted_data source="gmail">2 message(s) for "x":\n- id: aa11 | thread: bb22 (unread)\n  from: Rebecca Hickey <rh@school.org>\n  date: Fri\n  subject: Field trip moved\n  preview: hi\n- id: cc33 | thread: dd44\n  from: <noreply@shop.com>\n  date: Fri\n  subject: Sale\n  preview: x</untrusted_data>';
    expect(parseMailList(text)).toEqual([
      { id: "aa11", thread: "bb22", from: "Rebecca Hickey <rh@school.org>", subject: "Field trip moved" },
      { id: "cc33", thread: "dd44", from: "<noreply@shop.com>", subject: "Sale" },
    ]);
    expect(senderName("Rebecca Hickey <rh@school.org>")).toBe("Rebecca Hickey");
    expect(senderName("<noreply@shop.com>")).toBe("noreply@shop.com");
    const q = watchQuery([{ emails: ["rh@school.org", "bad address", "Dana@Example.com"] }, { emails: [] }]);
    expect(q).toContain("(is:important OR from:rh@school.org OR from:dana@example.com)");
    expect(q).toContain("-category:promotions");
    expect(fresh([{ id: "a", thread: "t", from: "", subject: "" }, { id: "b", thread: "u", from: "", subject: "" }], ["a"]).fresh.map((i) => i.id)).toEqual(["b"]);
  });

  it("checks every few minutes without the AI, and only asks the AI about something new; its buttons ride on the notification", async () => {
    const box = inbox();
    box.mail.push({ id: "aa01", thread: "ab01", from: "Old <old@x.com>", subject: "Old news", body: "from last week" });
    const asked: GenerateRequest[] = [];
    const provider: ModelProvider = {
      id: "anthropic",
      model: "test",
      generate: async (req) => {
        asked.push(req);
        return asked.length === 1
          ? call("gmail__read_thread", { thread_id: "ab02" })
          : call("post", { message: "Rebecca says the field trip moved to Thursday. Slip still due Tuesday.", options: ["Draft a reply", "Remind me tonight"] }, "c2");
      },
    };
    const google = fakeGoogle([GMAIL_READONLY]);
    google.consented = true;
    const lyra = await Lyra.start(platform({ provider, google, fetch: box.fetch }));
    await lyra.connectGoogle("gmail");
    const notices: unknown[] = [];
    lyra.onChange((e) => e.type === "message" && "notify" in e && e.notify && notices.push(e.notify));
    const noon = new Date("2026-11-13T20:00:00Z"); // noon in Los Angeles
    const settle = async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
      await lyra.routinesRunner.settle();
    };

    // the first look only learns what's there
    expect(lyra.tickMailWatch(noon)).toBe(true);
    await settle();
    expect(asked).toHaveLength(0);
    expect(box.queries[0]).toContain("is:important");
    // two minutes later: too soon to look again
    expect(lyra.tickMailWatch(new Date(noon.getTime() + 2 * 60_000))).toBe(false);

    // nothing new: a look, no AI
    lyra.tickMailWatch(new Date(noon.getTime() + 6 * 60_000));
    await settle();
    expect(asked).toHaveLength(0);

    // something new: the AI reads it, and the post's buttons go on the notification
    box.mail.push({ id: "aa02", thread: "ab02", from: "Rebecca Hickey <rh@school.org>", subject: "Field trip moved", body: "Now Thursday." });
    lyra.tickMailWatch(new Date(noon.getTime() + 12 * 60_000));
    await settle();
    expect(asked.length).toBe(2);
    expect(asked[0].system).toContain('from Rebecca Hickey <rh@school.org>, "Field trip moved"');
    expect(asked[0].system).not.toContain("Old news");
    expect(notices).toEqual([{ title: "Mail from Rebecca Hickey", body: "Rebecca says the field trip moved to Thursday. Slip still due Tuesday.", options: ["Draft a reply", "Remind me tonight"] }]);
    expect(lyra.messages(null).at(-1)!.meta).toMatchObject({ headsUp: true, suggestions: ["Draft a reply", "Remind me tonight"] });

    // in quiet hours it doesn't look; turned off, it doesn't either
    expect(lyra.tickMailWatch(new Date("2026-11-14T07:00:00Z"))).toBe(false); // 11 PM
    await lyra.saveSettings({ proactive: { mailWatch: false } });
    expect(lyra.tickMailWatch(new Date(noon.getTime() + 60 * 60_000))).toBe(false);
  });
});

describe("scanning a paper", () => {
  it("shows what's on it as a card, and a tap sets the reminder or adds it to the list", async () => {
    const { checkScan, remindAt, actionFor } = await import("../core/scan.ts");
    const { FakeProvider } = await import("../core/providers/fake.ts");
    expect(() => checkScan({ items: [] })).toThrow(/Nothing to show/);
    expect(checkScan({ items: [{ kind: "weird", text: "x", when: "next week" }] }).items[0]).toEqual({ kind: "todo", text: "x" });
    expect(remindAt({ kind: "deadline", text: "Slip", when: "2026-11-17" })).toBe("2026-11-16 09:00");
    expect(remindAt({ kind: "date", text: "Trip", when: "2026-11-20 08:45" })).toBe("2026-11-20 07:45");
    expect(remindAt({ kind: "date", text: "No school", when: "2026-11-25" })).toBe("2026-11-25 08:00");
    expect(actionFor({ kind: "amount", text: "$12" })).toBeNull();

    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const provider = new FakeProvider([
      call("show_scan", {
        title: "Room 12 slip",
        items: [
          { kind: "deadline", text: "Permission slip and $12", when: day(5) },
          { kind: "todo", text: "Find two parent drivers" },
          { kind: "date", text: "Old event", when: day(-3) },
        ],
      }),
      { parts: [{ type: "text", text: "Two things need you before the trip." }], stop: "end" },
    ]);
    const lyra = await Lyra.start(platform({ provider }));
    const png = { name: "slip.png", mediaType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" };
    const { message } = await lyra.chat("Scan this", { text: () => {}, status: () => {}, memory: () => {} }, null, [png]);
    expect(message.meta.scan?.items).toHaveLength(3);
    // one tap: a reminder the day before at 9
    const after = await lyra.scanAction(message.id, 0);
    expect(after.meta.scan!.items[0].done).toBe("remind");
    expect(lyra.reminders().map((r) => r.text)).toEqual(["Permission slip and $12"]);
    // Do all: the to-do goes on the list; a date already past becomes a to-do rather than a reminder in the past
    const all = await lyra.scanAction(message.id, "all");
    expect(all.meta.scan!.items.map((i) => i.done)).toEqual(["remind", "task", "task"]);
    expect(lyra.tasks({}).map((t) => [t.title, t.status])).toEqual(expect.arrayContaining([["Find two parent drivers", "up_next"]]));
    // nothing is done twice
    await lyra.scanAction(message.id, "all");
    expect(lyra.reminders()).toHaveLength(1);
  });
});

describe("the Memory page", () => {
  it("adds, changes and forgets one note at a time", async () => {
    const lyra = await Lyra.start(platform());
    let v = await lyra.editMemoryNote("Rules", null, "I'm vegetarian");
    expect(v.sections.find((s) => s.name === "Rules")!.items).toEqual(["I'm vegetarian"]);
    v = await lyra.editMemoryNote("Rules", "I'm vegetarian", "I'm vegetarian, but fish is fine");
    expect(v.sections.find((s) => s.name === "Rules")!.items).toEqual(["I'm vegetarian, but fish is fine"]);
    v = await lyra.editMemoryNote("Rules", "I'm vegetarian, but fish is fine", null);
    expect(v.sections.find((s) => s.name === "Rules")!.items).toEqual([]);
    await expect(lyra.editMemoryNote("Rules", null, " ")).rejects.toThrow(/Write the note/);
    // every change can be undone from Recent changes
    expect(v.history.length).toBeGreaterThanOrEqual(3);
  });
});
