import crypto from 'node:crypto';

/** A run missed by more than this (the PC was asleep or off) is skipped, not sent late. */
const LATE_LIMIT_MS = 6 * 60 * 60 * 1000;
/** Phones fetch results this far back at most. */
const KEEP_NOTICES = 50;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class ScheduleError extends Error {
  name = 'ScheduleError';
}

/** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri". Days are 0 (Sunday) to 6. */
export function describeDays(days) {
  const set = [...new Set(days)].sort();
  if (set.length === 7) return 'Every day';
  if (set.join() === '1,2,3,4,5') return 'Weekdays';
  if (set.join() === '0,6') return 'Weekends';
  // Week order starting Monday.
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.includes(d)).map((d) => DAY_NAMES[d]).join(', ');
}

export const describeSchedule = (s) => `${describeDays(s.days)} at ${s.time}`;

/** The next time, strictly after `after` (local time on this PC), that the schedule falls on. */
export function nextRun(schedule, after) {
  const [hour, minute] = schedule.time.split(':').map(Number);
  const at = new Date(after);
  at.setSeconds(0, 0);
  at.setHours(hour, minute);
  for (let i = 0; i < 8; i++) {
    if (at.getTime() > after && schedule.days.includes(at.getDay())) return at.getTime();
    at.setDate(at.getDate() + 1);
    at.setHours(hour, minute); // stays right across daylight-saving changes
  }
  return null;
}

/** Checks what a phone sent for a schedule and returns the clean fields. */
export function scheduleFields(body, rooms) {
  const roomId = String(body.roomId ?? '');
  if (!rooms.some((r) => r.id === roomId)) throw new ScheduleError('That room no longer exists.');
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!text) throw new ScheduleError('Write what the crew should be asked.');
  const time = String(body.time ?? '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ScheduleError('Pick a time.');
  const days = Array.isArray(body.days) ? [...new Set(body.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  if (!days.length) throw new ScheduleError('Pick at least one day.');
  return { roomId, text, time, days, enabled: body.enabled !== false };
}

/**
 * Runs rooms on a schedule. At each due time the hub posts the schedule's message into its room, as
 * if the user had sent it, and when the crew finishes it keeps a short notice that phones collect
 * to show a notification. Times are the PC's local time.
 */
export class Scheduler {
  /**
   * @param {{store: import('./store.js').Store, orchestrator: import('./orchestrator.js').Orchestrator,
   *   now?: () => number, log?: (line: string) => void}} deps
   */
  constructor({ store, orchestrator, now = Date.now, log = () => {} }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.now = now;
    this.log = log;
    store.state.schedules ??= [];
    store.state.notices ??= [];
    this.pending = new Map(); // roomId -> schedule, while a scheduled run is going
  }

  list() {
    return this.store.state.schedules;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 20_000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  create(body) {
    const schedule = { id: crypto.randomUUID(), createdAt: this.now(), lastRunAt: null, ...scheduleFields(body, this.store.state.rooms) };
    schedule.nextRunAt = schedule.enabled ? nextRun(schedule, this.now()) : null;
    this.store.state.schedules.push(schedule);
    this.store.save();
    return schedule;
  }

  update(id, body) {
    const schedule = this.#find(id);
    Object.assign(schedule, scheduleFields({ ...schedule, ...body }, this.store.state.rooms));
    schedule.nextRunAt = schedule.enabled ? nextRun(schedule, this.now()) : null;
    this.store.save();
    return schedule;
  }

  remove(id) {
    this.store.state.schedules = this.store.state.schedules.filter((s) => s.id !== id);
    this.store.save();
  }

  /** Schedules of rooms that are gone go with them. */
  forgetRoom(roomId) {
    this.store.state.schedules = this.store.state.schedules.filter((s) => s.roomId !== roomId);
  }

  #find(id) {
    const schedule = this.store.state.schedules.find((s) => s.id === id);
    if (!schedule) throw new ScheduleError('That schedule no longer exists.');
    return schedule;
  }

  /** Posts the schedule's message now, whatever the time. */
  run(id) {
    const schedule = this.#find(id);
    const room = this.store.room(schedule.roomId);
    if (!room?.agentIds.length) throw new ScheduleError('That room has no agents to ask.');
    schedule.lastRunAt = this.now();
    this.pending.set(room.id, schedule);
    this.orchestrator.post(room.id, schedule.text, [], { scheduled: { id: schedule.id, label: describeSchedule(schedule) } });
    this.store.save();
  }

  /** Runs whatever is due. A run missed by hours (the PC was off) is skipped rather than sent late. */
  tick(now = this.now()) {
    for (const schedule of this.store.state.schedules) {
      if (!schedule.enabled || schedule.nextRunAt == null || schedule.nextRunAt > now) continue;
      const late = now - schedule.nextRunAt;
      schedule.nextRunAt = nextRun(schedule, now);
      if (late > LATE_LIMIT_MS) {
        this.log(`[orbit] skipped a scheduled run of "${schedule.text.slice(0, 40)}": the PC was off at ${schedule.time}.`);
        continue;
      }
      try {
        this.run(schedule.id);
      } catch (err) {
        this.log(`[orbit] couldn't run a schedule: ${err.message}`);
      }
    }
    this.store.save();
  }

  /** Called when a room's run ends. A scheduled run leaves a notice with the crew's last reply. */
  finished(roomId) {
    const schedule = this.pending.get(roomId);
    if (!schedule) return;
    this.pending.delete(roomId);
    const messages = this.store.messages(roomId);
    const asked = messages.findLastIndex((m) => m.scheduled?.id === schedule.id);
    const replies = messages.slice(asked + 1).filter((m) => m.author.type === 'agent' && m.status !== 'streaming');
    const last = replies.at(-1);
    const notices = this.store.state.notices;
    notices.push({
      id: crypto.randomUUID(),
      at: this.now(),
      roomId,
      room: this.store.room(roomId)?.name ?? '',
      scheduleId: schedule.id,
      author: last?.author.name ?? '',
      text: last ? (last.status === 'error' ? `couldn't reply: ${last.error ?? 'something went wrong'}` : last.text.replace(/\s+/g, ' ').trim().slice(0, 300)) : '',
      replies: replies.length,
    });
    if (notices.length > KEEP_NOTICES) notices.splice(0, notices.length - KEEP_NOTICES);
    this.store.save();
  }

  /** Notices newer than `since`, for a phone catching up. */
  noticesSince(since) {
    return this.store.state.notices.filter((n) => n.at > since);
  }
}
