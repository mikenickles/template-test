/**
 * Lyra's Spotify connector: an in-app MCP server that can only look. What's playing,
 * what you've played, your top artists and songs, search, and your playlists.
 * Controlling playback and changing playlists are separate (and need their own switches).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AUTH_EXPIRED } from "../google-http.ts";
import type { SpotifyAuth } from "./auth.ts";

interface Artist {
  name: string;
  uri?: string;
  genres?: string[];
}
interface Track {
  name: string;
  uri: string;
  artists?: Artist[];
  album?: { name?: string };
  duration_ms?: number;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const by = (t: Track) => (t.artists ?? []).map((a) => a.name).join(", ");
export const trackLine = (t: Track) => `- ${t.name} · ${by(t)}${t.album?.name ? ` · ${t.album.name}` : ""} · ${t.uri}`;

export function createSpotifyServer(spotify: SpotifyAuth): McpServer {
  const server = new McpServer({ name: "lyra-spotify", version: "0.1.0" });
  const get = async <T>(path: string): Promise<T> => {
    try {
      return await spotify.get<T>(path);
    } catch (e) {
      if ((e as Error).message === "SPOTIFY_EXPIRED") throw new Error(`${AUTH_EXPIRED}: Spotify needs you to sign in again.`);
      throw e;
    }
  };
  const ro = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "now_playing",
    { title: "Now playing", description: "What's playing on the user's Spotify right now, and on which device.", inputSchema: {}, annotations: ro },
    async () => {
      const r = await get<{ is_playing?: boolean; item?: Track; device?: { name?: string; type?: string } }>("/me/player");
      if (!r.item) return text("Nothing is playing.");
      return text(`${r.is_playing ? "Playing" : "Paused"}${r.device?.name ? ` on ${r.device.name}` : ""}:\n${trackLine(r.item)}`);
    },
  );

  server.registerTool(
    "recently_played",
    { title: "Recently played", description: "The songs the user played most recently on Spotify.", inputSchema: { limit: z.number().int().min(1).max(50).optional() }, annotations: ro },
    async ({ limit }) => {
      const r = await get<{ items?: { track: Track; played_at: string }[] }>(`/me/player/recently-played?limit=${limit ?? 20}`);
      const items = r.items ?? [];
      return text(items.length ? items.map((i) => trackLine(i.track)).join("\n") : "Nothing played recently.");
    },
  );

  server.registerTool(
    "top_items",
    {
      title: "Top artists or songs",
      description: "The user's most-played artists or songs over the last 4 weeks, 6 months, or all time.",
      inputSchema: {
        type: z.enum(["artists", "tracks"]),
        time_range: z.enum(["short_term", "medium_term", "long_term"]).optional().describe("short_term: ~4 weeks, medium_term: ~6 months, long_term: years."),
      },
      annotations: ro,
    },
    async ({ type, time_range }) => {
      const r = await get<{ items?: (Track & Artist)[] }>(`/me/top/${type}?limit=20&time_range=${time_range ?? "medium_term"}`);
      const items = r.items ?? [];
      if (!items.length) return text("Not enough listening yet.");
      return text(type === "artists" ? items.map((a) => `- ${a.name}${a.genres?.length ? ` (${a.genres.slice(0, 3).join(", ")})` : ""} · ${a.uri}`).join("\n") : items.map((t) => trackLine(t)).join("\n"));
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search Spotify",
      description: "Find songs, artists, albums or playlists on Spotify. Results include spotify: URIs to play, queue or add to a playlist.",
      inputSchema: { query: z.string().min(1).max(200), type: z.enum(["track", "artist", "album", "playlist"]).optional() },
      annotations: ro,
    },
    async ({ query, type }) => {
      const t = type ?? "track";
      const r = await get<Record<string, { items?: (Track & Artist & { owner?: { display_name?: string }; artists?: Artist[] })[] }>>(
        `/search?${new URLSearchParams({ q: query, type: t, limit: "8" })}`,
      );
      const items = (r[`${t}s`]?.items ?? []).filter(Boolean);
      if (!items.length) return text(`Nothing on Spotify for "${query}".`);
      return text(
        items
          .map((i) =>
            t === "track"
              ? trackLine(i)
              : t === "artist"
                ? `- ${i.name} · ${i.uri}`
                : t === "album"
                  ? `- ${i.name} · ${(i.artists ?? []).map((a) => a.name).join(", ")} · ${i.uri}`
                  : `- ${i.name}${i.owner?.display_name ? ` · by ${i.owner.display_name}` : ""} · ${i.uri}`,
          )
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "my_playlists",
    { title: "My playlists", description: "The user's Spotify playlists (theirs and followed), with ids.", inputSchema: {}, annotations: ro },
    async () => {
      const r = await get<{ items?: { id: string; name: string; owner?: { display_name?: string }; tracks?: { total?: number }; uri: string }[] }>("/me/playlists?limit=50");
      const items = (r.items ?? []).filter(Boolean);
      return text(items.length ? items.map((p) => `- ${p.name} · ${p.tracks?.total ?? "?"} songs${p.owner?.display_name ? ` · by ${p.owner.display_name}` : ""} · id: ${p.id} · ${p.uri}`).join("\n") : "No playlists.");
    },
  );

  server.registerTool(
    "playlist_tracks",
    {
      title: "Songs in a playlist",
      description: "The songs in one playlist (an id from my_playlists or search).",
      inputSchema: { playlist_id: z.string().regex(/^[A-Za-z0-9]{10,40}$/, "a playlist id") },
      annotations: ro,
    },
    async ({ playlist_id }) => {
      const r = await get<{ items?: { track: Track | null }[] }>(`/playlists/${playlist_id}/tracks?limit=100`);
      const items = (r.items ?? []).map((i) => i.track).filter((t): t is Track => !!t);
      return text(items.length ? items.map(trackLine).join("\n") : "That playlist is empty.");
    },
  );

  return server;
}
