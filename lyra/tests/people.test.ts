import { describe, expect, it } from "vitest";
import { DB } from "../core/db.ts";
import { Lyra } from "../core/lyra.ts";
import { findPerson, listPeople, rememberPerson } from "../core/people.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { localToDate } from "../core/reminders.ts";
import { applyTidy } from "../core/tidy.ts";
import { platform, SQL } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const LA = "America/Los_Angeles";

describe("people cards", () => {
  it("adds people and adds to their cards, matching names, nicknames and emails", async () => {
    const db = await DB.open(SQL);
    rememberPerson(db, { name: "Dana", relation: "sister", fact: "Birthday is March 3" });
    const r = rememberPerson(db, { name: "Dana Ortiz", email: "Dana@Example.com", alias: "D" });
    expect(r.created).toBe(false);
    expect(r.person).toMatchObject({ name: "Dana Ortiz", relation: "sister", emails: ["dana@example.com"], aliases: ["D"], notes: ["Birthday is March 3"] });
    expect(findPerson(db, "d")?.id).toBe(r.person.id);
    expect(findPerson(db, "dana@example.com")?.id).toBe(r.person.id);
    rememberPerson(db, { name: "Dana", fact: "Birthday is March 3" });
    expect(listPeople(db)[0].notes).toEqual(["Birthday is March 3"]);
    expect(() => rememberPerson(db, { name: "Lee", email: "not an email" })).toThrow(/isn't an email/);
  });

  it("Lyra saves people from chat, looks them up, and won't change a card after reading mail", async () => {
    const provider = new FakeProvider([
      call("remember_person", { name: "Ms. Patel", relation: "Rowan's teacher", email: "patel@school.org" }),
      say("Got it."),
      call("look_up_person", { name: "Ms. Patel" }),
      say("Her email is patel@school.org."),
      call("gmail__search_mail", { query: "from:school" }),
      call("remember_person", { name: "Ms. Patel", phone: "555 0100 22" }, "c2"),
      say("Want me to save her number?"),
    ]);
    const g = { available: true, authorize: async () => ({ accessToken: "t", grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"], email: "s@example.com" }) };
    const fetch = (async () => new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof globalThis.fetch;
    const lyra = await Lyra.start(platform({ provider, google: g, fetch }));
    await lyra.connectGoogle("gmail");
    const { message } = await lyra.chat("Rowan's teacher is Ms. Patel, patel@school.org", noop);
    expect(message.meta.people).toEqual([{ id: 1, name: "Ms. Patel", created: true }]);
    await lyra.chat("What's her email?", noop);
    expect(provider.requests[2].system).toMatch(/- Ms\. Patel: Rowan's teacher · patel@school\.org/);
    const looked = provider.requests[3].messages.at(-1)!.parts[0] as { content: string };
    expect(looked.content).toMatch(/Email: patel@school\.org/);
    const r = await lyra.chat("check the school mail", noop);
    expect(r.message.meta.tools).toContainEqual({ name: "remember_person", ok: false });
    expect(lyra.people()[0].phones).toEqual([]);
  });

  it("looks names up in the phone's contacts only when turned on", async () => {
    const provider = new FakeProvider([say("Hi"), call("find_contact", { name: "Lee" }), say("Found Lee.")]);
    const asked: string[] = [];
    const contacts = { available: true, allow: async () => true, find: async (q: string) => (asked.push(q), [{ name: "Lee Park", emails: ["lee@park.com"], phones: [] }]) };
    const lyra = await Lyra.start(platform({ provider, contacts }));
    await lyra.chat("hi", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).not.toContain("find_contact");
    expect(lyra.state().contacts).toBe(false);
    await lyra.allowContacts(true);
    await lyra.chat("email Lee", noop);
    expect(asked).toEqual(["Lee"]);
    const found = provider.requests.at(-1)!.messages.at(-1)!.parts[0] as { content: string };
    expect(found.content).toMatch(/untrusted_data[^]*Lee Park · lee@park\.com/);
    const none = await Lyra.start(platform());
    expect(none.state().contacts).toBeNull();
    await expect(none.allowContacts(true)).rejects.toThrow(/Android app/);
  });
});

describe("the weekly memory tidy-up", () => {
  const MD = "# Lyra memory\n\n## Rules\n- Short replies\n- Keep it short\n\n## People\n- Dana is my sister\n\n## Projects\n\n## Open loops\n- Waiting on plumber quote\n\n## My own section\n- untouched\n";

  it("only shrinks known sections, keeps the rest of the file, and won't remove most of it", () => {
    const r = applyTidy(MD, ["Rules", "People", "Projects", "Open loops"], { Rules: ["Short replies"] }, ["Merged two rules about short replies"]);
    expect(r.content).toContain("## Rules\n- Short replies\n\n## People");
    expect(r.content).toContain("## My own section\n- untouched");
    expect(() => applyTidy(MD, ["Rules"], { Rules: ["a", "b", "c"] }, ["x"])).toThrow(/grew/);
    expect(() => applyTidy(MD, ["Rules", "People", "Open loops"], { Rules: [], People: [], "Open loops": [] }, ["x"])).toThrow(/more than half/);
    expect(() => applyTidy(MD, ["Rules"], { Secrets: [] }, ["x"])).toThrow(/no section/);
    expect(() => applyTidy(MD, ["Rules"], { Rules: ["Short replies"] }, [])).toThrow(/what changed/);
  });

  it("runs weekly when there's enough saved, posts what changed, and undoes in one tap", async () => {
    const provider = new FakeProvider([call("tidy_memory", { sections: { Rules: ["Short replies"] }, changes: ["Merged two rules about short replies"] })]);
    const lyra = await Lyra.start(platform({ provider }));
    const loops = Array.from({ length: 12 }, (_, i) => `- Loop ${i}`).join("\n");
    await lyra.saveMemory(`# Lyra memory\n\n## Rules\n- Keep it short\n- Short replies please\n\n## People\n\n## Projects\n\n## Open loops\n${loops}\n`);
    const tomorrow = (h: number) => new Date(localToDate(`${new Intl.DateTimeFormat("sv-SE", { timeZone: LA }).format(new Date())} ${h}:00`, LA)!.getTime() + 86_400_000);
    expect(lyra.tickTidy(tomorrow(23))).toBe(false);
    expect(lyra.tickTidy(tomorrow(11))).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const m = lyra.messages(null).at(-1)!;
    expect(m.content).toBe("I tidied up my notes about you:\n- Merged two rules about short replies");
    expect(lyra.memoryView().sections.find((s) => s.name === "Rules")!.items).toEqual(["Short replies"]);
    expect(lyra.tickTidy(new Date(tomorrow(11).getTime() + 86_400_000))).toBe(false); // a week between
    await lyra.undoTidy(m.id);
    expect(lyra.memoryView().sections.find((s) => s.name === "Rules")!.items).toEqual(["Keep it short", "Short replies please"]);
    await expect(lyra.undoTidy(m.id)).rejects.toThrow(/Nothing to undo/);
  });
});
