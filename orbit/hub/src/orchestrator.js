import crypto from 'node:crypto';
import { kindOf } from './files.js';
import { runMemoryTool } from './memory.js';
import { CrewError, createCrew, introPrompt } from './intro.js';
import { RecruitError, createAgent, recruitPrompt } from './recruit.js';
import { addUsage, emptyUsage } from './usage.js';
import { GOOGLE_PROMPT, runGoogleTool } from './google.js';
import { APP_SUMMARY, GUIDE, SELF_PROMPT, modelOf, selfTools } from './self.js';

/** Upper bound on agent replies per user message, so @mention chains can't loop forever. */
export const MAX_TURNS = 12;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Agents from `candidates` that `text` @mentions, in order of first appearance. */
export function findMentions(text, candidates) {
  if (/@(everyone|all)\b/i.test(text)) return [...candidates];
  const hits = [];
  for (const agent of candidates) {
    // "@Nova", and "@NightOwl" or "@Night Owl" for a name with spaces.
    const pattern = agent.name.trim().split(/\s+/).map(escapeRegex).join('\\s?');
    const match = new RegExp(`@${pattern}(?![\\p{L}\\p{N}_])`, 'iu').exec(text);
    if (match) hits.push({ agent, index: match.index });
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.agent);
}

/**
 * Who answers a fresh user message. @mentions always win. In a "best fit" room this returns null
 * when the choice needs a model (see Orchestrator#pick).
 */
export function initialSpeakers(room, agents, text) {
  const mentioned = findMentions(text, agents);
  if (mentioned.length) return mentioned;
  if (room.mode === 'lead') {
    const lead = agents.find((a) => a.id === room.leadId) ?? agents[0];
    return lead ? [lead] : [];
  }
  if (room.mode === 'auto' && agents.length > 1) return null;
  return [...agents];
}

/** The agents a picker's answer names, in the order it named them. */
export function namedAgents(answer, agents) {
  const hits = [];
  for (const agent of agents) {
    const pattern = agent.name.trim().split(/\s+/).map(escapeRegex).join('\\s?');
    const match = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'iu').exec(answer);
    if (match) hits.push({ agent, index: match.index });
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.agent);
}

/**
 * Abilities an agent can be given. "files" reads folders shared from the PC; "crew" hires new agents;
 * "google" uses the user's Gmail, Calendar and Drive once Google is connected on the PC.
 */
export const ABILITIES = ['web', 'code', 'files', 'memory', 'crew', 'google'];

/**
 * What an agent can do on this turn. Abilities only work with providers that support them; elsewhere
 * the agent runs without them, and its prompt doesn't mention them.
 */
export function resolveAbilities(agent, providers, folders, save = () => {}, { profile = null, force = [], google = null } = {}) {
  if (!providers.supportsAbilities?.(agent.provider)) return null;
  const on = new Set([...(agent.abilities ?? []), ...force]);
  // A proactive agent can book follow-ups and watch things; Orchestrator#speak fills in the tools. Every agent
  // on a provider with tools can read the Treehouse guide and change itself, so this is never empty.
  const proactive = (agent.proactive ?? 'off') !== 'off';
  const claude = providers.kindOf?.(agent.provider) === 'anthropic';
  return {
    web: on.has('web'),
    // Running code needs Anthropic's sandbox.
    code: on.has('code') && claude,
    files: on.has('files'),
    folders: on.has('files') ? folders : null,
    // Notes about the user that the whole crew shares, and the agent's own: "remember", "forget" and friends.
    memory: on.has('memory') ? { run: (name, input) => runMemoryTool(agent, name, input, save, profile) } : null,
    // Hiring needs the room and the reply, so Orchestrator#speak fills it in.
    hire: on.has('crew'),
    google: on.has('google') && google?.connected ? { run: (name, input) => runGoogleTool(google, name, input) } : null,
    wantsGoogle: on.has('google'),
    proactiveOn: proactive,
  };
}

