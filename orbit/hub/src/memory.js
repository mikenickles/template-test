import crypto from 'node:crypto';

/** An agent keeps at most this many notes, each this long. */
export const MAX_NOTES = 50;
export const MAX_NOTE = 300;

export class MemoryError extends Error {
  name = 'MemoryError';
}

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What the whole crew knows about the user holds at most this many notes. */
export const MAX_PROFILE_NOTES = 80;

/** Adds `text` to a list of notes, unless it is already there. `whose` names the memory in errors. */
function addTo(list, text, source, max, whose) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new MemoryError('Write something to remember.');
  if (clean.length > MAX_NOTE) throw new MemoryError(`Keep notes under ${MAX_NOTE} characters.`);
  const existing = list.find((n) => same(n.text, clean));
  if (existing) return existing;
  if (list.length >= max) throw new MemoryError(`${whose} is full (${max} notes). Remove some first.`);
  const note = { id: crypto.randomUUID(), text: clean, source, createdAt: Date.now() };
  list.push(note);
  return note;
}

/**
 * Adds a note to an agent's memory. `source` is "you" for notes added in the app and "agent" for
 * ones the agent saved itself. A note it already has isn't added twice.
 */
export function addNote(agent, text, source) {
  agent.memory ??= [];
  return addTo(agent.memory, text, source, MAX_NOTES, `${agent.name}'s memory`);
}

/**
 * The user's profile: their name and what the whole crew knows about them. Every agent sees it.
 * Notes come from the app ("you") or from an agent (its name).
 */
export function emptyProfile() {
  return { name: '', notes: [] };
}

export function addProfileNote(profile, text, source) {
  return addTo(profile.notes, text, source, MAX_PROFILE_NOTES, 'What your crew knows about you');
}

export function removeProfileNote(profile, noteId) {
  const before = profile.notes.length;
  profile.notes = profile.notes.filter((n) => n.id !== noteId);
  return profile.notes.length !== before;
}

/** The name agents call the user by: trimmed, one line, short. */
export function cleanName(name) {
  return String(name ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function removeNote(agent, noteId) {
  const before = agent.memory?.length ?? 0;
  agent.memory = (agent.memory ?? []).filter((n) => n.id !== noteId);
  return agent.memory.length !== before;
}

/** Notes in `notes` matching `text`: the same note if there is one, otherwise any that contain it. */
function matching(notes, text) {
  const wanted = String(text ?? '').trim().toLowerCase();
  if (!wanted) return [];
  const exact = notes.filter((n) => same(n.text, wanted));
  return exact.length ? exact : notes.filter((n) => n.text.toLowerCase().includes(wanted));
}

export function forgetNotes(agent, text) {
  const notes = agent.memory ?? [];
  const gone = matching(notes, text);
  agent.memory = notes.filter((n) => !gone.includes(n));
  return gone;
}

/**
 * Tools that let a Claude agent keep notes: about the user, shared by the whole crew, and its own.
 * Inputs are checked in runMemoryTool.
 */
export const MEMORY_TOOLS = [
  {
    name: 'remember_about_user',
    description:
      'Save a fact about the user to the memory your whole crew shares: every agent sees these notes in every ' +
      'chat. Use it for who they are and what matters to them: their work, interests, people and places in their ' +
      'life, preferences (including how they like answers), and plans. One fact per note, written so it makes ' +
      "sense on its own. When you learn the name they want to be called, pass it as name.",
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The fact, in one sentence under 300 characters.' },
        name: { type: 'string', description: 'The name the user wants to be called, if you just learned it.' },
      },
      required: ['note'],
    },
  },
  {
    name: 'forget_about_user',
    description: 'Remove a fact from the crew\'s shared memory of the user, when they ask you to or it is no longer true.',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The fact to remove, or words from it.' } },
      required: ['note'],
    },
  },
  {
    name: 'remember',
    description:
      'Save a short note to your own memory, which only you see, in every future chat. Use it for things about ' +
      'your own work with the user: decisions, ongoing projects, what you have tried. Facts about the user ' +
      'themselves go in remember_about_user instead. One sentence that makes sense on its own.',
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

export const MEMORY_ACTIVITY = { remember: 'remember', forget: 'forget', remember_about_user: 'remember', forget_about_user: 'forget' };

/**
 * Runs one memory tool call for `agent`, then `save`s. `profile` is what the crew knows about the user.
 * Returns the tool result text and whether it failed.
 */
export function runMemoryTool(agent, name, input, save, profile = null) {
  const note = input && typeof input === 'object' ? input.note : undefined;
  const userName = name === 'remember_about_user' ? cleanName(input?.name) : '';
  if (userName && profile) {
    profile.name = userName;
    if (typeof note !== 'string' || !note.trim()) {
      save();
      return { text: `Saved their name: ${userName}.`, isError: false };
    }
  }
  if (typeof note !== 'string' || !note.trim()) return { text: 'note must be a short piece of text.', isError: true };
  try {
    if (name === 'remember_about_user' || name === 'forget_about_user') {
      if (!profile) return { text: 'The shared memory is not available here.', isError: true };
      if (name === 'remember_about_user') {
        addProfileNote(profile, note, agent.name);
        save();
        return { text: 'Saved. Your whole crew will know this.', isError: false };
      }
      const gone = matching(profile.notes, note);
      if (!gone.length) return { text: `No shared note matches "${note}".`, isError: true };
      profile.notes = profile.notes.filter((n) => !gone.includes(n));
      save();
      return { text: `Forgot: ${gone.map((n) => n.text).join(' | ')}`, isError: false };
    }
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
