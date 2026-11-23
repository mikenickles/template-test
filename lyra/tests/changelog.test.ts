import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANGELOG } from "../core/changelog.ts";

describe("the changelog Tomo reads", () => {
  it("has an entry for the version being built (add one with every release)", () => {
    const gradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
    const version = gradle.match(/versionName "([\d.]+)"/)?.[1];
    expect(CHANGELOG[0].version).toBe(version);
    expect(CHANGELOG[0].notes.length).toBeGreaterThan(0);
  });
});
