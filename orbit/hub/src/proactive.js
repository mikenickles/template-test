import crypto from 'node:crypto';
import { addUsage, emptyUsage } from './usage.js';

/**
 * Agents that speak first. Four ways in:
 *
 * - Check-ins: a proactive agent looks over what it knows now and then (about once a day when
 *   "gentle", a few times a day when "active"). A quick, cheap model call decides whether there's
 *   anything worth saying; usually there isn't, and nothing happens. When there is, the agent writes
 *   to the user in one of its rooms.
 * - Follow-ups: an agent says "I'll check back Friday" and books it with the follow_up tool.
 * - Watches: an agent keeps an eye on something on the web (a price, a page, news) and speaks up when
 *   it changes or a condition is met.
 * - The morning brief: one agent writes a short daily note at a set time.
 *
 * Every proactive message becomes a card on the app's Home ("From your crew") and a notification.
 * Quiet hours and a daily limit keep it from becoming noise; follow-ups the agent promised still
 * arrive on time.
 */

export const LEVELS = ['off', 'gentle', 'active'];
const CHECK_MODEL = 'claude-haiku-5-5';
const TICK_MS = 60_000;
const KEEP_NUDGES = 20;
const KEEP_NOTICES = 50;
const MAX_FOLLOWUPS = 30;
const MAX_WATCHES = 12;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A brief more than this late (the PC was off) waits for tomorrow. */
const BRIEF_GRACE = 3 * HOUR;

export const DEFAULTS = { quietStart: '21:00', quietEnd: '08:00', dailyLimit: 6, brief: { enabled: false, time: '08:00', agentId: null } };

