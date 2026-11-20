import crypto from 'node:crypto';

/** An agent keeps at most this many notes, each this long. */
export const MAX_NOTES = 50;
export const MAX_NOTE = 300;

export class MemoryError extends Error {
  name = 'MemoryError';
}

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Adds a note to an agent's memory. `source` is "you" for notes added in the app and "agent" for
 * ones the agent saved itself. A note it already has isn't added twice.
 */
export function addNote(agent, text, source) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new MemoryError('Write something to remember.');
  if (clean.length > MAX_NOTE) throw new MemoryError(`Keep notes under ${MAX_NOTE} characters.`);
  agent.memory ??= [];
  const existing = agent.memory.find((n) => same(n.text, clean));
  if (existing) return existing;
  if (agent.memory.length >= MAX_NOTES) {
    throw new MemoryError(`${agent.name}'s memory is full (${MAX_NOTES} notes). Remove some first.`);
  }
  const note = { id: crypto.randomUUID(), text: clean, source, createdAt: Date.now() };
  agent.memory.push(note);
  return note;
}

export function removeNote(agent, noteId) {
  const before = agent.memory?.length ?? 0;
  agent.memory = (agent.memory ?? []).filter((n) => n.id !== noteId);
  return agent.memory.length !== before;
}

/** Notes matching `text`: the same note if there is one, otherwise any that contain it. */
export function forgetNotes(agent, text) {
  const wanted = String(text ?? '').trim().toLowerCase();
  if (!wanted) return [];
  const notes = agent.memory ?? [];
  const exact = notes.filter((n) => same(n.text, wanted));
  const gone = exact.length ? exact : notes.filter((n) => n.text.toLowerCase().includes(wanted));
  agent.memory = notes.filter((n) => !gone.includes(n));
  return gone;
}

/** Tools that let a Claude agent keep its own notes. Inputs are checked in runMemoryTool. */
export const MEMORY_TOOLS = [
  {
    name: 'remember',
    description:
      'Save a short note to your memory, which you will see in every future chat with this user. Use it for ' +
      'lasting things worth knowing later: their preferences, facts about them, decisions, ongoing projects. ' +
      'Write it so it makes sense on its own, in one sentence.',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The note, under 300 characters.' } },
      required: ['note'],
    },
  },
  {
    name: 'forget',
    description: 'Remove a note from your memory when the user asks you to forget something, or it is no longer true.',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The note to remove, or words from it.' } },
      required: ['note'],
    },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

export const MEMORY_ACTIVITY = { remember: 'remember', forget: 'forget' };

/** Runs one memory tool call for `agent`, then `save`s. Returns the tool result text and whether it failed. */
export function runMemoryTool(agent, name, input, save) {
  const note = input && typeof input === 'object' ? input.note : undefined;
  if (typeof note !== 'string' || !note.trim()) return { text: 'note must be a short piece of text.', isError: true };
  try {
    if (name === 'remember') {
      addNote(agent, note, 'agent');
      save();
      return { text: 'Saved to your memory.', isError: false };
    }
    if (name === 'forget') {
      const gone = forgetNotes(agent, note);
      if (!gone.length) return { text: `No note in your memory matches "${note}".`, isError: true };
      save();
      return { text: `Forgot: ${gone.map((n) => n.text).join(' | ')}`, isError: false };
    }
    return { text: `There is no tool called "${name}".`, isError: true };
  } catch (err) {
    if (err instanceof MemoryError) return { text: err.message, isError: true };
    throw err;
  }
}
