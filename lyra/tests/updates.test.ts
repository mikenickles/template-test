import { describe, expect, it } from "vitest";
import { DRIVE_READONLY, TokenSource } from "../core/connectors/google.ts";
import { compareVersions, newest, parseUpdateName, UpdateSource } from "../core/updates.ts";

describe("updates from Drive", () => {
  it("compares versions number by number", () => {
    expect(compareVersions("0.12.0", "0.11.9")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.10", "0.10.0")).toBe(-1);
  });

  it("recognizes only Lyra's own file names", () => {
    expect(parseUpdateName("Lyra-0.12.0.apk")).toEqual({ kind: "apk", version: "0.12.0" });
    expect(parseUpdateName("Lyra-app-0.12.0.lyrapack")).toEqual({ kind: "pack", version: "0.12.0" });
    expect(parseUpdateName("Lyra-0.12.0-win-arm64.zip")).toEqual({ kind: "win", version: "0.12.0" });
    expect(parseUpdateName("Lyra-0.12.0 (1).apk")).toBeNull();
    expect(parseUpdateName("evil.apk")).toBeNull();
  });

  it("picks the newest file newer than what's installed", () => {
    const f = (name: string) => ({ id: name, name, size: 1, ...parseUpdateName(name)! });
    const files = ["Lyra-0.11.0.apk", "Lyra-0.12.0.apk", "Lyra-0.10.0.apk", "Lyra-app-0.13.0.lyrapack"].map(f);
    expect(newest(files, "apk", "0.11.0")?.version).toBe("0.12.0");
    expect(newest(files, "apk", "0.12.0")).toBeUndefined();
    expect(newest(files, "pack", "0.12.0")?.version).toBe("0.13.0");
  });

  it("only looks at a Lyra Updates folder and files you own", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(decodeURIComponent(url.replace(/\+/g, " ")));
      if (url.includes("alt=media")) return new Response(new Uint8Array([7]));
      if (url.includes("mimeType")) return new Response(JSON.stringify({ files: [{ id: "folder1" }] }));
      return new Response(JSON.stringify({ files: [{ id: "a", name: "Lyra-0.12.0.apk", size: "7500000" }, { id: "b", name: "notes.txt" }] }));
    }) as typeof fetch;
    const auth = { available: true, authorize: async () => ({ accessToken: "t", grantedScopes: [DRIVE_READONLY] }) };
    const src = new UpdateSource(new TokenSource(auth, [DRIVE_READONLY]), fetchFn);
    expect(await src.list()).toEqual([{ id: "a", name: "Lyra-0.12.0.apk", size: 7500000, kind: "apk", version: "0.12.0" }]);
    expect(urls[0]).toContain("name = 'Lyra Updates'");
    expect(urls.every((u) => u.includes("'me' in owners") || u.includes("alt=media"))).toBe(true);
    expect([...(await src.download("a"))]).toEqual([7]);
  });
});
