import { describe, expect, it } from "vitest";
import { chatText, readyText, routineText, shortTime, STATUS_MAX, upNext, weatherText, widgetWords, workingText } from "../web/src/statusText.ts";
import { describeWeather } from "../web/src/weather.ts";

const fits = (s: string) => expect([...s].length, s).toBeLessThanOrEqual(STATUS_MAX);
const LONG = "Find a plumber for the kitchen leak before Monday under $200";

describe("status line wording", () => {
  it("never needs cutting off, however long the names", () => {
    for (const label of ["Searching your mail", "Reading the thread", "Checking your calendar", "Checking your calendars", "Searching your files", "Reading the file", "Searching the web", `Checking ${LONG}`, `Made the ${LONG} channel`, "Thinking", "Writing"])
      fits(chatText(label));
    for (const title of ["Plumber", "Find a plumber", LONG]) fits(workingText(title));
    fits(workingText(LONG, 12));
    for (const name of ["Morning brief", "Bills watch", LONG]) fits(routineText(name));
    for (const n of [1, 2, 9, 12, 140]) fits(readyText(n));
    fits("Update ready");
    fits("Restart to update");
    for (let code = 0; code < 100; code++) {
      const w = describeWeather(code);
      fits(weatherText(w.icon, -40, w.text));
      fits(weatherText(w.icon, 104, w.text));
    }
    const now = new Date(2026, 10, 12, 21, 0);
    for (const [name, h, m] of [["Morning brief", 7, 0], [LONG, 7, 30], [LONG, 12, 45], ["Evening check-in", 22, 15]] as const) {
      const at = new Date(2026, 10, h >= 21 ? 12 : 13, h, m);
      const s = upNext([{ name, enabled: 1, next_run_at: at.toISOString() }], now);
      expect(s).toBeTruthy();
      fits(s!);
    }
  });

  it("says it the friendly way when there's room", () => {
    expect(chatText("Searching your mail")).toBe("Searching your mail…");
    expect(chatText(`Checking ${LONG}`)).toBe("Working…");
    expect(workingText("Find a plumber")).toBe("Working: Find a plumber");
    expect(workingText("Plumber")).toBe("Working on: Plumber");
    expect(workingText(LONG)).toBe("Working on a task");
    expect(readyText(1)).toBe("1 thing ready for you");
    expect(shortTime(new Date(2026, 0, 1, 7, 0))).toBe("7 AM");
    expect(shortTime(new Date(2026, 0, 1, 19, 30))).toBe("7:30 PM");
    const now = new Date(2026, 10, 12, 6, 0);
    expect(upNext([{ name: "Morning brief", enabled: 1, next_run_at: new Date(2026, 10, 12, 7, 0).toISOString() }], now)).toBe("Morning brief at 7 AM");
    expect(upNext([{ name: "Morning brief", enabled: 0, next_run_at: new Date(2026, 10, 12, 7, 0).toISOString() }], now)).toBeNull();
  });
});

describe("the home-screen widget", () => {
  const now = new Date("2026-11-12T10:00:00");
  it("says what's happening, what's ready or what's next, always fitting", () => {
    expect(widgetWords({ working: [{ title: LONG }], ready: 2, upcoming: [] }, now).status).toMatch(/^Working/);
    expect(widgetWords({ working: [], ready: 2, upcoming: [] }, now).status).toBe("2 things ready for you");
    const next = widgetWords({ working: [], ready: 0, upcoming: [{ name: "Morning brief", enabled: 1, next_run_at: "2026-11-12T16:00:00" }] }, now);
    expect(next.status).toMatch(/^Morning brief at 4/);
    const idle = widgetWords({ working: [], ready: 0, upcoming: [] }, now);
    for (const s of [next.status, idle.status]) fits(s);
    expect(idle.detail).toBe("Tap to talk to Lyra");
    expect(widgetWords({ working: [], ready: 0, upcoming: [], latest: { label: "Heads-up", text: "Dana is waiting" } }, now).detail).toBe("Heads-up: Dana is waiting");
  });
});
