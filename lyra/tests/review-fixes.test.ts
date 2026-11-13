import { describe, expect, it } from "vitest";
import { doPlaylist } from "../core/actions.ts";
import { Lyra } from "../core/lyra.ts";
import { memStores, platform } from "./helpers.ts";

describe("fixes from the review", () => {
  it("a follow-up marked done but never posted (the app closed) is owned up to on the next start", async () => {
    const stores = memStores();
    const first = await Lyra.start(platform({}, stores));
    const db = (first as unknown as { db: { run(sql: string, p?: unknown[]): void; flush(): Promise<void> } }).db;
    db.run("INSERT INTO reminders (kind, text, due_at, status, done_at) VALUES ('follow_up', 'Has Ortiz Plumbing replied?', ?, 'done', ?)", [new Date().toISOString(), new Date().toISOString()]);
    await db.flush();
    const again = await Lyra.start(platform({}, stores));
    const posted = again.messages(null).at(-1)!;
    expect(posted.content).toMatch(/closed before I could: Has Ortiz Plumbing replied\?/);
    const third = await Lyra.start(platform({}, stores));
    expect(third.messages(null).filter((m) => /closed before I could/.test(m.content)).length).toBe(1);
  });

  it("a playlist that was made before adding songs failed isn't made twice on retry", async () => {
    const calls: string[] = [];
    let failAdd = true;
    const spotify = {
      async call<T>(method: string, path: string): Promise<T> {
        calls.push(`${method} ${path}`);
        if (path === "/me") return { id: "me" } as T;
        if (path.startsWith("/users/")) return { id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } } as T;
        if (failAdd) throw new Error("429");
        return {} as T;
      },
    };
    const draft = { name: "Focus", description: "", tracks: [{ uri: "spotify:track:1", title: "A", artist: "B" }] };
    let saved: string | undefined;
    await expect(doPlaylist(spotify, draft as never, (id) => (saved = id))).rejects.toThrow();
    expect(saved).toBe("pl1");
    failAdd = false;
    calls.length = 0;
    const r = await doPlaylist(spotify, { ...draft, playlistId: saved, made: true } as never);
    expect(calls.some((c) => c.startsWith("POST /users/"))).toBe(false);
    expect(r.did).toBe("made");
  });
});
