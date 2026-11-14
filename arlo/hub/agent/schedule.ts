import { db, now } from '../db.ts';

export interface Routine {
  id: number;
  title: string;
  instructions: string;
  /** One-off: the moment to run (epoch ms). */
  once_at: number | null;
  /** Repeating: local time of day, "HH:MM". */
  time: string | null;
  /** Repeating: days of the week as JSON (0 = Sunday); null = every day. */
  days: string | null;
  next_run: number | null;
  enabled: number;
  last_run: number | null;
  created_at: number;
}

export const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** The next moment at or after `from` that falls on one of `days` at `time` (local time). */
export function nextOccurrence(time: string, days: number[] | null, from: Date): number {
  const [h, m] = time.split(':').map(Number);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, h || 0, m || 0, 0, 0);
    if (candidate.getTime() <= from.getTime()) continue;
    if (!days || days.length === 0 || days.includes(candidate.getDay())) return candidate.getTime();
  }
  throw new Error('no next occurrence');
}

export function describeSchedule(r: Pick<Routine, 'once_at' | 'time' | 'days'>): string {
  if (r.once_at) {
    return new Date(r.once_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  const days: number[] | null = r.days ? JSON.parse(r.days) : null;
  const [h, m] = (r.time ?? '00:00').split(':').map(Number);
  const at = new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!days || days.length === 0 || days.length === 7) return `Every day at ${at}`;
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return `Weekdays at ${at}`;
  if (sorted.join() === '0,6') return `Weekends at ${at}`;
  return `${sorted.map((d) => DAY_NAMES[d]![0]!.toUpperCase() + DAY_NAMES[d]!.slice(1)).join(', ')} at ${at}`;
}

export function createRoutine(input: { title: string; instructions: string; at?: number; time?: string; days?: number[] }): Routine {
  const at = now();
  const next = input.at ?? nextOccurrence(input.time!, input.days ?? null, new Date(at));
  const info = db()
    .prepare('insert into tasks(title, instructions, once_at, time, days, next_run, enabled, created_at) values(?, ?, ?, ?, ?, ?, 1, ?)')
    .run(input.title, input.instructions, input.at ?? null, input.time ?? null, input.days?.length ? JSON.stringify(input.days) : null, next, at);
  return getRoutine(Number(info.lastInsertRowid))!;
}

export function getRoutine(id: number): Routine | null {
  return (db().prepare('select * from tasks where id = ?').get(id) as unknown as Routine | undefined) ?? null;
}

export function listRoutines(): Routine[] {
  return db().prepare('select * from tasks where enabled = 1 order by next_run').all() as unknown as Routine[];
}

export function deleteRoutine(id: number): boolean {
  return db().prepare('delete from tasks where id = ?').run(id).changes > 0;
}

export function routineView(r: Routine) {
  return { id: r.id, title: r.title, instructions: r.instructions, when: describeSchedule(r), once: !!r.once_at, next: r.next_run };
}

/** Repeating routines missed by more than this (hub was off) are skipped rather than run late. */
const LATE_LIMIT_MS = 2 * 3600_000;

/** Routines that should run now. Advances each one's schedule as it is claimed. */
export function claimDue(at: number = now()): Routine[] {
  const due = db().prepare('select * from tasks where enabled = 1 and next_run is not null and next_run <= ?').all(at) as unknown as Routine[];
  const run: Routine[] = [];
  for (const r of due) {
    if (r.once_at) {
      db().prepare('update tasks set enabled = 0, last_run = ? where id = ?').run(at, r.id);
      run.push(r);
      continue;
    }
    const days: number[] | null = r.days ? JSON.parse(r.days) : null;
    const next = nextOccurrence(r.time!, days, new Date(at));
    const late = at - r.next_run! > LATE_LIMIT_MS;
    db().prepare('update tasks set next_run = ?, last_run = case when ? then last_run else ? end where id = ?').run(next, late ? 1 : 0, at, r.id);
    if (!late) run.push(r);
  }
  return run;
}