export function buildSystemPrompt(agent, room, agents, abilities = null, profile = null) {
  const teammates = agents.filter((a) => a.id !== agent.id);
  const isLead = room.mode === 'lead' && (room.leadId === agent.id || (!room.leadId && agents[0]?.id === agent.id));
  const lines = [
    teammates.length
      ? `You are ${agent.name}${agent.role ? `, ${agent.role}` : ''}. You are one of several AI agents working with a user in Treehouse, in a group chat called "${room.name}".`
      : `You are ${agent.name}${agent.role ? `, ${agent.role}` : ''}, one of the user's AI agents in Treehouse, talking with them in a chat called "${room.name}".`,
    // Agents are asked how they're set up; they should know without looking it up.
    `You run on the model ${modelOf(agent)}.${agent.proactive && agent.proactive !== 'off' ? ` You reach out on your own (${agent.proactive}).` : ''} If the user asks about your setup (your model, abilities or instructions), answer from what you're told here.`,
    '',
    APP_SUMMARY,
  ];
  if (agent.instructions?.trim()) lines.push('', agent.instructions.trim());
  if (teammates.length) {
    lines.push('', 'Your teammates in this chat:');
    for (const t of teammates) lines.push(`- ${t.name}${t.role ? `: ${t.role}` : ''} (on ${t.model})`);
  }
  lines.push(
    '',
    'How the chat works:',
    '- Messages from the user and from teammates arrive prefixed with the speaker in brackets, like "[User]:" or "[Nova]:". Write your own replies as plain text with no prefix.',
  );
  if (teammates.length) {
    lines.push(
      '- To hand work to a teammate or ask them something, mention them as @Name. A mentioned teammate replies next, so only mention someone when you need their input.',
      '- Build on what teammates have said instead of repeating it, and keep replies as short as the task allows.',
    );
  }
  if (isLead && teammates.length) {
    lines.push(
      '- You lead this chat. Decide what the request needs, delegate parts to teammates with @mentions, and once they have replied give the user one combined answer.',
    );
  }
  if (room.mode === 'auto' && teammates.length) {
    lines.push(
      '- Only the agents best suited to each message answer it, and you were picked for this one. Answer it yourself; bring in a teammate with @Name only when they would clearly add something.',
    );
  }
  if (room.description?.trim()) {
    lines.push('', 'About this room, from the user (keep to it):', room.description.trim());
  }
  if (profile?.name || profile?.notes?.length) {
    lines.push('', "About the user, as your whole crew knows them (use it where it helps; don't recite it):");
    if (profile.name) lines.push(`- They like to be called ${profile.name}.`);
    for (const note of profile.notes ?? []) lines.push(`- ${note.text}`);
  }
  if (agent.memory?.length) {
    lines.push('', "Your own notes from earlier conversations (use them where they help; don't recite them):");
    for (const note of agent.memory) lines.push(`- ${note.text}`);
  }
  if (abilities) {
    lines.push('', 'What you can do here:');
    if (abilities.web && abilities.hubWeb && !abilities.hubWeb.canSearch) {
      lines.push('- Read web pages with web_fetch, when you have an address. (Searching the web needs an Anthropic key on the hub.)');
    } else if (abilities.web) {
      lines.push('- Search the web and read web pages. Use them for anything recent or that you are unsure of, and say where facts came from.');
    }
    if (abilities.code) lines.push('- Run code in a sandbox, for calculations, working with data, and checking your work.');
    if (abilities.files) {
      const names = abilities.folders?.list().map((f) => f.name) ?? [];
      lines.push(
        names.length
          ? `- Read files in folders the user shared from their PC: ${names.join(', ')}. This is read only: you can't change, add or delete files.`
          : "- Read files the user shares from their PC. None are shared yet; if the user asks about their files, tell them to share a folder from the Treehouse page on their PC.",
      );
    }
    if (abilities.recruit) lines.push(abilities.recruit.prompt);
    if (abilities.google) lines.push(GOOGLE_PROMPT);
    else if (abilities.wantsGoogle) {
      lines.push("- You could use the user's Gmail, Calendar and Drive, but Google isn't connected yet. If they ask about their email or calendar, tell them to connect Google in Treehouse on their PC, under Settings.");
    }
    if (abilities.proactive) lines.push(abilities.proactive.prompt);
    if (abilities.memory) {
      lines.push(
        '- Remember things for future chats. Facts about the user (who they are, what they like, their plans) go in remember_about_user, which the whole crew shares. Notes about your own work with them (decisions, ongoing projects) go in remember. Save only what they would want kept, and forget things when they ask or they stop being true.',
      );
    }
    if (abilities.self) lines.push(SELF_PROMPT);
  } else {
    // Without tools, the whole guide comes along, so questions about Treehouse still get real answers.
    lines.push('', 'The Treehouse guide, for questions about the app (answer from it; never guess):', '', GUIDE);
  }
  if (room.intro && !teammates.length) lines.push(introPrompt(profile));
  return lines.join('\n');
}

