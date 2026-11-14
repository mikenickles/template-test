import { z } from 'zod';
import { api } from './oauth.ts';
import { clip, defineTool } from './types.ts';
import type { ToolContext } from './types.ts';

const BASE = 'https://api.spotify.com/v1';

const spot = <T>(ctx: ToolContext, path: string, init?: { method?: string; body?: unknown }) =>
  api<T>('spotify', ctx.fetch, BASE + path, { ...init, signal: ctx.signal });

interface Item { name: string; uri: string; id: string; artists?: { name: string }[]; owner?: { display_name?: string }; album?: { name: string } }
interface Device { id: string; name: string; type: string; is_active: boolean }

const view = (x: Item) => ({
  name: x.name,
  by: x.artists?.map((a) => a.name).join(', ') ?? x.owner?.display_name,
  album: x.album?.name,
  uri: x.uri,
  id: x.id,
});

const uri = z.string().regex(/^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$/, 'A Spotify URI like spotify:track:…');

/**
 * Playback calls need a device. If none is active, hand playback to the first
 * device that is at least open, so "play something" works without fiddling.
 */
async function withDevice<T>(ctx: ToolContext, call: (deviceQuery: string) => Promise<T>): Promise<T> {
  try {
    return await call('');
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    const { devices } = await spot<{ devices: Device[] }>(ctx, '/me/player/devices');
    const device = devices?.[0];
    if (!device) throw new Error('Spotify is not open anywhere. Open it on a phone, computer or speaker, then try again.');
    return call(`device_id=${encodeURIComponent(device.id)}`);
  }
}

