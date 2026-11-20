import crypto from 'node:crypto';

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

export function buildSystemPrompt(agent, room, agents) {
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
  return lines.join('\n');
}

/** The room history from one agent's point of view, as alternating chat turns. */
export function buildTranscript(agent, messages) {
  const turns = [];
  for (const m of messages) {
    if (!m.text?.trim() || m.status === 'error') continue;
    const mine = m.author.type === 'agent' && m.author.agentId === agent.id;
    const role = mine ? 'assistant' : 'user';
    const content = mine ? m.text : `[${m.author.type === 'user' ? 'User' : m.author.name}]: ${m.text}`;
    const prev = turns.at(-1);
    if (prev?.role === role) prev.content += `\n\n${content}`;
    else turns.push({ role, content });
  }
  if (turns.at(-1)?.role === 'assistant') {
    turns.push({ role: 'user', content: '[System]: Your teammates have nothing to add. Wrap up for the user.' });
  }
  return turns;
}

/**
 * Runs the group chats: decides who speaks after each message, streams their
 * replies, and follows @mention hand-offs. One run per room at a time; runs
 * live on the hub, so they keep going while the phone is asleep.
 */
export class Orchestrator {
  /** @param {{store: import('./store.js').Store, providers: any, emit: (roomId: string, event: string, data: any) => void}} deps */
  constructor({ store, providers, emit }) {
    this.store = store;
    this.providers = providers;
    this.emit = emit;
    this.runs = new Map();
  }

  runState(roomId) {
    const run = this.runs.get(roomId);
    return { active: Boolean(run), agentId: run?.speaking ?? null };
  }

  /** Add a user message and make sure a run is answering it. */
  post(roomId, text) {
    const message = this.#append(roomId, { type: 'user', name: 'You' }, text, 'done');
    const run = this.runs.get(roomId);
    if (run) {
      run.restart = true; // picked up when the current speaker finishes
    } else {
      const fresh = { abort: new AbortController(), speaking: null, restart: false };
      this.runs.set(roomId, fresh);
      fresh.done = this.#run(roomId, fresh, text).finally(() => {
        this.runs.delete(roomId);
        this.emit(roomId, 'run', this.runState(roomId));
      });
    }
    return message;
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

  #append(roomId, author, text, status) {
    const list = this.store.messages(roomId);
    const message = {
      id: crypto.randomUUID(),
      roomId,
      seq: (list.at(-1)?.seq ?? 0) + 1,
      author,
      text,
      status,
      createdAt: Date.now(),
    };
    list.push(message);
    const room = this.store.room(roomId);
    if (room) room.updatedAt = message.createdAt;
    this.store.save();
    this.emit(roomId, 'message', message);
    return message;
  }

  async #run(roomId, run, firstText) {
    let queue = initialSpeakers(this.store.room(roomId), this.#roomAgents(this.store.room(roomId)), firstText);
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

  async #speak(room, agent, agents, run) {
    const transcript = buildTranscript(agent, this.store.messages(room.id));
    const message = this.#append(
      room.id,
      { type: 'agent', agentId: agent.id, name: agent.name, model: agent.model },
      '',
      'streaming',
    );
    run.speaking = agent.id;
    this.emit(room.id, 'run', this.runState(room.id));
    try {
      const text = await this.providers.stream({
        provider: agent.provider,
        model: agent.model,
        system: buildSystemPrompt(agent, room, agents),
        messages: transcript,
        signal: run.abort.signal,
        agent,
        onDelta: (chunk) => {
          this.emit(room.id, 'delta', { id: message.id, at: message.text.length, text: chunk });
          message.text += chunk;
          this.store.save();
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