export class ProactiveError extends Error {
  name = 'ProactiveError';
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Whether `t` falls in quiet hours (local time on this PC). The window can run past midnight. */
export function isQuiet(settings, t) {
  const start = minutesOf(settings.quietStart);
  const end = minutesOf(settings.quietEnd);
  if (start === end) return false;
  const d = new Date(t);
  const now = d.getHours() * 60 + d.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Checks the settings a phone sent and returns the clean ones. */
export function settingsFields(body, existing, agents) {
  const out = { ...existing, brief: { ...existing.brief } };
  if (body.quietStart !== undefined) {
    if (!TIME.test(body.quietStart)) throw new ProactiveError('Pick when quiet hours start.');
    out.quietStart = body.quietStart;
  }
  if (body.quietEnd !== undefined) {
    if (!TIME.test(body.quietEnd)) throw new ProactiveError('Pick when quiet hours end.');
    out.quietEnd = body.quietEnd;
  }
  if (body.dailyLimit !== undefined) {
    const n = Number(body.dailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 30) throw new ProactiveError('The daily limit is between 1 and 30.');
    out.dailyLimit = n;
  }
  const brief = body.brief;
  if (brief && typeof brief === 'object') {
    if (brief.enabled !== undefined) out.brief.enabled = Boolean(brief.enabled);
    if (brief.time !== undefined) {
      if (!TIME.test(brief.time)) throw new ProactiveError('Pick a time for the brief.');
      out.brief.time = brief.time;
    }
    if (brief.agentId !== undefined) {
      if (brief.agentId !== null && !agents.some((a) => a.id === brief.agentId)) throw new ProactiveError('That agent no longer exists.');
      out.brief.agentId = brief.agentId;
    }
  }
  return out;
}

/** The JSON object in a model's answer, or null. */
export function parseJson(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------- Tools a proactive agent gets ----------

export const PROACTIVE_TOOLS = [
  {
    name: 'follow_up',
    description:
      'Come back to the user later, on your own: you will be woken at that time in this chat to follow up. Use it when you said you would check back, or before something the user has coming up. ' +
      'Give either in_minutes or at (ISO 8601 in the user\'s time zone, like 2026-12-01T09:00), and a note for yourself about what to follow up on.',
    input_schema: {
      type: 'object',
      properties: {
        in_minutes: { type: 'integer', minimum: 1, maximum: 259200 },
        at: { type: 'string' },
        note: { type: 'string', description: 'What to follow up on, written for yourself.' },
      },
      required: ['note'],
    },
  },
  {
    name: 'watch',
    description:
      'Keep an eye on something on the web for the user, like a price, a product coming back in stock, a page changing, or news on a topic. It is checked every hour or every day, and you will tell the user in this chat when the condition is met or it changes. Only when the user asks for it or agrees.',
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string', description: 'What to check, specific enough to search for: "the price of the Sony WH-1000XM6 at Best Buy".' },
        condition: { type: 'string', description: 'When to speak up, like "under $300". Leave empty to report meaningful changes.' },
        every: { type: 'string', enum: ['hour', 'day'] },
      },
      required: ['what', 'every'],
    },
  },
  {
    name: 'stop_watching',
    description: 'Stop a watch, by the id listed in your instructions.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

export const PROACTIVE_ACTIVITY = { follow_up: 'followup', watch: 'watch', stop_watching: 'watch_stop' };

export class Proactive {
  /**
   * @param {{ store: import('./store.js').Store, orchestrator: import('./orchestrator.js').Orchestrator, providers: any,
   *   google?: import('./google.js').Google|null, ledger?: any, now?: () => number, log?: (line: string) => void }} deps
   */
  constructor({ store, orchestrator, providers, google = null, ledger = null, now = Date.now, log = () => {} }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.providers = providers;
    this.google = google;
    this.ledger = ledger;
    this.now = now;
    this.log = log;
    this.busy = false;
    const s = (store.state.proactive ??= {});
    for (const [key, value] of Object.entries(DEFAULTS)) s[key] ??= structuredClone(value);
    s.brief = { ...DEFAULTS.brief, ...s.brief };
    s.agents ??= {}; // agentId -> { next, last }
    s.sent ??= []; // times proactive messages went out, for the daily limit
    store.state.followups ??= [];
    store.state.watches ??= [];
    store.state.nudges ??= [];
    store.state.notices ??= [];
  }

  get state() {
    return this.store.state.proactive;
  }

  /** What the app shows and edits. */
  settings() {
    const { quietStart, quietEnd, dailyLimit, brief } = this.state;
    return { quietStart, quietEnd, dailyLimit, brief };
  }

  update(body) {
    const next = settingsFields(body, this.settings(), this.store.state.agents);
    Object.assign(this.state, next);
    this.store.save();
    return this.settings();
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  // ---------- What the app lists ----------

  followups() {
    return this.store.state.followups;
  }

  watches() {
    return this.store.state.watches.map(({ lastFinding, ...w }) => ({ ...w, lastFinding: lastFinding ?? '' }));
  }

  nudges() {
    return this.store.state.nudges;
  }

  removeFollowup(id) {
    this.store.state.followups = this.store.state.followups.filter((f) => f.id !== id);
    this.store.save();
  }

  removeWatch(id) {
    this.store.state.watches = this.store.state.watches.filter((w) => w.id !== id);
    this.store.save();
  }

  dismiss(id) {
    this.store.state.nudges = this.store.state.nudges.filter((n) => n.id !== id);
    this.store.save();
  }

  /** The user opened or answered a room, so its cards have been seen. */
  seen(roomId) {
    const before = this.store.state.nudges.length;
    this.store.state.nudges = this.store.state.nudges.filter((n) => n.roomId !== roomId);
    if (this.store.state.nudges.length !== before) this.store.save();
  }

  /** Things tied to a room or agent that's gone go with it. */
  forget({ roomId = null, agentId = null }) {
    const keep = (x) => (roomId ? x.roomId !== roomId : true) && (agentId ? x.agentId !== agentId : true);
    this.store.state.followups = this.store.state.followups.filter(keep);
    this.store.state.watches = this.store.state.watches.filter(keep);
    this.store.state.nudges = this.store.state.nudges.filter(keep);
    if (agentId) {
      delete this.state.agents[agentId];
      if (this.state.brief.agentId === agentId) this.state.brief.agentId = null;
    }
  }

  // ---------- The tools, for one agent in one room ----------

  toolsFor(agent, room) {
    const mine = (list) => list.filter((x) => x.agentId === agent.id);
    const watches = mine(this.store.state.watches);
    const followups = mine(this.store.state.followups);
    const today = new Date(this.now()).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
      `- Be proactive: you can come back to the user later with follow_up, and keep an eye on things on the web with watch. Offer when it would genuinely help, like checking back before a deadline or watching a price, and use them when the user agrees. Today is ${today}.`,
    ];
    if (followups.length) lines.push(`  Follow-ups you have set: ${followups.map((f) => `${when(f.at)}: ${f.note}`).join('; ')}.`);
    if (watches.length) lines.push(`  Things you are watching: ${watches.map((w) => `[id ${w.id}] ${w.what}${w.condition ? ` (when ${w.condition})` : ''}, every ${w.every}`).join('; ')}.`);
    return {
      prompt: lines.join('\n'),
      run: (name, input) => {
        try {
          if (name === 'follow_up') return { text: this.#addFollowup(agent, room, input ?? {}), isError: false };
          if (name === 'watch') return { text: this.#addWatch(agent, room, input ?? {}), isError: false };
          if (name === 'stop_watching') return { text: this.#stopWatch(agent, input ?? {}), isError: false };
          return { text: `There is no tool called "${name}".`, isError: true };
        } catch (err) {
          if (err instanceof ProactiveError) return { text: err.message, isError: true };
          throw err;
        }
      },
    };
  }

  #addFollowup(agent, room, input) {
    const note = clean(input.note, 500);
    if (!note) throw new ProactiveError('Say what to follow up on in note.');
    let at = null;
    if (Number.isInteger(input.in_minutes)) at = this.now() + input.in_minutes * 60_000;
    else if (typeof input.at === 'string' && !Number.isNaN(new Date(input.at).getTime())) at = new Date(input.at).getTime();
    if (!at) throw new ProactiveError('Give in_minutes, or at as a date and time like 2026-12-01T09:00.');
    if (at < this.now() + 30_000) throw new ProactiveError('That time has already passed.');
    if (at > this.now() + 180 * DAY) throw new ProactiveError('Follow-ups can be up to six months ahead.');
    if (this.store.state.followups.filter((f) => f.agentId === agent.id).length >= MAX_FOLLOWUPS) {
      throw new ProactiveError('You already have many follow-ups set. Let some pass first.');
    }
    this.store.state.followups.push({ id: crypto.randomUUID(), agentId: agent.id, roomId: room.id, at, note, createdAt: this.now() });
    this.store.save();
    return `Follow-up set for ${when(at)}. You'll be woken in this chat then.`;
  }

  #addWatch(agent, room, input) {
    const what = clean(input.what, 300);
    if (!what) throw new ProactiveError('Say what to watch.');
    if (!this.#canCheckWeb()) throw new ProactiveError('Watching needs an Anthropic key on the hub, for web searches.');
    if (this.store.state.watches.length >= MAX_WATCHES) throw new ProactiveError('The crew is already watching a lot. Stop a watch first.');
    const every = input.every === 'hour' ? 'hour' : 'day';
    const watch = {
      id: crypto.randomUUID().slice(0, 8),
      agentId: agent.id,
      roomId: room.id,
      what,
      condition: clean(input.condition, 200),
      every,
      createdAt: this.now(),
      nextCheckAt: this.now() + 60_000,
      lastCheckedAt: null,
      lastFinding: null,
    };
    this.store.state.watches.push(watch);
    this.store.save();
    return `Watching "${what}"${watch.condition ? ` for when ${watch.condition}` : ''}, checked every ${every}. Its id is ${watch.id}.`;
  }

  #stopWatch(agent, input) {
    const watch = this.store.state.watches.find((w) => w.id === clean(input.id, 40));
    if (!watch) throw new ProactiveError('There is no watch with that id.');
    this.removeWatch(watch.id);
    return `Stopped watching "${watch.what}".`;
  }

  // ---------- The clock ----------

  /** Runs whatever is due. One thing at a time, so a slow model call never piles up. */
  async tick(now = this.now()) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.#dueFollowups(now);
      await this.#brief(now);
      if (!isQuiet(this.state, now)) {
        await this.#dueWatch(now);
        if (this.#underLimit(now)) await this.#dueCheckIn(now);
      }
    } catch (err) {
      this.log(`[treehouse] proactive: ${err?.message ?? err}`);
    } finally {
      this.busy = false;
    }
  }

  #underLimit(now) {
    this.state.sent = this.state.sent.filter((t) => t > now - DAY);
    const today = dayKey(now);
    return this.state.sent.filter((t) => dayKey(t) === today).length < this.state.dailyLimit;
  }

  #usable(agent) {
    const kind = this.providers.kindOf?.(agent.provider);
    return Boolean(kind) && kind !== 'demo' && this.providers.isConfigured(agent.provider);
  }

  #canCheckWeb() {
    return this.providers.isConfigured('anthropic') && this.providers.kindOf?.('anthropic') === 'anthropic';
  }

