/** Spotify: connecting, now playing, playback. Part of Lyra (core/lyra.ts): methods on Lyra.prototype. */
import * as A from "../actions.ts";
import * as D from "../docs.ts";
import * as S from "../skills.ts";
import * as ST from "../style.ts";
import { SPOTIFY_PLAYBACK, SPOTIFY_PLAYLISTS, SPOTIFY_READ } from "../connectors/spotify/auth.ts";
import { getSetting, setSetting } from "../db.ts";
import * as T from "../tasks.ts";
import { type AppState } from "./shared.ts";
import { part } from "./part.ts";

export const spotify = part({
  // ---------- Spotify (Phase 14) ----------

  get spotifyLink(): { name: string; connected_at: string } | undefined {
    try {
      const raw = getSetting(this.db, "spotify");
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  },

  get spotifyLinked(): boolean {
    return !!this.spotifyLink;
  },

  async spotifyState(): Promise<{ available: boolean; clientId: string | null; connected: boolean; name?: string; playback: boolean; playlists: boolean; nowPlaying: boolean }> {
    return {
      nowPlaying: this.spotifyLinked && getSetting(this.db, "spotify.nowPlaying") !== "off",
      available: !!this.p.oauth,
      clientId: await this.spotify.clientId(),
      connected: this.spotifyLinked,
      name: this.spotifyLink?.name,
      playback: this.spotifyLinked && getSetting(this.db, "spotify.playback") === "on",
      playlists: this.actionsAllowed().playlist,
    };
  },

  spotifyScopes(extra: { playback?: boolean; playlists?: boolean } = {}): string[] {
    const playback = extra.playback ?? getSetting(this.db, "spotify.playback") === "on";
    const playlists = extra.playlists ?? getSetting(this.db, "spotify.playlists") === "on";
    return [...SPOTIFY_READ, ...(playback ? SPOTIFY_PLAYBACK : []), ...(playlists ? SPOTIFY_PLAYLISTS : [])];
  },

  /** Sign in to Spotify (the user's own Spotify app's Client ID, the first time). */
  async connectSpotify(clientId?: string): Promise<AppState> {
    if (!this.p.oauth) throw new Error("Spotify sign-in works in the Android app and the newest Windows app.");
    if (clientId) await this.spotify.setClientId(clientId);
    const r = await this.spotify.connect(this.p.oauth, this.spotifyScopes());
    setSetting(this.db, "spotify", JSON.stringify({ name: r.name, connected_at: new Date().toISOString() }));
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  },

  async disconnectSpotify(): Promise<AppState> {
    await this.spotify.forget();
    for (const k of ["spotify", "spotify.playback", "spotify.playlists"]) this.db.run("DELETE FROM settings WHERE key = ?", [k]);
    await this.connectors.reset();
    await this.db.flush();
    return this.state();
  },

  /** Playback control or playlist changes: turning one on signs in again with that permission added. */
  /**
   * The song playing on the user's Spotify right now, for the line under Lyra's avatar
   * (null when nothing is playing, Spotify isn't connected, or the switch is off). No AI involved.
   */
  async nowPlaying(): Promise<{ title: string; artist: string } | null> {
    if (!this.spotifyLinked || getSetting(this.db, "spotify.nowPlaying") === "off") return null;
    try {
      const r = await this.spotify.get<{ is_playing?: boolean; item?: { name?: string; artists?: { name: string }[]; show?: { name?: string } } }>("/me/player?additional_types=episode");
      if (!r?.is_playing || !r.item?.name) return null;
      return { title: r.item.name, artist: r.item.artists?.[0]?.name ?? r.item.show?.name ?? "" };
    } catch {
      return null; // a nicety: never an error
    }
  },

  /** Showing what's playing under the avatar: on by default once Spotify is connected. */
  async showNowPlaying(on: boolean): Promise<AppState> {
    setSetting(this.db, "spotify.nowPlaying", on ? "on" : "off");
    await this.db.flush();
    return this.state();
  },

  async allowSpotify(what: "playback" | "playlists", on: boolean): Promise<AppState> {
    if (!this.spotifyLinked) throw new Error("Connect Spotify first.");
    if (on) {
      if (!this.p.oauth) throw new Error("Spotify sign-in isn't available here.");
      const r = await this.spotify.connect(this.p.oauth, this.spotifyScopes({ [what]: true }));
      const need = what === "playback" ? SPOTIFY_PLAYBACK : SPOTIFY_PLAYLISTS;
      if (!need.every((s) => r.scope.split(" ").includes(s))) throw new Error("Spotify didn't grant that permission.");
    }
    setSetting(this.db, `spotify.${what}`, on ? "on" : "off");
    await this.db.flush();
    return this.state();
  },

  /** Play, pause, skip or queue, when the user asked (playback switch on). */
  async controlMusic(action: string, uri?: string): Promise<string> {
    const u = uri?.trim();
    if (u && !/^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/.test(u)) throw new Error("Give a spotify: URI from search.");
    switch (action) {
      case "play":
        await this.spotify.call("PUT", "/me/player/play", u ? (u.startsWith("spotify:track:") ? { uris: [u] } : { context_uri: u }) : undefined);
        return u ? "Playing it." : "Playing.";
      case "pause":
        await this.spotify.call("PUT", "/me/player/pause");
        return "Paused.";
      case "next":
        await this.spotify.call("POST", "/me/player/next");
        return "Skipped to the next song.";
      case "previous":
        await this.spotify.call("POST", "/me/player/previous");
        return "Back to the previous song.";
      case "queue":
        if (!u?.startsWith("spotify:track:")) throw new Error("Queue takes one song's spotify:track: URI.");
        await this.spotify.call("POST", `/me/player/queue?uri=${encodeURIComponent(u)}`);
        return "Added to the queue.";
      default:
        throw new Error("Action must be play, pause, next, previous or queue.");
    }
  },
});