/**
 * Adds parts to a turn's content. Text-only turns stay plain strings; a turn with attachments
 * becomes a list of parts.
 */
function joinContent(content, parts) {
  if (parts.every((p) => p.type === 'text')) {
    const text = parts.map((p) => p.text).join('\n\n');
    if (typeof content === 'string') return content ? `${content}\n\n${text}` : text;
    return [...content, { type: 'text', text }];
  }
  const before = typeof content === 'string' ? (content ? [{ type: 'text', text: content }] : []) : content;
  return [...before, ...parts];
}

/** How many attachments, newest first, are sent in full. Older ones are mentioned by name. */
export const MAX_ATTACHED = 8;
/** Text files are sent up to this many characters. */
const MAX_TEXT_FILE = 60_000;

/**
 * Turns attachment references into what models read: images and PDFs as base64, text files as text.
 * Only the newest few are sent in full; older ones, and any that are gone, become a note.
 */
export function resolveAttachments(turns, files) {
  let budget = MAX_ATTACHED;
  for (let t = turns.length - 1; t >= 0; t--) {
    const content = turns[t].content;
    if (typeof content === 'string') continue;
    for (let i = content.length - 1; i >= 0; i--) {
      if (content[i].type === 'attachment') content[i] = resolveOne(content[i], files, budget-- > 0);
    }
  }
  return turns;
}

function resolveOne(part, files, inFull) {
  const note = (why) => ({ type: 'text', text: `[${part.name} ${why}]` });
  if (!inFull) return note('was attached earlier');
  const bytes = files?.read(part.id);
  if (!bytes) return note('was attached, but is no longer on the PC');
  switch (kindOf(part.fileType)) {
    case 'image':
      return { type: 'image', mediaType: part.fileType, data: bytes.toString('base64'), name: part.name };
    case 'pdf':
      return { type: 'pdf', data: bytes.toString('base64'), name: part.name };
    case 'text': {
      const text = bytes.toString('utf8');
      const cut = text.length > MAX_TEXT_FILE ? `${text.slice(0, MAX_TEXT_FILE)}\n[…the rest of ${part.name} is cut off]` : text;
      return { type: 'text', text: `[File ${part.name}]\n${cut}` };
    }
    default:
      return note('was attached, but is not a kind of file models can read');
  }
}

/** Placeholder turns buildTranscript adds when a chat ends on an agent or hasn't started. */
const FILLERS = ['[System]: Your teammates have nothing to add. Wrap up for the user.', '[System]: The user just opened this chat. Say hello.'];

/** Ends a transcript with `text` from the hub, replacing a placeholder turn if there is one. */
export function withPrompt(turns, text) {
  const out = [...turns];
  const last = out.at(-1);
  if (last?.role === 'user' && FILLERS.includes(last.content)) out[out.length - 1] = { role: 'user', content: text };
  else if (last?.role === 'user') out[out.length - 1] = { role: 'user', content: joinContent(last.content, [{ type: 'text', text }]) };
  else out.push({ role: 'user', content: text });
  return out;
}

/** How much recent history is sent word for word, in characters (about four to a token). */
export const RECENT_CHARS = 60_000;
/** How much further history may grow before its oldest part is folded into the room's summary. */
export const FOLD_AFTER = 40_000;
/** Claude model that writes summaries for agents on Anthropic: quick and inexpensive. */
const SUMMARY_MODEL = 'claude-haiku-5-5';

const sizeOf = (messages) => messages.reduce((n, m) => n + (m.text?.length ?? 0), 0);

/** Splits messages into [older, recent], where recent is the newest run that fits in `budget` characters. */
export function splitForBudget(messages, budget) {
  let used = 0;
  let start = messages.length;
  while (start > 0 && used + (messages[start - 1].text?.length ?? 0) <= budget) used += messages[--start].text?.length ?? 0;
  // The newest message is always kept, however long.
  if (start === messages.length && start > 0) start--;
  return [messages.slice(0, start), messages.slice(start)];
}