const search = defineTool({
  name: 'spotify_search',
  description: 'Search Spotify for tracks, albums, artists or playlists. Returns names and URIs you can play or queue.',
  schema: z.object({
    query: z.string().min(1).max(200),
    type: z.enum(['track', 'album', 'artist', 'playlist']).default('track'),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  risk: 'read',
  needs: 'spotify',
  untrusted: true, // playlist names and descriptions are written by anyone
  label: (i) => `Searching Spotify for “${clip(i.query, 50)}”`,
  run: async (i, ctx) => {
    const params = new URLSearchParams({ q: i.query, type: i.type, limit: String(i.limit) });
    const res = await spot<Record<string, { items?: (Item | null)[] }>>(ctx, `/search?${params}`);
    return { results: (res[`${i.type}s`]?.items ?? []).filter((x): x is Item => !!x).map(view) };
  },
});

const nowPlaying = defineTool({
  name: 'spotify_now_playing',
  description: 'See what is playing on Spotify right now, on which device, and at what volume.',
  schema: z.object({}),
  risk: 'read',
  needs: 'spotify',
  label: () => 'Checking what\'s playing',
  run: async (_i, ctx) => {
    const res = await spot<{ is_playing?: boolean; item?: Item; device?: { name: string; volume_percent?: number } }>(ctx, '/me/player');
    if (!res.item) return { playing: false, note: 'Nothing is playing.' };
    return { playing: !!res.is_playing, ...view(res.item), device: res.device?.name, volume: res.device?.volume_percent };
  },
});

const play = defineTool({
  name: 'spotify_play',
  description: 'Play something on Spotify: a track, album, artist or playlist URI from a search. With no URI, resume what was playing. Needs Spotify Premium.',
  schema: z.object({ uri: uri.optional() }),
  risk: 'act',
  needs: 'spotify',
  label: () => 'Starting the music',
  run: async (i, ctx) => {
    const body = !i.uri ? undefined : /^spotify:(track|episode):/.test(i.uri) ? { uris: [i.uri] } : { context_uri: i.uri };
    await withDevice(ctx, (q) => api('spotify', ctx.fetch, `${BASE}/me/player/play${q ? `?${q}` : ''}`, { method: 'PUT', body, signal: ctx.signal, raw: true }));
    return { playing: true };
  },
});

const control = defineTool({
  name: 'spotify_control',
  description: 'Pause, skip to the next or previous track, or set the volume (0-100). Needs Spotify Premium.',
  schema: z.object({ action: z.enum(['pause', 'next', 'previous', 'volume']), volume: z.number().int().min(0).max(100).optional() }),
  risk: 'act',
  needs: 'spotify',
  label: (i) => ({ pause: 'Pausing the music', next: 'Skipping ahead', previous: 'Going back a track', volume: 'Changing the volume' })[i.action],
  run: async (i, ctx) => {
    if (i.action === 'volume' && i.volume === undefined) throw new Error('Give a volume from 0 to 100.');
    const [method, path] =
      i.action === 'pause' ? ['PUT', '/me/player/pause']
      : i.action === 'next' ? ['POST', '/me/player/next']
      : i.action === 'previous' ? ['POST', '/me/player/previous']
      : ['PUT', `/me/player/volume?volume_percent=${i.volume}`];
    await withDevice(ctx, (q) => api('spotify', ctx.fetch, `${BASE}${path}${q ? (path!.includes('?') ? '&' : '?') + q : ''}`, { method, signal: ctx.signal, raw: true }));
    return { done: true };
  },
});

const queue = defineTool({
  name: 'spotify_queue',
  description: 'Add one track to the end of the play queue. Needs Spotify Premium.',
  schema: z.object({ uri }),
  risk: 'act',
  needs: 'spotify',
  label: () => 'Adding to the queue',
  run: async (i, ctx) => {
    await withDevice(ctx, (q) => api('spotify', ctx.fetch, `${BASE}/me/player/queue?uri=${encodeURIComponent(i.uri)}${q ? `&${q}` : ''}`, { method: 'POST', signal: ctx.signal, raw: true }));
    return { queued: true };
  },
});

const playlists = defineTool({
  name: 'spotify_playlists',
  description: 'List the user\'s own Spotify playlists.',
  schema: z.object({}),
  risk: 'read',
  needs: 'spotify',
  label: () => 'Looking at your playlists',
  run: async (_i, ctx) => {
    const res = await spot<{ items?: (Item | null)[] }>(ctx, '/me/playlists?limit=50');
    return { playlists: (res.items ?? []).filter((x): x is Item => !!x).map(view) };
  },
});

const makePlaylist = defineTool({
  name: 'spotify_make_playlist',
  description: 'Create a new private playlist, optionally filled with track URIs, or add tracks to an existing playlist the user owns.',
  schema: z.object({
    playlist_id: z.string().optional().describe('Add to this existing playlist instead of creating a new one.'),
    name: z.string().max(100).optional().describe('Name for a new playlist.'),
    description: z.string().max(300).optional(),
    uris: z.array(uri).max(100).default([]),
  }),
  risk: 'act',
  needs: 'spotify',
  guarded: true,
  label: (i) => (i.playlist_id ? 'Adding to a playlist' : `Making the playlist “${clip(i.name ?? 'New playlist', 40)}”`),
  card: (i) => ({
    title: i.playlist_id ? `Add ${i.uris.length} tracks to this playlist?` : 'Create this playlist?',
    rows: [{ label: 'Playlist', value: i.name ?? i.playlist_id ?? 'New playlist' }, { label: 'Tracks', value: String(i.uris.length) }],
    confirmLabel: i.playlist_id ? 'Add tracks' : 'Create',
    done: i.playlist_id ? 'Tracks added' : `Playlist “${clip(i.name ?? 'New playlist', 40)}” created`,
  }),
  run: async (i, ctx) => {
    let id = i.playlist_id;
    let link: string | undefined;
    if (!id) {
      const made = await spot<{ id: string; external_urls?: { spotify?: string } }>(ctx, '/me/playlists', {
        method: 'POST', body: { name: i.name ?? 'New playlist', description: i.description ?? '', public: false },
      });
      id = made.id;
      link = made.external_urls?.spotify;
    }
    if (i.uris.length) await spot(ctx, `/playlists/${encodeURIComponent(id)}/items`, { method: 'POST', body: { uris: i.uris } });
    return { playlist_id: id, uri: `spotify:playlist:${id}`, added: i.uris.length, link };
  },
});

export const spotifyTools = [search, nowPlaying, play, control, queue, playlists, makePlaylist];

export async function spotifyName(accessToken: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const res = await fetchImpl(`${BASE}/me`, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.ok ? ((await res.json()) as { display_name?: string }).display_name : undefined;
}
