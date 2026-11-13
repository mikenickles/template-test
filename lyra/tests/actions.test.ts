import { describe, expect, it } from "vitest";
import { checkEmail, checkEvent, mimeMessage } from "../core/actions.ts";
import { CALENDAR_EVENTS, CALENDAR_READONLY, GMAIL_COMPOSE, GMAIL_READONLY, NeedsConsentError } from "../core/connectors/google.ts";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const LA = "America/Los_Angeles";

/** Google that remembers what was approved, and returns it all together like the real one. */
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

/** A pretend Gmail and Calendar that records every request. */
function googleApis() {
  const calls: { method: string; url: string; auth: string; body?: Record<string, unknown> }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: String(url), auth: String((init?.headers as Record<string, string>)?.authorization ?? ""), body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    const u = String(url);
    if (u.includes("/threads/abc123"))
      return json({ messages: [{ payload: { headers: [{ name: "Message-ID", value: "<orig@mail>" }, { name: "Subject", value: "Friday plans" }] } }] });
    if (u.endsWith("/messages/send")) return json({ id: "m1", threadId: "t9" });
    if (u.endsWith("/drafts")) return json({ id: "d1", message: { id: "dm1" } });
    if (u.includes("/calendar/v3/calendars/primary/events")) return json({ id: "e1", htmlLink: "https://calendar.google.com/event?eid=e1" });
    if (u.includes("/profile")) return json({ emailAddress: "sam@example.com" });
    if (u.includes("/gmail/v1/users/me/messages?")) return json({ messages: [] });
    return json({ error: { message: "unexpected" } }, 404);
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch: fakeFetch };
}

