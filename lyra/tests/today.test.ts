import { describe, expect, it } from "vitest";
import { createAction } from "../core/actions.ts";
import { addMessage, DB } from "../core/db.ts";
import { createReminder } from "../core/reminders.ts";
import { createTask, snoozeTask, updateTask } from "../core/tasks.ts";
import { latestIds, searchMessages, todayView, unreadCounts } from "../core/today.ts";
import { SQL } from "./helpers.ts";

const TZ = "America/Los_Angeles";

describe("the Today view", () => {
  it("puts what needs you first, then what Lyra said, then what's coming", async () => {
    const db = await DB.open(SQL);
    const now = new Date();
    const t = createTask(db, { title: "Find a plumber" }, "lyra");
    updateTask(db, t.id, { status: "ready", needs: "Pick one of three quotes" }, "lyra");
    createAction(db, "email", { to: ["dana@example.com"], cc: [], subject: "Friday", body: "Yes" }, false, null);
    addMessage(db, "assistant", "Dana is waiting on Friday.", { headsUp: true });
    createReminder(db, { kind: "remind", text: "Call Dad", at: new Date(now.getTime() + 3 * 3600_000), channelId: null });
    const v = todayView(db, { timeZone: TZ, now });
    expect(v.needs).toBe(2);
    expect(v.items.map((i) => [i.label, i.needs])).toEqual([
      ["Ready for you", true],
      ["Waiting for your OK", true],
      ["Heads-up", false],
      ["Reminder", false],
    ]);
    expect(v.items[0]).toMatchObject({ text: "Find a plumber: Pick one of three quotes", href: `#/t/${t.id}` });
    expect(v.items[1].text).toBe('Email to dana@example.com: "Friday"');
    expect(v.items[2].href).toMatch(/^#\/\?m=\d+$/);
    expect(todayView(await DB.open(SQL), { now })).toEqual({ needs: 0, items: [] });
  });
});

describe("search and unread", () => {
  it("finds messages in any chat by all their words", async () => {
    const db = await DB.open(SQL);
    db.run("INSERT INTO channels (name, about, icon) VALUES ('Home', '', 'home')");
    addMessage(db, "user", "The plumber is coming Tuesday");
    addMessage(db, "assistant", "Got it, **plumber** on Tuesday at 9.", {}, 1);
    addMessage(db, "user", "Unrelated");
    const hits = searchMessages(db, "plumber tuesday");
    expect(hits.map((h) => [h.channelName, h.snippet])).toEqual([
      ["Home", "Got it, plumber on Tuesday at 9."],
      [null, "The plumber is coming Tuesday"],
    ]);
    expect(searchMessages(db, "100%")).toEqual([]);
    expect(searchMessages(db, " ")).toEqual([]);
  });

  it("counts Lyra's messages since you last looked", async () => {
    const db = await DB.open(SQL);
    addMessage(db, "user", "hi");
    addMessage(db, "assistant", "hello");
    const seen = latestIds(db);
    expect(unreadCounts(db, seen)).toEqual({});
    addMessage(db, "assistant", "A routine posted this");
    addMessage(db, "user", "mine doesn't count");
    expect(unreadCounts(db, seen)).toEqual({ main: 1 });
    expect(unreadCounts(db, {})).toEqual({});
  });

  it("puts a task off until later", async () => {
    const db = await DB.open(SQL);
    const t = createTask(db, { title: "Book the dentist" }, "you");
    const until = new Date(Date.now() + 86_400_000);
    expect(snoozeTask(db, t.id, until).snoozed_until).toBe(until.toISOString());
    expect(snoozeTask(db, t.id, null).snoozed_until).toBeNull();
  });
});