  async #dueFollowups(now) {
    const due = this.store.state.followups.filter((f) => f.at <= now).sort((a, b) => a.at - b.at);
    for (const f of due) {
      const agent = this.store.agent(f.agentId);
      const room = this.store.room(f.roomId);
      if (!agent || !room?.agentIds.includes(agent.id)) {
        this.removeFollowup(f.id);
        continue;
      }
      if (this.orchestrator.runState(room.id).active) continue; // next tick
      this.removeFollowup(f.id);
      await this.reach(agent, room, [
        `[System]: You set a follow-up for now, on ${when(f.createdAt)}: "${f.note}".`,
        'Follow up with the user in a short message, picking up where things were left. Use your tools if they help (check the calendar or the web, say).',
      ].join(' '), { kind: 'followup', label: 'Follow-up' });
    }
  }

  async #brief(now) {
    const brief = this.state.brief;
    if (!brief.enabled) return;
    const at = new Date(now);
    const [h, m] = brief.time.split(':').map(Number);
    at.setHours(h, m, 0, 0);
    const today = dayKey(now);
    if (now < at.getTime() || this.state.lastBriefDay === today) return;
    if (now - at.getTime() > BRIEF_GRACE) {
      this.state.lastBriefDay = today; // the PC was off; there's always tomorrow
      this.store.save();
      return;
    }
    const agent = this.store.agent(brief.agentId) ?? this.#guide();
    if (!agent || !this.#usable(agent)) return;
    let room = this.store.state.rooms.find((r) => r.brief);
    if (!room) {
      room = { id: crypto.randomUUID(), name: 'Morning brief', agentIds: [agent.id], mode: 'roundtable', leadId: null, brief: true,
        description: 'A short daily note to start the day.', createdAt: now, updatedAt: now };
      this.store.state.rooms.push(room);
    } else if (room.agentIds.join() !== agent.id) {
      room.agentIds = [agent.id];
    }
    if (this.orchestrator.runState(room.id).active) return;
    this.state.lastBriefDay = today;
    this.store.save();
    await this.reach(agent, room, this.#briefPrompt(agent, room, now), { kind: 'brief', label: 'Morning brief' }, { counts: false });
  }

  #guide() {
    const intro = this.store.state.rooms.find((r) => r.intro);
    return this.store.agent(intro?.agentIds[0]) ?? this.store.state.agents.find((a) => this.#usable(a)) ?? null;
  }

  #briefPrompt(agent, briefRoom, now) {
    const google = this.google?.connected && (agent.abilities ?? []).includes('google');
    const web = (agent.abilities ?? []).includes('web');
    const recent = this.store.state.rooms
      .filter((r) => r.id !== briefRoom.id && r.updatedAt > now - 2 * DAY)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6)
      .map((r) => {
        const last = this.store.messages(r.id).findLast((m) => m.text?.trim() && m.status !== 'error');
        return `  - ${r.name}${last ? `: last, ${last.author.name} said "${clean(last.text, 200)}"` : ''}`;
      });
    const dueToday = this.store.state.followups.filter((f) => dayKey(f.at) === dayKey(now)).map((f) => `  - ${when(f.at)}: ${f.note}`);
    return [
      `[System]: It's ${new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}. Write the user's morning brief: a short, warm, scannable note to start their day. Cover what applies:`,
      google ? "- Today on their calendar (calendar_events), and anything they'll need to prepare." : null,
      google ? '- Unread email from the last day that matters (gmail_search "is:unread newer_than:1d"). Skip newsletters and promotions.' : null,
      recent.length ? `- What the crew has been working on:\n${recent.join('\n')}` : null,
      dueToday.length ? `- Follow-ups due today:\n${dueToday.join('\n')}` : null,
      web ? "- One or two useful things for today from the web, like the weather where they are (if you know where) or news on what they're into." : null,
      'Use short headings or bullets, stay under 200 words, and end with one suggestion of what to tackle first. Leave out anything with nothing to report.',
    ].filter(Boolean).join('\n');
  }

  async #dueWatch(now) {
    const watch = this.store.state.watches.filter((w) => w.nextCheckAt <= now).sort((a, b) => a.nextCheckAt - b.nextCheckAt)[0];
    if (!watch) return;
    const agent = this.store.agent(watch.agentId);
    const room = this.store.room(watch.roomId);
    if (!agent || !room) {
      this.removeWatch(watch.id);
      return;
    }
    watch.nextCheckAt = now + (watch.every === 'hour' ? HOUR : DAY);
    this.store.save();
    if (!this.#canCheckWeb()) return;
    const result = await this.#check(watch, agent, room);
    if (!result) return;
    const previous = watch.lastFinding;
    watch.lastFinding = clean(result.finding, 400);
    watch.lastCheckedAt = now;
    this.store.save();
    // The first check sets a starting point, unless the condition is already met.
    if (!result.notify || (!previous && !watch.condition)) return;
    if (!this.#underLimit(now) || this.orchestrator.runState(room.id).active) return;
    await this.reach(agent, room, [
      `[System]: Something you're watching for the user needs their attention. Watch: "${watch.what}"${watch.condition ? `, telling them when ${watch.condition}` : ''}.`,
      `What the check just found: ${watch.lastFinding}${previous ? ` (before: ${previous})` : ''}.`,
      'Tell the user in a short message, with where you found it. If this watch has done its job, say you will stop watching and call stop_watching.',
    ].join(' '), { kind: 'watch', label: watch.what });
  }

  /** One web check for a watch, with a quick model. Null if it couldn't be done. */
  async #check(watch, agent, room) {
    const prompt = [
      `Check this on the web for the user: ${watch.what}.`,
      watch.condition ? `They want to know when: ${watch.condition}.` : 'They want to know about meaningful changes.',
      `What the last check found: ${watch.lastFinding ?? 'nothing yet, this is the first check'}.`,
      'Search now, then reply with only a JSON object: {"finding": "the current state in one sentence, with the key number or fact and the source site", "notify": true or false}.',
      watch.condition
        ? 'notify is true only if the condition is met now and the last check did not already find it met.'
        : 'notify is true only if this is a meaningful change from the last check (not wording or tiny moves).',
    ].join('\n');
    let usage = null;
    try {
      const text = await this.providers.stream({
        provider: 'anthropic',
        model: CHECK_MODEL,
        system: 'You check things on the web for a user and report precisely. Never guess: if you cannot find it, say so in finding and set notify to false.',
        messages: [{ role: 'user', content: prompt }],
        abilities: { web: true },
        agent,
        signal: AbortSignal.timeout(180_000),
        onDelta: () => {},
        onUsage: (u) => {
          usage = addUsage(usage ?? emptyUsage(), u);
        },
      });
      if (usage) this.ledger?.record({ agentId: agent.id, roomId: room.id, model: CHECK_MODEL, usage });
      const parsed = parseJson(text);
      if (!parsed || typeof parsed.finding !== 'string') return null;
      return { finding: parsed.finding, notify: parsed.notify === true };
    } catch (err) {
      this.log(`[treehouse] couldn't check "${watch.what}": ${err?.message ?? err}`);
      return null;
    }
  }

  async #dueCheckIn(now) {
    const s = this.state.agents;
    for (const agent of this.store.state.agents) {
      const level = agent.proactive ?? 'off';
      if (level === 'off') {
        delete s[agent.id];
        continue;
      }
      // Newly proactive: a first look soon, so the user sees it working.
      s[agent.id] ??= { next: now + (10 + Math.random() * 30) * 60_000, last: null, level };
      if (s[agent.id].level !== level) Object.assign(s[agent.id], { level, next: Math.min(s[agent.id].next, now + this.#gap(level)) });
    }
    const dueAgent = this.store.state.agents.find((a) => (a.proactive ?? 'off') !== 'off' && s[a.id]?.next <= now && this.#usable(a));
    if (!dueAgent) return;
    s[dueAgent.id].next = now + this.#gap(dueAgent.proactive);
    s[dueAgent.id].last = now;
    this.store.save();
    const rooms = this.store.state.rooms
      .filter((r) => r.agentIds.includes(dueAgent.id) && !r.brief)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4);
    if (!rooms.length) return;
    const decision = await this.#decide(dueAgent, rooms, now);
    if (!decision) return;
    const room = rooms.find((r) => r.name.toLowerCase() === String(decision.room ?? '').toLowerCase()) ?? rooms[0];
    if (this.orchestrator.runState(room.id).active) return;
    await this.reach(dueAgent, room, [
      '[System]: Nobody asked; you are reaching out to the user on your own, because you noticed something worth their attention:',
      `"${clean(decision.topic, 500)}".`,
      'Write one short, friendly message about it, the way a thoughtful colleague would. Use your tools if they help. Offer something concrete. Ask at most one question.',
    ].join(' '), { kind: 'checkin', label: 'Check-in' });
  }

  /** Time until the next check-in: about a day when gentle, a few hours when active. */
  #gap(level) {
    return level === 'active' ? (3 + Math.random() * 2) * HOUR : (20 + Math.random() * 8) * HOUR;
  }

  /**
   * The quick call that decides whether a check-in says anything. Claude Haiku when the hub has a
   * Claude key, otherwise the agent's own model. Null means stay quiet.
   */
  async #decide(agent, rooms, now) {
    const choice = this.#canCheckWeb() ? { provider: 'anthropic', model: CHECK_MODEL } : { provider: agent.provider, model: agent.model };
    const profile = this.store.state.profile ?? {};
    const lines = [
      `It is ${new Date(now).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
      `You are deciding whether ${agent.name}${agent.role ? ` (${agent.role})` : ''} should message the user right now, unprompted.`,
      agent.instructions?.trim() ? `${agent.name}'s instructions: ${clean(agent.instructions, 1200)}` : null,
      profile.name || profile.notes?.length ? `About the user: ${[profile.name ? `they go by ${profile.name}` : null, ...(profile.notes ?? []).map((n) => n.text)].filter(Boolean).join('; ')}.` : null,
      agent.memory?.length ? `${agent.name}'s notes: ${agent.memory.map((n) => n.text).join('; ')}.` : null,
      '',
      'Recent conversations:',
    ];
    for (const room of rooms) {
      const recent = this.store.messages(room.id).filter((m) => m.text?.trim() && m.status !== 'error').slice(-8);
      lines.push(`Room "${room.name}"${room.description ? ` (${clean(room.description, 200)})` : ''}:`);
      if (!recent.length) lines.push('  (nothing yet)');
      for (const m of recent) lines.push(`  [${when(m.createdAt)}] ${m.author.type === 'user' ? 'User' : m.author.name}: ${clean(m.text, 300)}`);
    }
    const followups = this.store.state.followups.filter((f) => f.agentId === agent.id);
    if (followups.length) lines.push('', `Already-booked follow-ups (don't duplicate): ${followups.map((f) => `${when(f.at)} ${f.note}`).join('; ')}`);
    const sent = this.store.state.nudges.filter((n) => n.agentId === agent.id).slice(-5);
    if (sent.length) lines.push('', `What ${agent.name} recently brought up unprompted (don't repeat): ${sent.map((n) => n.text).join(' | ')}`);
    if (this.google?.connected && (agent.abilities ?? []).includes('google')) {
      const peek = await this.#googlePeek(now);
      if (peek) lines.push('', peek);
    }
    lines.push(
      '',
      'Reach out only for something timely and genuinely useful the user would be glad to hear now: a deadline or event coming up, a plan they mentioned for today, following through on something discussed, an email or meeting that needs them. ' +
        'Not small talk, not a generic "how are you", not something already covered. When in doubt, don\'t.',
      'Reply with only a JSON object: {"reach_out": true or false, "room": "the room name to post in", "topic": "what to bring up and why, in one or two sentences"}.',
    );
    let usage = null;
    try {
      const answer = await this.providers.stream({
        provider: choice.provider,
        model: choice.model,
        system: 'You decide whether an AI assistant should send its user a proactive message. You are strict: most of the time the answer is no.',
        messages: [{ role: 'user', content: lines.filter((l) => l !== null).join('\n') }],
        agent,
        signal: AbortSignal.timeout(60_000),
        onDelta: () => {},
        onUsage: (u) => {
          usage = addUsage(usage ?? emptyUsage(), u);
        },
      });
      if (usage) this.ledger?.record({ agentId: agent.id, roomId: rooms[0].id, model: choice.model, usage });
      const parsed = parseJson(answer);
      return parsed?.reach_out === true && clean(parsed.topic, 500) ? parsed : null;
    } catch (err) {
      this.log(`[treehouse] ${agent.name}'s check-in failed: ${err?.message ?? err}`);
      return null;
    }
  }

  /** The next day's calendar and fresh unread mail, in a few lines, for a check-in to weigh. */
  async #googlePeek(now) {
    const parts = [];
    try {
      parts.push(`Calendar, next 24 hours:\n${await this.google.listEvents({ from: new Date(now).toISOString(), to: new Date(now + DAY).toISOString() })}`);
    } catch {
      // Not worth failing a check-in over.
    }
    try {
      parts.push(`Unread email from the last day:\n${(await this.google.searchMail({ query: 'is:unread newer_than:1d -category:promotions -category:social', max: 5 })).replace(/\n {2}.*$/gm, '')}`);
    } catch {
      // Same.
    }
    return parts.join('\n\n');
  }

  /**
   * Has an agent write to the user in a room, unprompted, and once it's written, puts it on Home and
   * in the phone's notifications. Resolves when it's done.
   */
  async reach(agent, room, prompt, proactive, { counts = true } = {}) {
    const marker = { id: crypto.randomUUID(), ...proactive };
    if (!this.orchestrator.reachOut(room.id, agent.id, prompt, marker)) return null;
    await this.orchestrator.idle(room.id);
    const message = this.store.messages(room.id).find((m) => m.proactive?.id === marker.id);
    if (!message || message.status !== 'done' || !message.text.trim()) return null;
    const at = this.now();
    if (counts) this.state.sent.push(at);
    const text = clean(message.text.replace(/\*\*|~~|`+|^#+\s|^>\s?/gm, ''), 300);
    this.store.state.nudges.push({ id: marker.id, at, kind: proactive.kind, label: proactive.label ?? '', agentId: agent.id, roomId: room.id, messageId: message.id, text });
    if (this.store.state.nudges.length > KEEP_NUDGES) this.store.state.nudges.splice(0, this.store.state.nudges.length - KEEP_NUDGES);
    const notices = this.store.state.notices;
    notices.push({ id: marker.id, at, roomId: room.id, room: room.name, author: agent.name, agentId: agent.id, character: agent.avatar?.character ?? null, text, replies: 1, kind: 'proactive' });
    if (notices.length > KEEP_NOTICES) notices.splice(0, notices.length - KEEP_NOTICES);
    this.store.save();
    return message;
  }
}
