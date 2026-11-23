import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { platform } from "./helpers.ts";
import { birthdayLabel, birthdayNotices, nextBirthday, parseBirthday, type Person } from "../core/people.ts";

const person = (id: number, name: string, birthday: string): Person => ({ id, name, aliases: [], emails: [], phones: [], relation: "", notes: [], birthday, created_at: "", updated_at: "" });

describe("birthdays", () => {
  it("reads a birthday however it's written", () => {
    expect(parseBirthday("March 3")).toBe("03-03");
    expect(parseBirthday("3 Mar 1984")).toBe("1984-03-03");
    expect(parseBirthday("March 3rd, 1984")).toBe("1984-03-03");
    expect(parseBirthday("3/14")).toBe("03-14");
    expect(parseBirthday("1990-12-01")).toBe("1990-12-01");
    expect(parseBirthday("02-29")).toBe("02-29");
    expect(parseBirthday("")).toBe("");
    expect(() => parseBirthday("soon")).toThrow(/birthday/);
    expect(() => parseBirthday("13/40")).toThrow();
    expect(birthdayLabel("1984-03-03")).toBe("March 3");
  });

  it("finds the next one, with the age when the year is known", () => {
    expect(nextBirthday("03-03", "2026-03-01")).toEqual({ date: "2026-03-03", days: 2 });
    expect(nextBirthday("1984-03-03", "2026-03-03")).toEqual({ date: "2026-03-03", days: 0, age: 42 });
    expect(nextBirthday("03-03", "2026-03-04")).toMatchObject({ date: "2027-03-03" });
    expect(nextBirthday("02-29", "2027-02-01")).toMatchObject({ date: "2027-02-28" });
    expect(nextBirthday("", "2026-03-01")).toBeNull();
  });

  it("says it once a few days ahead and once on the day", () => {
    const people = [person(1, "Dana Ortiz", "1986-11-17"), person(2, "Mom", "11-15"), person(3, "Rowan", "06-01")];
    const first = birthdayNotices(people, "2026-11-15", {})!;
    expect(first.text).toBe("Dana's birthday is on Tuesday (turning 40).\nIt's Mom's birthday today 🎂");
    expect(first.soon).toBe(true);
    // the same day again, and the day after: nothing new
    expect(birthdayNotices(people, "2026-11-15", first.seen)).toBeNull();
    expect(birthdayNotices(people, "2026-11-16", first.seen)?.text ?? "").toBe("");
    const day = birthdayNotices(people, "2026-11-17", first.seen)!;
    expect(day.text).toBe("It's Dana's birthday today (40) 🎂");
    expect(day.soon).toBe(false);
    // next year it comes round again
    expect(birthdayNotices(people, "2027-11-16", day.seen)!.text).toBe("Dana's birthday is tomorrow (turning 41).");
  });

  it("posts the heads-up once a day, from a birthday Tomo was told in chat or the card", async () => {
    const lyra = await Lyra.start(platform());
    const dana = await lyra.savePerson(null, { name: "Dana Ortiz", birthday: "Nov 17 1986" });
    expect(dana.birthday).toBe("1986-11-17");
    const notices: unknown[] = [];
    lyra.onChange((e) => e.type === "message" && e.notify && notices.push(e.notify));
    const noon = new Date("2026-11-15T20:00:00Z");
    lyra.tickBirthdays(noon);
    lyra.tickBirthdays(noon);
    const last = lyra.messages(null).at(-1)!;
    expect(last.content).toBe("Dana's birthday is on Tuesday (turning 40).");
    expect(last.meta).toMatchObject({ headsUp: true, suggestions: ["Remind me that morning"] });
    expect(notices).toEqual([{ title: "Birthday", body: "Dana's birthday is on Tuesday (turning 40).", options: ["Remind me that morning"] }]);
    lyra.tickBirthdays(new Date("2026-11-16T20:00:00Z"));
    expect(notices.length).toBe(1);
    lyra.tickBirthdays(new Date("2026-11-17T20:00:00Z"));
    expect(lyra.messages(null).at(-1)!.content).toBe("It's Dana's birthday today (40) 🎂");
  });
});
