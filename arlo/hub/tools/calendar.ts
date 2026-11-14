import { z } from 'zod';
import { api } from './oauth.ts';
import { clip, defineTool } from './types.ts';
import type { ToolContext } from './types.ts';

const BASE = 'https://www.googleapis.com/calendar/v3';
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const cal = <T>(ctx: ToolContext, path: string, init?: { method?: string; body?: unknown }) =>
  api<T>('google', ctx.fetch, BASE + path, { ...init, signal: ctx.signal });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const when = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/, 'Use YYYY-MM-DD or YYYY-MM-DDTHH:MM');

/** A local date or date-time, as the Calendar API wants it. */
export function eventTime(value: string) {
  if (DAY.test(value)) return { date: value };
  return { dateTime: value.length === 16 ? `${value}:00` : value, timeZone: zone() };
}

/** Local wall-clock text to an absolute instant; a bare date means the start (or end) of that day. */
export function instant(value: string, endOfDay = false): string {
  return new Date(DAY.test(value) ? `${value}T${endOfDay ? '23:59:59' : '00:00:00'}` : value).toISOString();
}

interface Event {
  id: string; summary?: string; description?: string; location?: string; htmlLink?: string; status?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  attendees?: { email: string; responseStatus?: string; self?: boolean }[]; organizer?: { email?: string; self?: boolean };
}

const view = (e: Event) => ({
  id: e.id,
  title: e.summary ?? '(no title)',
  start: e.start?.dateTime ?? e.start?.date,
  end: e.end?.dateTime ?? e.end?.date,
  all_day: !!e.start?.date,
  location: e.location,
  organizer: e.organizer?.self ? 'you' : e.organizer?.email,
  attendees: e.attendees?.filter((a) => !a.self).map((a) => a.email),
  notes: e.description ? clip(e.description.replace(/<[^>]+>/g, ' '), 400) : undefined,
});

