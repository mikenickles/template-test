import { db, now } from '../db.ts';
import { getSettings, isQuiet } from '../settings.ts';
import { isMoneyTool } from '../tools/index.ts';
import { notify } from './activity.ts';
import { expireStale } from './approvals.ts';
import { runTurn } from './loop.ts';
import { NOTHING } from './prompt.ts';
import { claimDue } from './schedule.ts';
import type { Routine } from './schedule.ts';
import { addMessage } from './thread.ts';

function proactiveToday(): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const row = db()
    .prepare("select count(*) as n from messages where thread = 'main' and kind = 'routine' and role = 'assistant' and created_at >= ?")
    .get(midnight.getTime()) as { n: number };
  return row.n;
}

/** Run one routine in its own scratch thread and bring only the result into the conversation. */
export async function fire(routine: Routine): Promise<void> {
  const outcome = await runTurn({
    thread: `routine-${routine.id}-${now()}`,
    text: routine.instructions,
    interactive: false,
    routineTitle: routine.title,
  });
  const text = outcome.text.trim();
  if (!outcome.ok) {
    addMessage('main', 'note', { text: `I couldn't run “${routine.title}” just now. I'll try again at its next time.` });
    return;
  }
  if (!text || text.includes(NOTHING)) return; // nothing worth a message

  const reminder = routine.once_at !== null;
  const s = getSettings();
  // A reminder you asked for always rings. Routines stay quiet at night and
  // once the day's allowance is used: the report is still there when you look.
  const ring = reminder || (!isQuiet(new Date()) && proactiveToday() < s.proactiveDailyCap);
  addMessage('main', 'assistant', { text, title: routine.title }, 'routine');
  if (ring) notify(routine.title, text.split('\n')[0]!.replace(/[*_#`]/g, ''));
}

let busy = false;

export async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    expireStale(isMoneyTool);
    db().prepare("delete from messages where thread like 'routine-%' and created_at < ?").run(now() - 7 * 24 * 3600_000);
    if (getSettings().paused) return; // due routines wait until Arlo is unpaused
    for (const routine of claimDue()) await fire(routine);
  } catch (err) {
    console.error('Scheduler error:', err);
  } finally {
    busy = false;
  }
}

export function startScheduler(everyMs = 20_000): () => void {
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
