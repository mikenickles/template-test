import { describe, expect, it } from "vitest";
import { activityDetail, listActivity, logActivity, stepsFromTranscript } from "../core/activity.ts";
import { addMessage, DB } from "../core/db.ts";
import { SQL } from "./helpers.ts";

describe("the activity log", () => {
  it("brings task runs, routine runs, Lyra's own posts and logged jobs together, newest first", async () => {
    const db = await DB.open(SQL);
    db.run("INSERT INTO tasks (title) VALUES ('Find a plumber')");
    const transcript = [
      { role: "user", parts: [{ type: "text", text: "Start" }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "1", name: "gmail__search_mail", input: { query: "plumber quote" } }] },
      { role: "user", parts: [{ type: "tool_result", id: "1", name: "gmail__search_mail", content: "2 messages", isError: false }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "2", name: "drive__read_file", input: { id: "x" } }] },
      { role: "user", parts: [{ type: "tool_result", id: "2", name: "drive__read_file", content: "not found", isError: true }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "3", name: "finish", input: { result: "Ortiz is cheapest", log: "Picked Ortiz" } }] },
    ];
    db.run("INSERT INTO worker_runs (task_id, status, transcript, started_at, ended_at) VALUES (1, 'finished', ?, '2026-11-13T09:00:00.000Z', '2026-11-13T09:05:00.000Z')", [JSON.stringify(transcript)]);
    db.run("INSERT INTO task_log (task_id, who, text, at) VALUES (1, 'worker', 'Result: Ortiz is cheapest', '2026-11-13T09:05:00.000Z')");
    db.run("INSERT INTO routines (name, instructions, times, days) VALUES ('Morning brief', 'x', '07:00', '0123456')");
    const m = addMessage(db, "assistant", "Morning! Dentist at 3.", { routine: { id: 1, name: "Morning brief" } }, null);
    db.run("INSERT INTO routine_runs (routine_id, status, message_id, started_at, ended_at) VALUES (1, 'posted', ?, '2026-11-13T07:00:00.000Z', '2026-11-13T07:01:00.000Z')", [m.id]);
    addMessage(db, "assistant", "Heads-up: Dana is waiting on you.", { headsUp: true }, null);
    logActivity(db, { kind: "life_admin", title: "Went through your mail", summary: "Found 1 new", status: "done", detail: "- bill: PG&E" });

    db.run("UPDATE messages SET created_at = '2026-11-13T06:30:00.000Z' WHERE json_extract(meta, '$.headsUp') = 1");
    db.run("UPDATE activity_log SET started_at = '2026-11-13T06:00:00.000Z'");
    const list = listActivity(db);
    expect(list.map((a) => [a.kind, a.title, a.status])).toEqual([
      ["task", "Find a plumber", "done"],
      ["routine", "Morning brief", "done"],
      ["heads_up", "Heads-up", "done"],
      ["life_admin", "Went through your mail", "done"],
    ]);
    expect(list.find((a) => a.kind === "task")!.summary).toBe("Ortiz is cheapest");
    expect(list.find((a) => a.kind === "routine")!.summary).toBe("Morning! Dentist at 3.");
    expect(listActivity(db, { kind: ["task"] }).map((a) => a.kind)).toEqual(["task"]);

    const d = activityDetail(db, "w1")!;
    expect(d.body).toBe("Ortiz is cheapest");
    expect(d.steps).toEqual([
      { label: "Searched your mail", detail: "plumber quote", ok: true },
      { label: "Read a file", detail: "", ok: false },
      { label: "Finished", detail: "Picked Ortiz", ok: true },
    ]);
    expect(d.links).toEqual([{ label: "Open the task", href: "#/t/1" }]);
    expect(activityDetail(db, `r1`)!.links.map((l) => l.label)).toEqual(["See it in the chat", "Open the routine"]);
    expect(activityDetail(db, "nope")).toBeNull();
  });

  it("reads a provider's own web search as a step", () => {
    const steps = stepsFromTranscript([{ role: "assistant", parts: [{ type: "native", provider: "anthropic", block: { type: "server_tool_use", name: "web_search", input: { query: "plumbers near me" } } }] }] as never);
    expect(steps).toEqual([{ label: "Searched the web", detail: "plumbers near me", ok: true }]);
  });
});
