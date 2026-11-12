import { describe, expect, it } from "vitest";
import { headline } from "../web/src/markdown.tsx";

describe("reply headline", () => {
  it("only styles a short first line followed by more", () => {
    expect(headline("Got it.")).toBe(false);
    expect(headline("Saturday at 10:30, at the park.")).toBe(false);
    expect(headline("Only Ortiz can come before Monday.\n\n- When: tomorrow, 8 to 10 AM.\n\nShould I book them?")).toBe(false);
    const brief = `Big day: the dentist at 9, then Rowan's party.\n\n${"- A calendar line with its time and place.\n".repeat(6)}\n${"Mail that needs a reply today, and why. ".repeat(4)}`;
    expect(headline(brief)).toBe(true);
    expect(headline(`${"A very long first paragraph that goes on. ".repeat(4)}\n\nMore.`)).toBe(false);
    expect(headline("- a list first\n\nthen text")).toBe(false);
    expect(headline("Two lines\nin one block\n\nthen more")).toBe(false);
  });
});
