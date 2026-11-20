import crypto from 'node:crypto';
import { kindOf } from './files.js';
import { runMemoryTool } from './memory.js';
import { addUsage, emptyUsage } from './usage.js';

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

/** Who answers a fresh user message. */
export function initialSpeakers(room, agents, text) {
  const mentioned = findMentions(text, agents);
  if (mentioned.length) return mentioned;
  if (room.mode === 'lead') {
    const lead = agents.find((a) => a.id === room.leadId) ?? agents[0];
    return lead ? [lead] : [];
  }
  return [...agents];
}

/** Abilities an agent can be given. "files" reads folders shared from the PC. */
export const ABILITIES = ['web', 'code', 'files', 'memory'];

/**
 * What an agent can do on this turn. Abilities only work with providers that support them; elsewhere
 * the agent runs without them, and its prompt doesn't mention them.
 */
export function resolveAbilities(agent, providers, folders, save = () => {}) {
  if (!providers.supportsAbilities?.(agent.provider)) return null;
  const on = new Set(agent.abilities ?? []);
  if (!on.size) return null;
  return {
    web: on.has('web'),
    code: on.has('code'),
    files: on.has('files'),
    folders: on.has('files') ? folders : null,
    // The agent keeps its own notes: "remember" and "forget".
    memory: on.has('memory') ? { run: (name, input) => runMemoryTool(agent, name, input, save) } : null,
  };
}

export function buildSystemPrompt(agent, room, agents, abilities = null) {
  const teammates = agents.filter((a) => a.id !== agent.id);
  const isLead = room.mode === 'lead' && (room.leadId === agent.id || (!room.leadId && agents[0]?.id === agent.id));
  const lines = [
    `You are ${agent.name}${agent.role ? `, ${agent.role}` : ''}. You are one of several AI agents working with a user in a group chat called "${room.name}".`,
  ];
  if (agent.instructions?.trim()) lines.push('', agent.instructions.trim());
  if (teammates.length) {
    lines.push('', 'Your teammates in this chat:');
    for (const t of teammates) lines.push(`- ${t.name}${t.role ? `: ${t.role}` : ''}`);
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
  if (agent.memory?.length) {
    lines.push('', "What you remember from earlier conversations with the user (use it where it helps; don't recite it):");
    for (const note of agent.memory) lines.push(`- ${note.text}`);
  }
  if (abilities) {
    lines.push('', 'What you can do here:');
    if (abilities.web) {
      lines.push('- Search the web and read web pages. Use them for anything recent or that you are unsure of, and say where facts came from.');
    }
    if (abilities.code) lines.push('- Run code in a sandbox, for calculations, working with data, and checking your work.');
    if (abilities.files) {
      const names = abilities.folders?.list().map((f) => f.name) ?? [];
      lines.push(
        names.length
          ? `- Read files in folders the user shared from their PC: ${names.join(', ')}. This is read only: you can't change, add or delete files.`
          : "- Read files the user shares from their PC. None are shared yet; if the user asks about their files, tell them to share a folder from the Orbit page on their PC.",
      );
    }
    if (abilities.memory) {
      lines.push(
        '- Keep notes for future chats with the remember tool: preferences, facts about the user, decisions, ongoing work. Save only what they would want kept, and use forget when they ask you to drop something or it stops being true.',
      );
    }
  }
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
    const text = mine ? said : `[${m.author.type === 'user' ? 'User' : m.author.name}]: ${said}`;
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
  constructor({ store, providers, folders = null, ledger = null, files = null, emit }) {
    this.store = store;
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
  post(roomId, text, attachments = []) {
    const message = this.#append(roomId, { type: 'user', name: 'You' }, text, 'done', attachments.length ? { attachments } : {});
    const run = this.runs.get(roomId);
    if (run) {
      run.restart = true; // picked up when the current speaker finishes
    } else {
      this.#start(roomId, (room, agents) => initialSpeakers(room, agents, text));
    }
    return message;
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
    let queue = first ? firstSpeakers(first, this.#roomAgents(first)) : [];
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
        queue = initialSpeakers(room, agents, latest?.text ?? '');
        turns = 0;
        wrapped = false;
        continue;
      }
      if (reply?.status === 'done') {
        const others = agents.filter((a) => a.id !== agent.id);
        for (const mentioned of findMentions(reply.text, others)) {
          if (!queue.some((q) => q.id === mentioned.id)) queue.push(mentioned);
        }
      }
      // In lead mode the lead closes the loop once teammates have weighed in.
      if (!queue.length && room.mode === 'lead' && !wrapped) {
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
    const message = this.#append(
      room.id,
      { type: 'agent', agentId: agent.id, name: agent.name, model: agent.model },
      '',
      'streaming',
    );
    run.speaking = agent.id;
    this.emit(room.id, 'run', this.runState(room.id));
    const abilities = resolveAbilities(agent, this.providers, this.folders, () => this.store.save());
    try {
      const text = await this.providers.stream({
        provider: agent.provider,
        model: agent.model,
        system: buildSystemPrompt(agent, room, agents, abilities),
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