const pretty = (value: string) =>
  DAY.test(value)
    ? new Date(`${value}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const list = defineTool({
  name: 'calendar_list',
  description: 'List events on the user\'s calendar between two local dates or date-times, optionally filtered by text.',
  schema: z.object({ from: when, to: when, query: z.string().optional() }),
  risk: 'read',
  needs: 'google',
  untrusted: true, // invitations are written by other people
  label: () => 'Checking your calendar',
  run: async (i, ctx) => {
    const params = new URLSearchParams({
      timeMin: instant(i.from), timeMax: instant(i.to, true), singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
    });
    if (i.query) params.set('q', i.query);
    const res = await cal<{ items?: Event[] }>(ctx, `/calendars/primary/events?${params}`);
    return { events: (res.items ?? []).filter((e) => e.status !== 'cancelled').map(view) };
  },
});

const free = defineTool({
  name: 'calendar_busy',
  description: 'Get the busy blocks on the user\'s calendar between two local date-times. Use it to find a free slot.',
  schema: z.object({ from: when, to: when }),
  risk: 'read',
  needs: 'google',
  label: () => 'Looking for free time',
  run: async (i, ctx) => {
    const res = await cal<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(ctx, '/freeBusy', {
      method: 'POST',
      body: { timeMin: instant(i.from), timeMax: instant(i.to, true), timeZone: zone(), items: [{ id: 'primary' }] },
    });
    return { busy: res.calendars?.primary?.busy ?? [] };
  },
});

const eventFields = z.object({
  title: z.string().min(1).max(200),
  start: when,
  end: when,
  location: z.string().max(300).optional(),
  notes: z.string().max(4000).optional(),
  invite: z.array(z.email()).max(30).optional().describe('People to invite. They are emailed an invitation, so the user must approve.'),
});

const create = defineTool({
  name: 'calendar_create',
  description:
    'Add an event to the user\'s calendar. Use local time: "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD" for an all-day event ' +
    '(for all-day events the end date is the day after the last day). Inviting people sends them an email.',
  schema: eventFields,
  risk: 'act',
  needs: 'google',
  guarded: true,
  escalate: (i) => !!i.invite?.length,
  label: (i) => `Adding “${clip(i.title, 40)}” to your calendar`,
  card: (i) => ({
    title: i.invite?.length ? 'Create this event and send invites?' : 'Add this to your calendar?',
    rows: [
      { label: 'Event', value: i.title },
      { label: 'When', value: `${pretty(i.start)} to ${pretty(i.end)}` },
      ...(i.location ? [{ label: 'Where', value: i.location }] : []),
      ...(i.invite?.length ? [{ label: 'Inviting', value: i.invite.join(', ') }] : []),
    ],
    body: i.notes ? clip(i.notes, 600) : undefined,
    warning: i.invite?.length ? 'Everyone invited gets an email straight away.' : undefined,
    confirmLabel: i.invite?.length ? 'Create and invite' : 'Add event',
    done: `Added “${clip(i.title, 40)}” to your calendar`,
  }),
  run: async (i, ctx) => {
    const res = await cal<Event>(ctx, `/calendars/primary/events?sendUpdates=${i.invite?.length ? 'all' : 'none'}`, {
      method: 'POST',
      body: {
        summary: i.title, start: eventTime(i.start), end: eventTime(i.end), location: i.location, description: i.notes,
        attendees: i.invite?.map((email) => ({ email })),
      },
    });
    return { created: true, ...view(res), link: res.htmlLink };
  },
});

const update = defineTool({
  name: 'calendar_update',
  description: 'Change an existing event (time, title, place, notes, or add people). Anyone already invited is told about the change.',
  schema: z.object({
    event_id: z.string(),
    what: z.string().max(200).describe('One line describing the change, shown to the user.'),
    title: z.string().max(200).optional(),
    start: when.optional(),
    end: when.optional(),
    location: z.string().max(300).optional(),
    notes: z.string().max(4000).optional(),
    invite: z.array(z.email()).max(30).optional(),
  }),
  risk: 'confirm',
  needs: 'google',
  label: () => 'Updating an event',
  card: (i) => ({
    title: 'Change this event?',
    rows: [
      { label: 'Change', value: i.what },
      ...(i.start ? [{ label: 'New start', value: pretty(i.start) }] : []),
      ...(i.end ? [{ label: 'New end', value: pretty(i.end) }] : []),
      ...(i.invite?.length ? [{ label: 'Adding', value: i.invite.join(', ') }] : []),
    ],
    warning: 'Guests on the event are notified.',
    confirmLabel: 'Update event',
    done: 'Event updated',
  }),
  run: async (i, ctx) => {
    const path = `/calendars/primary/events/${encodeURIComponent(i.event_id)}`;
    const patch: Record<string, unknown> = {};
    if (i.title) patch.summary = i.title;
    if (i.start) patch.start = eventTime(i.start);
    if (i.end) patch.end = eventTime(i.end);
    if (i.location !== undefined) patch.location = i.location;
    if (i.notes !== undefined) patch.description = i.notes;
    if (i.invite?.length) {
      const current = await cal<Event>(ctx, path);
      patch.attendees = [...(current.attendees ?? []), ...i.invite.map((email) => ({ email }))];
    }
    const res = await cal<Event>(ctx, `${path}?sendUpdates=all`, { method: 'PATCH', body: patch });
    return { updated: true, ...view(res) };
  },
});

const remove = defineTool({
  name: 'calendar_delete',
  description: 'Delete an event from the user\'s calendar. Guests are told it was cancelled.',
  schema: z.object({ event_id: z.string(), title: z.string().max(200).describe('The event\'s title, shown to the user.') }),
  risk: 'confirm',
  needs: 'google',
  label: () => 'Deleting an event',
  card: (i) => ({
    title: 'Delete this event?',
    rows: [{ label: 'Event', value: i.title }],
    warning: 'Guests are told it was cancelled.',
    confirmLabel: 'Delete',
    done: `Deleted “${clip(i.title, 40)}”`,
  }),
  run: async (i, ctx) => {
    await api('google', ctx.fetch, `${BASE}/calendars/primary/events/${encodeURIComponent(i.event_id)}?sendUpdates=all`, {
      method: 'DELETE', signal: ctx.signal, raw: true,
    });
    return { deleted: true };
  },
});

export const calendarTools = [list, free, create, update, remove];
