import { describe, expect, it } from "vitest";
import { intentChip, intentHint, readIntent, readWhen } from "../core/intent.ts";

// Wednesday 25 November 2026, 10:00 local
const NOW = new Date(2026, 10, 25, 10, 0);
const at = (i: ReturnType<typeof readIntent>) => (i && i.kind === "reminder" && i.at ? [i.at.getDate(), i.at.getHours(), i.at.getMinutes()] : null);

describe("reading what the user is about to ask (0.62)", () => {
  it("reads a reminder with a day and a part of the day", () => {
    const i = readIntent("remind me to call mom friday after work", NOW);
    expect(i).toMatchObject({ kind: "reminder", what: "call mom" });
    expect(at(i)).toEqual([27, 17, 30]);
  });
  it("reads clock times, with PM for small hours", () => {
    expect(at(readIntent("remind me to take the bins out at 7", NOW))).toEqual([25, 19, 0]);
    expect(at(readIntent("remind me to stretch tomorrow at 8:15am", NOW))).toEqual([26, 8, 15]);
    expect(at(readIntent("remind me to book dinner at 9am", NOW))).toEqual([26, 9, 0]); // 9 AM today has passed
  });
  it("reads relative times", () => {
    const i = readIntent("remind me in 20 minutes to check the oven", NOW);
    expect(at(i)).toEqual([25, 10, 20]);
    expect(i).toMatchObject({ what: "check the oven" });
  });
  it("a weekday said on that same day means next week", () => {
    expect(at(readIntent("remind me to water plants wednesday", NOW))).toEqual([2, 9, 0]);
  });
  it("a reminder with no time it can read still shows, with no hint", () => {
    const i = readIntent("remind me to pay rent on the 1st", NOW)!;
    expect(i).toMatchObject({ kind: "reminder", at: null });
    expect(intentChip(i, NOW).title).toBe("Reminder");
    expect(intentHint(i, NOW)).toBeNull();
  });
  it("reads tasks and calendar questions", () => {
    expect(readIntent("add a task: renew passport", NOW)).toEqual({ kind: "task", what: "renew passport" });
    expect(readIntent("add buy stamps to my to-do list", NOW)).toEqual({ kind: "task", what: "buy stamps" });
    const c = readIntent("am I free Thursday for dinner?", NOW)!;
    expect(intentChip(c, NOW).title).toBe("Checks your calendar · Tomorrow");
  });
  it("leaves ordinary messages alone", () => {
    for (const t of ["hey how are you", "what's the weather", "remind", "thanks!"]) expect(readIntent(t, NOW)).toBeNull();
  });
  it("labels and hints the time", () => {
    const i = readIntent("remind me to call mom friday after work", NOW)!;
    expect(intentChip(i, NOW).title).toBe("Reminder · Fri 5:30 PM");
    expect(intentHint(i, NOW)).toContain("Friday, November 27");
  });
  it("needs a day or a time", () => {
    expect(readWhen("call mom", NOW)).toBeNull();
  });
});