/**
 * The room history from one agent's point of view, as alternating chat turns. A long room's older
 * messages arrive as `summary`; `omitted` says some were left out without one.
 */
export function buildTranscript(agent, messages, { summary = null, omitted = false } = {}) {
  const turns = [];
  if (summary) turns.push({ role: 'user', content: `[Summary of this chat before the messages below]: ${summary}` });
  else if (omitted) turns.push({ role: 'user', content: '[Earlier messages in this chat are not shown.]' });
  for (const m of messages) {
    const attached = m.attachments ?? [];
    if ((!m.text?.trim() && !attached.length) || m.status === 'error') continue;
    const mine = m.author.type === 'agent' && m.author.agentId === agent.id;
    const role = mine ? 'assistant' : 'user';
    const said = m.text?.trim() ? m.text : `(sent ${attached.map((a) => a.name).join(', ')})`;
    // A reply says what it answers, so the agent knows which message the user means.
    const speaker = m.author.type === 'user' ? (m.replyTo ? `User, replying to ${m.replyTo.name}: "${m.replyTo.text}"` : 'User') : m.author.name;
    const text = mine ? said : `[${speaker}]: ${said}`;
    // Attachments go before the words about them, which is how models read them best.
    const parts = [...attached.map((a) => ({ type: 'attachment', id: a.id, name: a.name, fileType: a.type })), { type: 'text', text }];
    const prev = turns.at(-1);
    if (prev?.role === role) prev.content = joinContent(prev.content, parts);
    else turns.push({ role, content: joinContent('', parts) });
  }
  if (turns.at(-1)?.role === 'assistant') {
    turns.push({ role: 'user', content: '[System]: Your teammates have nothing to add. Wrap up for the user.' });
  }
  // Conversations must open with a user turn.
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: '[The chat continues.]' });
  // An agent opening a chat nobody has written in yet, like the intro, starts from this.
  if (!turns.length) turns.push({ role: 'user', content: '[System]: The user just opened this chat. Say hello.' });
  return turns;
}

/**
 * Runs the group chats: decides who speaks after each message, streams their
 * replies, and follows @mention hand-offs. One run per room at a time; runs
 * live on the hub, so they keep going while the phone is asleep.
 */
export class Orchestrator {
  /**
   * @param {{store: import('./store.js').Store, providers: any, folders?: import('./folders.js').Folders,
   *   emit: (roomId: string, event: string, data: any) => void}} deps
   */
  constructor({ store, providers, folders = null, ledger = null, files = null, google = null, emit }) {
    this.store = store;
    this.google = google;
    /** Set by the hub once it's made: follow-ups and watches for proactive agents. */
    this.proactive = null;
    /** Set by the hub: its name and addresses, for the Treehouse guide's live summary. */
    this.hubInfo = null;
    this.files = files;
    this.providers = providers;
    this.folders = folders;
    this.ledger = ledger;
    this.emit = emit;
    this.runs = new Map();
  }

  runState(roomId) {
    const run = this.runs.get(roomId);
    return { active: Boolean(run), agentId: run?.speaking ?? null };
  }

  /** Add a user message and make sure a run is answering it. */
  post(roomId, text, attachments = [], extra = {}) {
    const message = this.#append(roomId, { type: 'user', name: 'You' }, text, 'done', { ...(attachments.length ? { attachments } : {}), ...extra });
    const run = this.runs.get(roomId);
    if (run) {
      run.restart = true; // picked up when the current speaker finishes
    } else {
      this.#start(roomId, (room, agents, run) => this.#firstSpeakers(room, agents, text, run.abort.signal, extra.replyTo));
    }
    return message;
  }

