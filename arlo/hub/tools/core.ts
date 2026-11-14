import { z } from 'zod';
import { addMemory, CATEGORIES, deleteMemory, searchMemories } from '../agent/memory.ts';
import { createRoutine, DAY_NAMES, deleteRoutine, describeSchedule, listRoutines, routineView } from '../agent/schedule.ts';
import { clip, defineTool } from './types.ts';

const remember = defineTool({
  name: 'remember',
  description:
    'Save something to long-term memory so you have it in every future conversation. For lasting preferences, people, ' +
    'standing instructions and recurring facts. Not for one-off details.',
  schema: z.object({
    text: z.string().min(3).max(500).describe('One self-contained sentence.'),
    category: z.enum(CATEGORIES).default('fact'),
  }),
  risk: 'act',
  guarded: true,
  label: () => 'Saving to memory',
  card: (i) => ({ title: 'Remember this?', rows: [], body: i.text, confirmLabel: 'Remember', done: 'Saved to memory' }),
  run: async (i) => ({ saved: true, id: addMemory(i.text, i.category).id }),
});

const recall = defineTool({
  name: 'recall',
  description: 'Search long-term memory. Most memories are already in your instructions; use this when the list there was cut short.',
  schema: z.object({ query: z.string().min(1) }),
  risk: 'read',
  label: () => 'Checking memory',
  run: async (i) => searchMemories(i.query).map((m) => ({ id: m.id, text: m.text, category: m.category })),
});

const forget = defineTool({
  name: 'forget',
  description: 'Delete one memory by its id (the number in square brackets). Use when the user asks you to forget something or corrects it.',
  schema: z.object({ id: z.number().int() }),
  risk: 'act',
  label: () => 'Forgetting that',
  run: async (i) => ({ forgotten: deleteMemory(i.id) }),
});

const routineSchema = z.object({
  title: z.string().min(2).max(60).describe('A short name, e.g. "Morning brief" or "Call the dentist".'),
  instructions: z.string().min(5).max(2000).describe('What to do when it runs, written as a complete instruction to yourself.'),
  at: z.string().optional().describe('For a one-off (a reminder): local date and time as "YYYY-MM-DDTHH:MM".'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('For a repeating routine: local time of day, "HH:MM" in 24-hour time.'),
  days: z.array(z.enum(DAY_NAMES)).optional().describe('For a repeating routine: which days. Leave out for every day.'),
});

function routineTiming(i: z.infer<typeof routineSchema>): { at?: number; time?: string; days?: number[] } {
  if (i.at && i.time) throw new Error('Give either "at" (one-off) or "time" (repeating), not both.');
  if (i.at) {
    const at = new Date(i.at).getTime();
    if (Number.isNaN(at)) throw new Error('"at" must look like 2026-11-14T09:30.');
    if (at <= Date.now()) throw new Error('"at" is in the past.');
    return { at };
  }
  if (!i.time) throw new Error('Give "at" for a one-off or "time" for a repeating routine.');
  return { time: i.time, days: i.days?.map((d) => DAY_NAMES.indexOf(d)) };
}

const routineCreate = defineTool({
  name: 'routine_create',
  description:
    'Schedule something for later: a one-off reminder ("at") or a repeating routine ("time", optionally "days"). ' +
    'When it runs you get the instructions as a fresh task with your usual tools, and your reply is sent to the user.',
  schema: routineSchema,
  risk: 'act',
  guarded: true,
  label: (i) => `Setting up "${i.title}"`,
  card: (i) => {
    let when = 'Unclear';
    try {
      const t = routineTiming(i);
      when = describeSchedule({ once_at: t.at ?? null, time: t.time ?? null, days: t.days ? JSON.stringify(t.days) : null });
    } catch { /* shown as unclear; run() reports the real problem */ }
    return {
      title: i.at ? 'Set this reminder?' : 'Set up this routine?',
      rows: [{ label: 'Name', value: i.title }, { label: 'When', value: when }],
      body: clip(i.instructions, 400),
      confirmLabel: 'Set it up',
      done: i.at ? 'Reminder set' : 'Routine set up',
    };
  },
  run: async (i) => routineView(createRoutine({ title: i.title, instructions: i.instructions, ...routineTiming(i) })),
});

const routineList = defineTool({
  name: 'routine_list',
  description: 'List the reminders and routines that are currently scheduled.',
  schema: z.object({}),
  risk: 'read',
  label: () => 'Checking your routines',
  run: async () => listRoutines().map(routineView),
});

const routineDelete = defineTool({
  name: 'routine_delete',
  description: 'Cancel a reminder or routine by id.',
  schema: z.object({ id: z.number().int() }),
  risk: 'act',
  label: () => 'Cancelling a routine',
  run: async (i) => ({ cancelled: deleteRoutine(i.id) }),
});

const webSearch = defineTool({
  name: 'web_search',
  description:
    'Look something up on the web. A separate research helper with no access to the user\'s accounts does the searching and ' +
    'returns a short answer with sources. Ask a full question rather than keywords.',
  schema: z.object({ query: z.string().min(2).max(400) }),
  risk: 'read',
  untrusted: true,
  label: (i) => `Searching the web for “${clip(i.query, 60)}”`,
  run: async (i, ctx) => {
    const result = await ctx.search(i.query);
    return { answer: result.text, sources: result.sources };
  },
});

export const coreTools = [remember, recall, forget, routineCreate, routineList, routineDelete, webSearch];
