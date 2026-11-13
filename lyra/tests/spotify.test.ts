import { describe, expect, it } from "vitest";
import { Lyra } from "../core/lyra.ts";
import { FakeProvider } from "../core/providers/fake.ts";
import type { GenerateResult } from "../core/providers/types.ts";
import { platform } from "./helpers.ts";

const noop = { text: () => {}, status: () => {}, memory: () => {} };
const say = (text: string): GenerateResult => ({ parts: [{ type: "text", text }], stop: "end" });
const call = (name: string, input: Record<string, unknown>, id = "c1"): GenerateResult => ({ parts: [{ type: "tool_call", id, name, input }], stop: "tool_use" });
const CLIENT = "0123456789abcdef0123456789abcdef";
const T1 = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const T2 = "spotify:track:7ouMYWpwJ422jRcDASZB7P";

/** A pretend Spotify: sign-in page, token endpoint and Web API. */
function fakeSpotify(opts: { grant?: string; noDevice?: boolean } = {}) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const asked: URL[] = [];
  const oauth = {
    async authorize(authUrl: (r: string) => string) {
      const redirectUri = "app.lyra.chief://spotify";
      const u = new URL(authUrl(redirectUri));
      asked.push(u);
      return { redirectUri, returned: `${redirectUri}?code=abc&state=${u.searchParams.get("state")}` };
    },
  };
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(url), body: init.body ? String(init.body) : undefined });
    const u = String(url);
    if (u === "https://accounts.spotify.com/api/token") {
      const scope = opts.grant ?? decodeURIComponent(asked.at(-1)!.searchParams.get("scope")!);
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope });
    }
    const path = u.replace("https://api.spotify.com/v1", "");
    if (path === "/me") return json({ id: "sam1", display_name: "Sam" });
    if (path.startsWith("/search")) return json({ tracks: { items: [{ name: "Karma Police", uri: T1, artists: [{ name: "Radiohead" }], album: { name: "OK Computer" } }] } });
    if (path.startsWith("/tracks?ids=")) return json({ tracks: [{ uri: T1, name: "Karma Police", artists: [{ name: "Radiohead" }] }, { uri: T2, name: "No Surprises", artists: [{ name: "Radiohead" }] }] });
    if (path === "/me/player/play") return opts.noDevice ? json({ error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } }, 404) : new Response(null, { status: 204 });
    if (path === "/users/sam1/playlists") return json({ id: "pl123456789", external_urls: { spotify: "https://open.spotify.com/playlist/pl123456789" } });
    if (path === "/playlists/pl123456789/tracks") return json({ snapshot_id: "s" }, 201);
    return json({ error: { message: "unexpected" } }, 404);
  }) as unknown as typeof globalThis.fetch;
  return { oauth, fetch, calls, asked };
}

describe("Spotify", () => {
  it("signs in with the user's own app (PKCE), asking only to look, and offers only read tools", async () => {
    const s = fakeSpotify();
    const provider = new FakeProvider([call("spotify__search", { query: "karma police" }), say("Found it.")]);
    const lyra = await Lyra.start(platform({ provider, oauth: s.oauth, fetch: s.fetch }));
    await expect(lyra.connectSpotify()).rejects.toThrow(/Client ID/);
    await expect(lyra.connectSpotify("nope")).rejects.toThrow(/doesn't look like/);
    await lyra.connectSpotify(CLIENT);
    const q = s.asked[0].searchParams;
    expect(q.get("client_id")).toBe(CLIENT);
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("scope")).not.toMatch(/modify/);
    expect(s.calls[0].body).toMatch(/code_verifier=/);
    expect(lyra.state().connectors.find((c) => c.id === "spotify")).toMatchObject({ state: "connected", account: "Sam" });
    const { message } = await lyra.chat("find karma police", noop);
    const names = provider.requests[0].tools.map((t) => t.name);
    expect(names).toContain("spotify__search");
    expect(names).not.toContain("control_music");
    expect(names).not.toContain("propose_playlist");
    expect(provider.requests[0].system).toMatch(/## Music \(Spotify\)/);
    const result = provider.requests[1].messages.at(-1)!.parts[0] as { content: string };
    expect(result.content).toMatch(/untrusted_data[^]*Karma Police · Radiohead · OK Computer · spotify:track:/);
    expect(message.meta.tools).toEqual([{ name: "spotify__search", ok: true }]);
  });

  it("refuses a grant wider than asked for", async () => {
    const s = fakeSpotify({ grant: "user-read-playback-state user-follow-modify" });
    const lyra = await Lyra.start(platform({ oauth: s.oauth, fetch: s.fetch }));
    await expect(lyra.connectSpotify(CLIENT)).rejects.toThrow(/more than Lyra asked for/);
    expect(lyra.state().connectors.find((c) => c.id === "spotify")!.state).toBe("not_connected");
  });

  it("plays music when asked, once playback is turned on", async () => {
    const s = fakeSpotify();
    const provider = new FakeProvider([call("control_music", { action: "play", uri: T1 }), say("Playing.")]);
    const lyra = await Lyra.start(platform({ provider, oauth: s.oauth, fetch: s.fetch }));
    await lyra.connectSpotify(CLIENT);
    await lyra.allowSpotify("playback", true);
    expect(s.asked.at(-1)!.searchParams.get("scope")).toMatch(/user-modify-playback-state/);
    await lyra.chat("play karma police", noop);
    const play = s.calls.find((c) => c.url.endsWith("/me/player/play"))!;
    expect(play).toMatchObject({ method: "PUT", body: JSON.stringify({ uris: [T1] }) });
    const s2 = fakeSpotify({ noDevice: true });
    const l2 = await Lyra.start(platform({ oauth: s2.oauth, fetch: s2.fetch }));
    await l2.connectSpotify(CLIENT);
    await expect(l2.controlMusic("play", T1)).rejects.toThrow(/Open Spotify on your phone or computer first/);
  });

  it("makes a playlist only on the user's tap, showing the real song names", async () => {
    const s = fakeSpotify();
    const provider = new FakeProvider([call("propose_playlist", { name: "Rainy day", uris: [T1, T2] }), say("Ready for your OK.")]);
    const lyra = await Lyra.start(platform({ provider, oauth: s.oauth, fetch: s.fetch }));
    await lyra.connectSpotify(CLIENT);
    await lyra.allowSpotify("playlists", true);
    const { message } = await lyra.chat("make me a rainy day playlist", noop);
    const id = message.meta.actions![0];
    expect(lyra.action(id)).toMatchObject({ kind: "playlist", status: "proposed", payload: { name: "Rainy day", tracks: [{ name: "Karma Police", artist: "Radiohead" }, { name: "No Surprises" }] } });
    expect(s.calls.some((c) => c.method === "POST" && c.url.includes("/playlists"))).toBe(false);
    const done = await lyra.decideAction(id, "add");
    expect(done).toMatchObject({ status: "done", result: { did: "made", link: "https://open.spotify.com/playlist/pl123456789" } });
    const add = s.calls.find((c) => c.url.endsWith("/playlists/pl123456789/tracks"))!;
    expect(JSON.parse(add.body!)).toEqual({ uris: [T1, T2] });
    const made = s.calls.find((c) => c.url.endsWith("/users/sam1/playlists"))!;
    expect(JSON.parse(made.body!)).toMatchObject({ name: "Rainy day", public: false });
  });
});
