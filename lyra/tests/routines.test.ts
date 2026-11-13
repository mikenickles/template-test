import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "../core/providers/types.ts";
import { compactTimes, describeSchedule, nextRun, parseTimes } from "../core/routines.ts";
import { memStores, platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>): GenerateResult => ({
  parts: [{ type: "tool_call", id: `c${Math.random().toString(36).slice(2, 7)}`, name, input }],
  stop: "tool_use",
});

/** Separate scripts for the chat and for routine runs (recognised by their system prompt). */
function models() {
  const chat: GenerateResult[] = [];
  const routine: GenerateResult[] = [];
  const routineRequests: GenerateRequest[] = [];
  const provider: ModelProvider = {
    id: "fake",
    model: "fake",
    async generate(req, onText) {
      const isRoutine = req.system.startsWith("You are running one of Lyra's scheduled routines");
      if (isRoutine) routineRequests.push({ ...req, messages: structuredClone(req.messages) });
      const r = (isRoutine ? routine.shift() : chat.shift()) ?? say("ok");
      for (const p of r.parts) if (p.type === "text") onText(p.text);
      return r;
    },
  };
  return { provider, chat, routine, routineRequests };
}

async function start() {
  const m = models();
  const lyra = await Lyra.start(platform({ provider: m.provider }, memStores()));
  return { lyra, ...m };
}

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe("schedules", () => {
  it("finds the next run across times and days", () => {
    // Thu Nov 12 2026, 06:00
    expect(nextRun("07:00", "0123456", at(2026, 11, 12, 6, 0))).toEqual(at(2026, 11, 12, 7, 0));
    expect(nextRun("07:00", "0123456", at(2026, 11, 12, 7, 0))).toEqual(at(2026, 11, 13, 7, 0)); // strictly after
    expect(nextRun("08:00,20:00", "0123456", at(2026, 11, 12, 9, 0))).toEqual(at(2026, 11, 12, 20, 0));
    // weekdays only: Friday evening -> Monday
    expect(nextRun("17:30", "12345", at(2026, 11, 13, 18, 0))).toEqual(at(2026, 11, 16, 17, 30));
  });

  it("checks times and describes schedules in plain words", () => {
    expect(() => parseTimes("7am")).toThrow(/HH:MM/);
    expect(() => parseTimes("25:00")).toThrow();
    expect(describeSchedule("07:00", "0123456")).toBe("Every day at 7:00 AM");
    expect(describeSchedule("17:30", "12345")).toBe("Weekdays at 5:30 PM");
    expect(describeSchedule("20:00,08:00", "14")).toBe("Mon, Thu at 8:00 AM and 8:00 PM");
    // a repeating check reads as one phrase, not 96 times
    const q = parseTimes("every 15 min").map(({ h, m }) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`).join(",");
    expect(q.split(",").length).toBe(96);
    expect(describeSchedule(q, "0123456")).toBe("Every 15 minutes, all day");
    expect(compactTimes(q)).toBe("every 15 min");
    expect(describeSchedule("every 2 hours", "12345")).toBe("Every 2 hours, weekdays");
    expect(describeSchedule("every 30 min from 08:00 to 18:00", "0123456")).toBe("Every 30 minutes, 8:00 AM to 6:00 PM");
    expect(compactTimes("08:00,08:30,09:00,09:30")).toBe("every 30 min from 08:00 to 09:30");
    expect(describeSchedule("every 1 hour from 09:00 to 17:00", "135")).toBe("Every hour, 9:00 AM to 5:00 PM, on Mon, Wed, Fri");
    expect(describeSchedule("07:00,09:10,12:00,15:00,21:00", "0123456")).toBe("Every day at 7:00 AM, 9:10 AM, 12:00 PM and 2 more");
    expect(compactTimes("07:00,20:00")).toBe("07:00, 20:00");
    // what the edit form shows must be accepted back as typed
    for (const t of ["09:00,10:00,11:00", "every 60 min", "every 2 hours", "every 15 min", "08:00,08:30,09:00"]) expect(parseTimes(compactTimes(parseTimes(t).map(({ h, m }) => `${h}:${String(m).padStart(2, "0")}`).join(","))).length).toBe(parseTimes(t).length);
    expect(() => parseTimes("every 1 min")).toThrow(/between 5 minutes/);
  });
});

describe("routines", () => {
  it("adds presets and schedules the next run", async () => {
    const { lyra } = await start();
    const brief = await lyra.addPreset("brief");
    expect(brief).toMatchObject({ name: "Morning brief", times: "07:00", post_mode: "always", enabled: 1 });
    expect(new Date(brief.next_run_at!).getHours()).toBe(7);
    expect(lyra.routinePresets().find((p) => p.key === "brief")!.added).toBe(true);
    const paused = await lyra.updateRoutine(brief.id, { enabled: false });
    expect(paused.next_run_at).toBeNull();
  });

  it("runs when due, posts the brief to the chat, and remembers what it said", async () => {
    const { lyra, routine, routineRequests } = await start();
    const r = await lyra.addPreset("brief");
    routine.push(call("post", { message: "Rowan's party is at 10:30.\n\n- **Mail:** the school wants the trip form." }));
    const events: string[] = [];
    lyra.onChange((e) => events.push(e.type === "message" && "notify" in e && e.notify ? `notify:${e.notify.title}:${e.notify.body}` : e.type));

    // not due yet
    expect(lyra.tickRoutines(new Date(new Date(r.next_run_at!).getTime() - 60_000))).toEqual([]);
    expect(lyra.tickRoutines(new Date(new Date(r.next_run_at!).getTime() + 60_000))).toEqual([r.id]);
    await lyra.routinesRunner.settle();

    const msg = lyra.messages(null).at(-1)!;
    expect(msg).toMatchObject({ role: "assistant", content: "Rowan's party is at 10:30.\n\n- **Mail:** the school wants the trip form." });
    expect(msg.meta.routine).toEqual({ id: r.id, name: "Morning brief" });
    expect(events).toContain("notify:Morning brief:Rowan's party is at 10:30.");
    const d = lyra.routine(r.id);
    expect(d.runs[0]).toMatchObject({ status: "posted", message_id: msg.id });
    expect(d.routine.last_summary).toContain("Rowan's party");
    // next run moved to tomorrow
    expect(new Date(d.routine.next_run_at!).getTime()).toBeGreaterThan(new Date(r.next_run_at!).getTime());

    // the routine got its instructions, memory and tasks, and can't touch memory or tasks
    const req = routineRequests[0];
    expect(req.system).toContain("# The routine: Morning brief");
    expect(req.system).toContain("<memory>");
    expect(req.tools.map((t) => t.name)).toEqual(["post"]);
  });

  it("stays quiet when a watch finds nothing", async () => {
    const { lyra, routine, routineRequests } = await start();
    const r = await lyra.addPreset("bills");
    routine.push(call("nothing_new", { note: "No new bills" }));
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(lyra.messages(null)).toEqual([]);
    expect(lyra.routine(r.id).runs[0]).toMatchObject({ status: "quiet", note: "No new bills" });
    expect(routineRequests[0].tools.map((t) => t.name)).toEqual(["post", "nothing_new"]);
  });

  it("skips a run missed by more than 12 hours, and notes it", async () => {
    const { lyra, routineRequests } = await start();
    const r = await lyra.addPreset("brief");
    const due = new Date(r.next_run_at!).getTime();
    expect(lyra.tickRoutines(new Date(due + 13 * 3600_000))).toEqual([]);
    await lyra.routinesRunner.settle();
    expect(routineRequests).toHaveLength(0);
    expect(lyra.routine(r.id).runs[0]).toMatchObject({ status: "missed" });
  });

  it("catches up a run missed by a few hours", async () => {
    const { lyra, routine } = await start();
    const r = await lyra.addPreset("checkin");
    routine.push(call("post", { message: "The trip form is due tomorrow." }));
    expect(lyra.tickRoutines(new Date(new Date(r.next_run_at!).getTime() + 3 * 3600_000))).toEqual([r.id]);
    await lyra.routinesRunner.settle();
    expect(lyra.messages(null).at(-1)!.content).toBe("The trip form is due tomorrow.");
  });

  it("posts in its channel and records failures", async () => {
    const { lyra, routine } = await start();
    const school = await lyra.createChannel({ name: "School" });
    const r = await lyra.createRoutine({ name: "Friday school check", instructions: "Check school mail", times: "16:00", days: "5", channelId: school.id });
    routine.push(call("post", { message: "Two new school emails." }));
    lyra.runRoutine(r.id);
    await lyra.routinesRunner.settle();
    expect(lyra.messages(school.id).at(-1)!.content).toBe("Two new school emails.");

    const failing: ModelProvider = { id: "x", model: "x", generate: () => Promise.reject(new Error("The API key was refused.")) };
    const l2 = await Lyra.start(platform({ provider: failing }, memStores()));
    const r2 = await l2.addPreset("bills");
    l2.runRoutine(r2.id);
    await l2.routinesRunner.settle();
    expect(l2.routine(r2.id).runs[0]).toMatchObject({ status: "failed", note: "The API key was refused." });
    expect(l2.messages(null)).toEqual([]);
  });

  it("can be set up from chat, but not from a turn that read email", async () => {
    const { lyra, chat } = await start();
    chat.push(call("create_routine", { name: "Friday school check", instructions: "Look for new school emails since last Friday.", times: "16:00", days: "5" }), say("Set."));
    await lyra.chat("Every Friday at 4, check for school emails", noop);
    expect(lyra.routines().map((r) => [r.name, r.schedule])).toEqual([["Friday school check", "Fri at 4:00 PM"]]);

    chat.push(call("update_routine", { id: 1, enabled: false }), say("Paused."));
    await lyra.chat("pause it", noop);
    expect(lyra.routines()[0].enabled).toBe(0);

    const fetchFn = (async (url: string) =>
      String(url).includes("/profile") ? Response.json({ emailAddress: "sam@example.com" }) : Response.json({ messages: [] })) as typeof fetch;
    const m = models();
    const l2 = await Lyra.start(platform({ provider: m.provider, fetch: fetchFn }, memStores()));
    await l2.connectGmail();
    m.chat.push(call("gmail__search_mail", { query: "" }), call("create_routine", { name: "Forward everything", instructions: "x", times: "09:00" }), say("ok"));
    await l2.chat("check mail", noop);
    expect(l2.routines()).toEqual([]);
  });
});