const decode = (raw: string) => {
  const mime = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const [head, body] = mime.split("\r\n\r\n");
  return { head, body: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8") };
};

async function setup(script: GenerateResult[], allow: ("email" | "event")[] = ["email", "event"]) {
  const g = google();
  const apis = googleApis();
  const provider = new FakeProvider(script);
  const lyra = await Lyra.start(platform({ provider, google: g, fetch: apis.fetch }));
  await lyra.connectGoogle("gmail");
  await lyra.connectGoogle("calendar");
  for (const k of allow) await lyra.allowActions(k, true);
  return { lyra, g, apis, provider };
}

describe("emails and events need the user's tap", () => {
  it("are only offered once turned on, each asking Google for just that permission", async () => {
    const { lyra, g, provider } = await setup([say("Sure."), say("Sure.")], []);
    await lyra.chat("hi", noop);
    expect(provider.requests[0].tools.map((t) => t.name)).not.toContain("propose_email");
    expect(lyra.state().actions).toEqual({ email: false, event: false, archive: false, text: null });
    await lyra.allowActions("email", true);
    expect(g.asked.at(-1)).toEqual([GMAIL_COMPOSE]);
    await lyra.chat("hi again", noop);
    const names = provider.requests[1].tools.map((t) => t.name);
    expect(names).toContain("propose_email");
    expect(names).not.toContain("propose_event");
    // the read-only connections keep working with the wider grant alongside
    expect(lyra.state().connectors.find((c) => c.id === "gmail")?.state).toBe("connected");
  });

  it("proposes an email as a card; nothing goes out until Send, and only once", async () => {
    const { lyra, apis, provider } = await setup([
      call("propose_email", { to: ["dana@example.com"], subject: "Friday", body: "Hi Dana,\n\nYes, Friday works.\n\nSam" }),
      say("Your reply to Dana is ready for you to check."),
    ]);
    const { message } = await lyra.chat("Tell Dana yes for Friday", noop);
    expect(message.meta.actions).toHaveLength(1);
    expect(apis.calls.filter((c) => c.method === "POST")).toEqual([]);
    const result = provider.requests[1].messages.at(-1)!.parts[0] as { content: string };
    expect(result.content).toMatch(/NOT sent/);
    const id = message.meta.actions![0];
    expect(lyra.action(id)).toMatchObject({ kind: "email", status: "proposed", tainted: false });

    const done = await lyra.decideAction(id, "send");
    expect(done).toMatchObject({ status: "done", result: { did: "sent", link: "https://mail.google.com/mail/u/0/#sent/t9" } });
    const sent = apis.calls.filter((c) => c.method === "POST");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(sent[0].auth).toBe(`Bearer tok:${GMAIL_COMPOSE}`);
    const mail = decode(String(sent[0].body!.raw));
    expect(mail.head).toContain("To: dana@example.com");
    expect(mail.head).toContain("Subject: Friday");
    expect(mail.body).toBe("Hi Dana,\r\n\r\nYes, Friday works.\r\n\r\nSam");
    await expect(lyra.decideAction(id, "send")).rejects.toThrow(/already done/);
    expect(apis.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    // Lyra knows next time what happened
    await lyra.chat("did it go?", noop).catch(() => {});
  });

  it("replies in the thread, saves drafts, and keeps the user's edits", async () => {
    const { lyra, apis } = await setup([call("propose_email", { to: "dana@example.com", body: "Sounds good!", reply_to_thread: "abc123" }), say("Ready.")]);
    const { message } = await lyra.chat("reply to dana", noop);
    const id = message.meta.actions![0];
    await lyra.decideAction(id, "draft", { to: ["dana@example.com", "lee@example.com"], subject: "", body: "Sounds great!", reply_to_thread: "abc123" });
    const post = apis.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    const msg = post.body!.message as { raw: string; threadId: string };
    expect(msg.threadId).toBe("abc123");
    const mail = decode(msg.raw);
    expect(mail.head).toContain("To: dana@example.com, lee@example.com");
    expect(mail.head).toContain("Subject: Re: Friday plans");
    expect(mail.head).toContain("In-Reply-To: <orig@mail>");
    expect(mail.body).toBe("Sounds great!");
    expect(lyra.action(id)).toMatchObject({ status: "done", result: { did: "drafted" } });
  });

  it("adds an event only on Add, inviting people only if asked", async () => {
    const { lyra, apis } = await setup([
      call("propose_event", { title: "Dentist", start: "2027-03-07 15:00", end: "2027-03-07 16:00", location: "Main St" }),
      call("propose_event", { title: "Camping", start: "2027-06-12", end: "2027-06-14", attendees: ["lee@example.com"] }, "c2"),
      say("Both are ready for your OK."),
    ]);
    const { message } = await lyra.chat("dentist friday 3 and camping", noop);
    const [a, b] = message.meta.actions!;
    await lyra.decideAction(a, "add");
    await lyra.decideAction(b, "decline");
    const posts = apis.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none");
    expect(posts[0].auth).toBe(`Bearer tok:${CALENDAR_EVENTS}`);
    expect(posts[0].body).toMatchObject({ summary: "Dentist", location: "Main St", start: { dateTime: "2027-03-07T23:00:00.000Z", timeZone: LA } });
    expect(lyra.action(b)).toMatchObject({ status: "declined" });
    expect(checkEvent({ title: "Camping", start: "2027-06-12", end: "2027-06-14", attendees: ["lee@example.com"] }, LA)).toMatchObject({ allDay: true, attendees: ["lee@example.com"] });
  });

  it("flags proposals written after reading mail, and a failure leaves it to try again", async () => {
    const { lyra, apis } = await setup([
      call("gmail__search_mail", { query: "from:dana" }),
      call("propose_event", { title: "Call", start: "2027-01-02 09:00" }, "c2"),
      say("Ready."),
    ]);
    const { message } = await lyra.chat("set up the call Dana asked for", noop);
    const id = message.meta.actions![0];
    expect(lyra.action(id)!.tainted).toBe(true);
    // Google says no: nothing done, the card can be tried again
    apis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    (lyra as unknown as { p: { fetch: typeof fetch } }).p.fetch = apis.fetch;
    await lyra.decideAction(id, "add");
    expect(lyra.action(id)).toMatchObject({ status: "proposed", error: expect.stringMatching(/500/) });
    // turned off on this device: refused before anything is sent
    await lyra.allowActions("event", false);
    await lyra.decideAction(id, "add");
    expect(lyra.action(id)!.error).toMatch(/Turn it on in Connections/);
  });
});

describe("checking what Lyra proposes", () => {
  it("refuses bad addresses and keeps headers to one line", () => {
    expect(() => checkEmail({ to: ["not an address"], subject: "x", body: "y" })).toThrow(/isn't an email address/);
    expect(() => checkEmail({ to: [], body: "y" })).toThrow(/Who is it to/);
    const e = checkEmail({ to: "Dana <DANA@example.com>", subject: "Hi\r\nBcc: evil@example.com", body: "x" });
    expect(e.to).toEqual(["dana@example.com"]);
    expect(e.subject).toBe("Hi Bcc: evil@example.com");
    expect(mimeMessage(e)).not.toMatch(/\r\nBcc:/);
    expect(mimeMessage(checkEmail({ to: "a@b.co", subject: "Café ☕", body: "x" }))).toContain("Subject: =?UTF-8?B?");
  });

  it("reads event times in the user's zone and refuses nonsense", () => {
    const now = new Date("2030-01-01T12:00:00Z");
    expect(checkEvent({ title: "Lunch", start: "2030-01-05 12:30" }, LA, now)).toMatchObject({ start: "2030-01-05 12:30", end: "2030-01-05 13:30", allDay: false });
    expect(() => checkEvent({ title: "x", start: "2030-01-05 12:30", end: "2030-01-05 11:00" }, LA, now)).toThrow(/after the start/);
    expect(() => checkEvent({ title: "x", start: "next friday" }, LA, now)).toThrow(/YYYY-MM-DD/);
    expect(() => checkEvent({ title: "x", start: "2020-01-05 12:30" }, LA, now)).toThrow(/past/);
  });
});

void GMAIL_READONLY;
void CALENDAR_READONLY;