  /**
   * Has one agent write to the user unprompted, guided by `prompt` (which the user never sees). Only
   * that agent speaks; @mentions in what it writes don't hand off. False if the room is busy.
   */
  reachOut(roomId, agentId, prompt, proactive) {
    if (this.runs.has(roomId)) return false;
    this.#start(roomId, (room, agents, run) => {
      run.prompt = { agentId, text: prompt, proactive };
      run.solo = true;
      return agents.filter((a) => a.id === agentId);
    });
    return true;
  }

  /** Has one agent open a room, speaking first. False if the room is busy. */
  greet(roomId, agentId) {
    return this.retry(roomId, agentId);
  }

  /** Has one agent answer again, as the next to speak. False if the room is busy. */
  retry(roomId, agentId) {
    if (this.runs.has(roomId)) return false;
    this.#start(roomId, (room, agents) => agents.filter((a) => a.id === agentId));
    return true;
  }

  /** Removes a finished message from a room. */
  remove(roomId, messageId) {
    const list = this.store.messages(roomId);
    const index = list.findIndex((m) => m.id === messageId);
    if (index < 0) return false;
    list.splice(index, 1);
    this.store.save();
    this.emit(roomId, 'removed', { id: messageId });
    return true;
  }

  #start(roomId, firstSpeakers) {
    const run = { abort: new AbortController(), speaking: null, restart: false };
    this.runs.set(roomId, run);
    run.done = this.#run(roomId, run, firstSpeakers).finally(() => {
      this.runs.delete(roomId);
      this.emit(roomId, 'run', this.runState(roomId));
    });
  }

  stop(roomId) {
    this.runs.get(roomId)?.abort.abort();
  }

  /** Resolves when the room's current run (if any) has finished. */
  async idle(roomId) {
    await this.runs.get(roomId)?.done;
  }

  #roomAgents(room) {
    return room.agentIds.map((id) => this.store.agent(id)).filter(Boolean);
  }

  #append(roomId, author, text, status, extra = {}) {
    const list = this.store.messages(roomId);
    const message = {
      id: crypto.randomUUID(),
      roomId,
      seq: (list.at(-1)?.seq ?? 0) + 1,
      author,
      text,
      status,
      createdAt: Date.now(),
      ...extra,
    };
    list.push(message);
    const room = this.store.room(roomId);
    if (room) room.updatedAt = message.createdAt;
    this.store.save();
    this.emit(roomId, 'message', message);
    return message;
  }

  async #run(roomId, run, firstSpeakers) {
    const first = this.store.room(roomId);
    let queue = first ? await firstSpeakers(first, this.#roomAgents(first), run) : [];
    let turns = 0;
    let wrapped = false;

    while (queue.length && turns < MAX_TURNS && !run.abort.signal.aborted) {
      const room = this.store.room(roomId);
      if (!room) return;
      const agents = this.#roomAgents(room);
      const next = queue.shift();
      const agent = agents.find((a) => a.id === next.id);
      if (!agent) continue; // removed from the room mid-run
      turns += 1;

      const reply = await this.#speak(room, agent, agents, run);

      if (run.restart) {
        // The user said something new while this agent was talking.
        run.restart = false;
        const latest = this.store.messages(roomId).findLast((m) => m.author.type === 'user');
        queue = await this.#firstSpeakers(room, agents, latest?.text ?? '', run.abort.signal, latest?.replyTo);
        turns = 0;
        wrapped = false;
        continue;
      }
      if (reply?.status === 'done' && !run.solo) {
        const others = agents.filter((a) => a.id !== agent.id);
        for (const mentioned of findMentions(reply.text, others)) {
          if (!queue.some((q) => q.id === mentioned.id)) queue.push(mentioned);
        }
      }
      // In lead mode the lead closes the loop once teammates have weighed in.
      if (!queue.length && room.mode === 'lead' && !wrapped && !run.solo) {
        const lead = agents.find((a) => a.id === room.leadId) ?? agents[0];
        if (lead && lead.id !== agent.id) {
          queue.push(lead);
          wrapped = true;
        }
      }
    }
  }

  /**
   * What an agent is shown of a room: the newest messages word for word, and a summary of the rest.
   * Once history grows well past what is sent, its oldest part is folded into the room's summary,
   * so long rooms stay affordable and within every model's limits.
   */
  async #context(room, agent, run) {
    const all = this.store.messages(room.id);
    let recent = all.filter((m) => m.seq > (room.summary?.through ?? 0));
    let omitted = false;
    if (sizeOf(recent) > RECENT_CHARS + FOLD_AFTER) {
      const [fold, keep] = splitForBudget(recent, RECENT_CHARS);
      const text = await this.#summarize(room, agent, fold, run.abort.signal);
      if (text) {
        room.summary = { text, through: fold.at(-1).seq, updatedAt: Date.now() };
        this.store.save();
      } else {
        omitted = true;
      }
      recent = keep;
    }
    const turns = buildTranscript(agent, recent, { summary: room.summary?.text ?? null, omitted: omitted || (!room.summary && recent.length < all.length) });
    return resolveAttachments(turns, this.files);
  }

  /** The models a hiring agent can offer: each usable provider's suggested or downloaded models. */
  #hireOptions() {
    const usable = this.providers.list().filter((p) => p.configured && p.id !== 'demo');
    const list = usable.length ? usable : this.providers.list().filter((p) => p.id === 'demo');
    return list.map((p) => ({ id: p.id, label: p.label, local: Boolean(p.local), models: (p.models ?? []).slice(0, 12) }));
  }

  /** Who answers: @mentions, else the agent a reply answers, else the room's mode decides. */
  async #firstSpeakers(room, agents, text, signal, replyTo = null) {
    const repliedTo = replyTo?.agentId && agents.find((a) => a.id === replyTo.agentId);
    if (repliedTo && !findMentions(text, agents).length) return [repliedTo];
    return initialSpeakers(room, agents, text) ?? (await this.#pick(room, agents, text, signal));
  }

  /**
   * Best fit: a quick, cheap model call picks who answers, usually one agent, sometimes two or three.
   * Uses Claude Haiku when the hub has a Claude key, otherwise the first agent's own model. If it can't
   * decide, the agent the user was talking to answers, or else the first agent.
   */
  async #pick(room, agents, text, signal) {
    const lastSpeaker = this.store.messages(room.id).findLast((m) => m.author.type === 'agent' && m.status === 'done');
    const fallback = [agents.find((a) => a.id === lastSpeaker?.author.agentId) ?? agents[0]];
    const usable = (id) => this.providers.isConfigured(id) && !['demo', null, undefined].includes(this.providers.kindOf?.(id));
    const choice = usable('anthropic') && this.providers.kindOf('anthropic') === 'anthropic'
      ? { provider: 'anthropic', model: SUMMARY_MODEL }
      : agents.filter((a) => usable(a.provider)).map((a) => ({ provider: a.provider, model: a.model }))[0];
    if (!choice) return fallback;

    const recent = this.store.messages(room.id)
      .filter((m) => m.text?.trim() && m.status !== 'error')
      .slice(-9, -1)
      .map((m) => `[${m.author.type === 'user' ? 'User' : m.author.name}]: ${m.text.replace(/\s+/g, ' ').slice(0, 500)}`);
    const roster = agents.map((a) => `- ${a.name}${a.role ? `: ${a.role}` : ''}${a.instructions?.trim() ? `. ${a.instructions.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
    const prompt = [
      `Room: ${room.name}`,
      room.description?.trim() ? `About this room: ${room.description.trim().slice(0, 1000)}` : null,
      '',
      'Agents:',
      ...roster,
      '',
      recent.length ? `Recent messages:\n${recent.join('\n')}\n` : null,
      `The user's newest message:\n"${text.slice(0, 2000)}"`,
      '',
      'Who should answer it?',
      '- Usually one agent: the one whose role fits it best. If the user is in a conversation with one agent and this continues it, choose that agent.',
      '- Two or three only when it clearly needs different skills, or the user asks for several views.',
      '- Everyone only when the user speaks to the whole group, like "everyone" or "what do you all think".',
    ].filter((line) => line !== null).join('\n');

    let usage = null;
    try {
      const answer = await this.providers.stream({
        provider: choice.provider,
        model: choice.model,
        system: 'You choose which AI agents in a group chat answer the user\'s newest message. Reply with only their names, separated by commas, and nothing else.',
        messages: [{ role: 'user', content: prompt }],
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        agent: agents[0],
        onDelta: () => {},
        onUsage: (u) => {
          usage = addUsage(usage ?? emptyUsage(), u);
        },
      });
      const named = namedAgents(answer, agents);
      const picked = named.length === agents.length ? named : named.slice(0, 3);
      const speakers = picked.length ? picked : fallback;
      // The pick is part of answering, so its few tokens count toward the first agent who answers.
      if (usage) this.ledger?.record({ agentId: speakers[0].id, roomId: room.id, model: choice.model, usage });
      return speakers;
    } catch (err) {
      if (signal.aborted) return [];
      console.warn(`[orbit] couldn't pick who answers in "${room.name}": ${err?.message}`);
      return fallback;
    }
  }

  /**
   * Web search and page reading for a model without its own: searches go to Claude Haiku with Anthropic's
   * web search (when the hub has a Claude key), and come back as short notes with their sources.
   */
  #hubWeb(agent, room, run) {
    const canSearch = this.providers.isConfigured('anthropic') && this.providers.kindOf('anthropic') === 'anthropic';
    return {
      canSearch,
      search: async (query) => {
        let found = [];
        let usage = null;
        const text = await this.providers.stream({
          provider: 'anthropic',
          model: SUMMARY_MODEL,
          system: 'You search the web for another AI assistant. Search, then reply with the facts that answer the query as short bullets, each naming its source site. No preamble.',
          messages: [{ role: 'user', content: query }],
          abilities: { web: true },
          agent,
          signal: AbortSignal.any([run.abort.signal, AbortSignal.timeout(90_000)]),
          onDelta: () => {},
          onSources: (sources) => {
            found = sources;
          },
          onUsage: (u) => {
            usage = addUsage(usage ?? emptyUsage(), u);
          },
        });
        if (usage) this.ledger?.record({ agentId: agent.id, roomId: room.id, model: SUMMARY_MODEL, usage });
        const list = found.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join('\n');
        return { text: `${text.trim()}${list ? `\n\nSources:\n${list}` : ''}`, sources: found };
      },
    };
  }

  /** Folds messages into the room's running summary, written by the agent's provider. Null if it can't. */
  async #summarize(room, agent, messages, signal) {
    const kind = this.providers.kindOf?.(agent.provider);
    if (!kind || kind === 'demo' || !this.providers.isConfigured(agent.provider)) return null;
    const model = kind === 'anthropic' ? SUMMARY_MODEL : agent.model;
    const lines = messages
      .filter((m) => (m.text?.trim() || m.attachments?.length) && m.status !== 'error')
      .map((m) => {
        const files = m.attachments?.length ? ` [attached: ${m.attachments.map((a) => a.name).join(', ')}]` : '';
        return `[${m.author.type === 'user' ? 'User' : m.author.name}]: ${m.text ?? ''}${files}`;
      })
      .join('\n\n');
    const previous = room.summary?.text ? `The summary so far:\n${room.summary.text}\n\n` : '';
    try {
      const text = await this.providers.stream({
        provider: agent.provider,
        model,
        system:
          `You keep the running summary of "${room.name}", a group chat between a user and several AI agents. ` +
          'Keep decisions, facts, figures, names, open questions, who is doing what, and anything the user asked to remember. ' +
          "Leave out small talk. Never add anything that wasn't said. Write plain sentences or short bullets, under 400 words.",
        messages: [{ role: 'user', content: `${previous}Messages to add:\n\n${lines}\n\nWrite the updated summary.` }],
        signal,
        agent,
        onDelta: () => {},
        onUsage: (usage) => this.ledger?.record({ agentId: agent.id, roomId: room.id, model, usage }),
      });
      return text.trim().slice(0, 8000) || null;
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn(`[orbit] couldn't summarize "${room.name}": ${err?.message}`);
      return null;
    }
  }

  async #speak(room, agent, agents, run) {
    let transcript;
    try {
      transcript = await this.#context(room, agent, run);
    } catch {
      return null; // stopped while summarizing
    }
    // Speaking unprompted: what prompted it goes last, for this agent only.
    const prompted = run.prompt?.agentId === agent.id ? run.prompt : null;
    if (prompted) {
      run.prompt = null;
      transcript = withPrompt(transcript, prompted.text);
    }
    const message = this.#append(
      room.id,
      { type: 'agent', agentId: agent.id, name: agent.name, model: agent.model },
      '',
      'streaming',
      prompted?.proactive ? { proactive: prompted.proactive } : {},
    );
    run.speaking = agent.id;
    this.emit(room.id, 'run', this.runState(room.id));
    const profile = this.store.state.profile;
    // In the intro, the guide always gets the shared memory, and can create the crew it suggests.
    const intro = room.intro && agents.length === 1;
    const abilities = resolveAbilities(agent, this.providers, this.folders, () => this.store.save(), {
      profile, force: intro ? ['memory'] : [], google: this.google,
    });
    if (abilities?.proactiveOn && this.proactive) abilities.proactive = this.proactive.toolsFor(agent, room);
    // Models other than Claude search through the hub: a quick Claude search when there's a key, and pages
    // fetched by the hub itself.
    const claude = this.providers.kindOf?.(agent.provider) === 'anthropic';
    if (abilities?.web && !claude) abilities.hubWeb = this.#hubWeb(agent, room, run);
    if (abilities) {
      abilities.self = selfTools(agent, room, {
        store: this.store, providers: this.providers, google: this.google, folders: this.folders, proactive: this.proactive, hub: this.hubInfo?.() ?? {},
        // A room made from the chat shows as a card under the reply, like the intro's crew.
        onRoomCreated: (made) => {
          message.crew = { roomId: made.id, name: made.name, agentIds: made.agentIds, label: 'New room ready' };
          this.store.save();
        },
      });
    }
    if (abilities && intro) {
      abilities.crew = {
        run: (input) => {
          try {
            const { room: made, agents: crew } = createCrew(this.store, agent, input);
            message.crew = { roomId: made.id, name: made.name, agentIds: made.agentIds };
            this.store.save();
            return { text: `Created the room "${made.name}" with ${crew.map((a) => a.name).join(', ')} and you.`, isError: false };
          } catch (err) {
            if (err instanceof CrewError) return { text: err.message, isError: true };
            throw err;
          }
        },
      };
    }
    if (abilities?.hire) {
      const models = this.#hireOptions();
      abilities.recruit = {
        prompt: recruitPrompt(models, this.store.state.agents),
        run: (input) => {
          try {
            const hired = createAgent(this.store, this.providers, room, input, models);
            message.created = [...(message.created ?? []), { agentId: hired.id, name: hired.name }];
            this.store.save();
            const joined = room.agentIds.includes(hired.id) ? ' They joined this room.' : '';
            return { text: `${hired.name} is in the crew, on ${hired.model}, as character ${hired.avatar.character}.${joined}`, isError: false };
          } catch (err) {
            if (err instanceof RecruitError) return { text: err.message, isError: true };
            throw err;
          }
        },
      };
    }
    try {
      const text = await this.providers.stream({
        provider: agent.provider,
        model: agent.model,
        system: buildSystemPrompt(agent, room, agents, abilities, profile),
        // For a model that turns out not to take tools: the same agent, told about the app without them.
        plainSystem: claude ? undefined : buildSystemPrompt(agent, room, agents, null, profile),
        messages: transcript,
        signal: run.abort.signal,
        agent,
        abilities,
        onDelta: (chunk) => {
          this.emit(room.id, 'delta', { id: message.id, at: message.text.length, text: chunk });
          message.text += chunk;
          this.store.save();
        },
        // What the agent is doing between bursts of text: searching, reading, running code.
        onActivity: (activity) => {
          message.activity = activity;
          this.store.save();
          this.emit(room.id, 'activity', { id: message.id, activity });
        },
        onSources: (sources) => {
          message.sources = sources;
          this.store.save();
        },
        onReset: (text) => {
          message.text = text;
          this.store.save();
          this.emit(room.id, 'reset', { id: message.id, text });
        },
        // Tokens for each request, kept on the reply and in the hub's usage ledger.
        onUsage: (usage) => {
          message.usage = addUsage(message.usage ?? emptyUsage(), usage);
          this.ledger?.record({ agentId: agent.id, roomId: room.id, model: agent.model, usage });
        },
      });
      message.text = text;
      message.status = 'done';
    } catch (err) {
      if (run.abort.signal.aborted) {
        message.status = 'stopped';
      } else {
        message.status = 'error';
        message.error = err?.message || 'Something went wrong on the hub.';
        if (err?.name !== 'ProviderError') console.error(`[orbit] ${agent.name} failed:`, err);
      }
    }
    run.speaking = null;
    this.store.save();
    this.emit(room.id, 'message', message);
    return message;
  }
}
