import crypto from 'node:crypto';
import { search } from './search.js';

/**
 * The user's main agent: one agent who keeps up with every room, whether it's in them or not, and has a chat of
 * its own with the user (the main chat). Each reply it writes comes with an overview of every room, and with tools
 * it can read any room in full (read_room), search every chat (search_chats) and pass a note into a room
 * (post_to_room), where the members it @mentions answer.
 */

export const MAIN_ROOM_NAME = 'Main chat';

export class MainError extends Error {
  name = 'MainError';
}

/** { agentId, roomId } while there's a main agent with its chat, else null. */
export function mainOf(state) {
  const main = state.main;
  if (!main?.agentId || !main?.roomId) return null;
  if (!state.agents.some((a) => a.id === main.agentId) || !state.rooms.some((r) => r.id === main.roomId)) return null;
  return { agentId: main.agentId, roomId: main.roomId };
}

/**
 * Makes [agentId] the main agent (null turns it off). The main chat is made, or handed over if another agent had it.
 * [leave] lists rooms the agent steps out of, now that it sees them anyway; it stays where it's the only agent.
 * Returns { room, created, left }: the main chat, whether it's new, and the names of the rooms it left.
 */
export function setMain(store, agentId, leave = [], now = Date.now()) {
  const state = store.state;
  const existing = state.rooms.find((r) => r.main);
  if (agentId === null) {
    if (existing) {
      const agent = store.agent(existing.agentIds[0]);
      existing.main = false;
      existing.name = agent ? `Chat with ${agent.name}` : 'Chat';
    }
    delete state.main;
    store.save();
    return { room: null, created: false, left: [] };
  }
  const agent = store.agent(agentId);
  if (!agent) throw new MainError('That agent no longer exists.');
  let room = existing;
  const created = !room;
  if (!room) {
    room = { id: crypto.randomUUID(), name: MAIN_ROOM_NAME, agentIds: [agent.id], mode: 'roundtable', leadId: null, main: true, description: '', createdAt: now, updatedAt: now };
    state.rooms.unshift(room);
  } else {
    room.agentIds = [agent.id];
    room.mode = 'roundtable';
    room.leadId = null;
  }
  state.main = { agentId: agent.id, roomId: room.id };
  const left = [];
  for (const id of Array.isArray(leave) ? leave : []) {
    const other = store.room(id);
    if (!other || other.main || !other.agentIds.includes(agent.id) || other.agentIds.length < 2) continue;
    other.agentIds = other.agentIds.filter((a) => a !== agent.id);
    if (other.leadId === agent.id) other.leadId = other.agentIds[0];
    left.push(other.name);
  }
  // The morning brief comes from the main agent, in the main chat.
  if (state.proactive?.brief) state.proactive.brief.agentId = agent.id;
  store.save();
  return { room, created, left };
}

/** What the main agent says when its chat opens. The user never sees this prompt. */
export const HELLO_PROMPT =
  "[System]: The user just made you their main agent and opened this chat. Say hello in two or three short sentences: this is where they can talk to you about anything, you keep up with every room even when you're not in it, and you can pass things along to the others. Mention one thing that's going on in their rooms, if there is something.";

// ---------- What the main agent is shown ----------

const OVERVIEW_BUDGET = 9_000;
const RECENT_IN_OVERVIEW = 4;
const flat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, max) => {
  const line = flat(text);
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** "just now", "12 min ago", "3 h ago", "Mon", "Nov 4". */
export function ago(at, now = Date.now()) {
  if (!at) return 'never';
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  const d = new Date(at);
  return minutes < 7 * 24 * 60 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const speakerOf = (m) => (m.author?.type === 'user' ? 'User' : m.author?.name ?? 'An agent');
const shown = (m) => m.text?.trim() && m.status !== 'error' && m.status !== 'streaming';
const membersOf = (store, room) => room.agentIds.map((id) => store.agent(id)?.name).filter(Boolean);

/**
 * Every room but the main chat, newest first: who's in it, when it was last active, what it's for, its running
 * summary and its last few messages. Past a size limit, the quieter rooms get one line each.
 */
export function overview(store, { exceptRoomId = null, now = Date.now() } = {}) {
  const rooms = store.state.rooms.filter((r) => r.id !== exceptRoomId && !r.main).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  if (!rooms.length) return 'The user has no other rooms yet.';
  const lines = [];
  let used = 0;
  for (const room of rooms) {
    const members = membersOf(store, room);
    const head = `- "${room.name}" (${members.length ? members.join(', ') : 'no agents'}, and the user; last active ${ago(room.updatedAt, now)})`;
    if (used > OVERVIEW_BUDGET) {
      lines.push(head);
      used += head.length;
      continue;
    }
    const block = [head];
    if (room.description?.trim()) block.push(`  About: ${cut(room.description, 240)}`);
    if (room.summary?.text) block.push(`  Earlier: ${cut(room.summary.text, 700)}`);
    const recent = store.messages(room.id).filter(shown).slice(-RECENT_IN_OVERVIEW);
    if (!recent.length) block.push('  (no messages yet)');
    for (const m of recent) block.push(`  ${speakerOf(m)} (${ago(m.createdAt, now)}): ${cut(m.text, 260)}`);
    const text = block.join('\n');
    lines.push(text);
    used += text.length;
  }
  return lines.join('\n');
}

/** What the main agent is told about its job, and the overview. */
export function mainPrompt(store, agent, room, { tools = false, now = Date.now() } = {}) {
  const lines = [
    '',
    room.main
      ? "This is your main chat with the user, just the two of you. You are the user's main agent: you keep up with every room in Treehouse, including the ones you're not in, so they can ask you about anything going on anywhere."
      : "You are also the user's main agent: you keep up with every room in Treehouse, including the ones you're not in. Your own chat with the user is the main chat.",
  ];
  if (tools) {
    lines.push(
      '- read_room reads any room in full, and search_chats finds anything said in any chat. Use them when the overview below isn\'t enough; don\'t guess at what was said.',
      '- post_to_room passes a note into another room for the user, as you. Members you @mention there answer it. Post only when the user asks or clearly wants something passed along, and tell them what you posted.',
    );
  } else {
    lines.push("- You can't open rooms or post in them from here; answer from the overview below, and say so when it isn't enough.");
  }
  lines.push('', `The user's rooms right now, newest first (${new Date(now).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}):`, overview(store, { exceptRoomId: room.id, now }));
  return lines.join('\n');
}

// ---------- Its tools ----------

export const MAIN_TOOLS = [
  {
    name: 'read_room',
    description: "Read one of the user's rooms in full: who's in it, what it's for, its summary and its latest messages. Rooms are named as in the overview.",
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'The room\'s name.' },
        messages: { type: 'integer', minimum: 1, maximum: 100, description: 'How many of the latest messages to read. Default 30.' },
      },
      required: ['room'],
    },
  },
  {
    name: 'search_chats',
    description: 'Search every chat for messages with all of these words, newest first. Also finds rooms by name or description.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'A few words, like "school board agenda".' } }, required: ['query'] },
  },
  {
    name: 'post_to_room',
    description:
      "Post a message into another room, as you. Members you @mention in it (like @Scout) answer it there; with no mention, it's a note the room sees next time. Use it when the user asks you to pass something along or start something in a room.",
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'The room\'s name.' },
        message: { type: 'string', description: 'What to post. @mention the members who should act on it.' },
      },
      required: ['room', 'message'],
    },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

export const MAIN_ACTIVITY = { read_room: 'room_read', search_chats: 'chat_search', post_to_room: 'room_post' };

/** The words shown beside one of these tools in the chat. */
export function mainDetail(name, input = {}) {
  return name === 'search_chats' ? input.query : input.room;
}

/** A room by its name: exact first, then the only one whose name contains it. */
function findRoom(store, name, mainRoomId) {
  const wanted = flat(name).toLowerCase().replace(/^"|"$/g, '');
  const rooms = store.state.rooms.filter((r) => r.id !== mainRoomId);
  const found = rooms.find((r) => r.name.toLowerCase() === wanted) ?? (() => {
    const partial = rooms.filter((r) => r.name.toLowerCase().includes(wanted));
    return partial.length === 1 ? partial[0] : null;
  })();
  if (!found) {
    throw new MainError(`There's no room called "${flat(name)}". The rooms are: ${rooms.map((r) => `"${r.name}"`).join(', ') || 'none'}.`);
  }
  return found;
}

const MAX_READ = 30_000;

/** The room in full, for read_room. */
export function readRoom(store, input, { mainRoomId = null, now = Date.now() } = {}) {
  const room = findRoom(store, input.room, mainRoomId);
  const count = Math.min(100, Math.max(1, Number.isInteger(input.messages) ? input.messages : 30));
  const members = membersOf(store, room);
  const head = [`Room "${room.name}": ${members.join(', ') || 'no agents'}, and the user. Last active ${ago(room.updatedAt, now)}.`];
  if (room.description?.trim()) head.push(`About: ${room.description.trim()}`);
  if (room.summary?.text) head.push(`Summary of earlier messages: ${room.summary.text}`);
  const all = store.messages(room.id).filter(shown);
  const body = [];
  let size = 0;
  for (const m of all.slice(-count).reverse()) {
    const line = `[${new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}] ${speakerOf(m)}: ${m.text.trim().slice(0, 4000)}`;
    if (size + line.length > MAX_READ) break;
    body.unshift(line);
    size += line.length;
  }
  if (!body.length) body.push('(No messages yet.)');
  else if (body.length < all.length) body.unshift(`(The latest ${body.length} of ${all.length} messages.)`);
  return [...head, '', ...body].join('\n');
}

/** Search results in words, for search_chats. */
export function searchChats(store, input, { now = Date.now() } = {}) {
  const found = search(store.state, String(input.query ?? '').slice(0, 200));
  if (!found.query) throw new MainError('Say what to search for.');
  const lines = [];
  if (found.rooms.length) lines.push(`Rooms: ${found.rooms.map((r) => `"${r.name}"`).join(', ')}.`);
  for (const m of found.messages) lines.push(`- In "${m.roomName}", ${m.author} (${ago(m.at, now)}): ${m.snippet}`);
  return lines.length ? lines.join('\n') : `Nothing in any chat has all of "${found.query}".`;
}

/**
 * The main agent's tools in one room. [post] puts a message in a room and has the members it mentions answer;
 * it resolves with who's answering.
 */
export function mainTools(store, { mainRoomId, post }) {
  return {
    run: async (name, input = {}) => {
      try {
        if (name === 'read_room') return { text: readRoom(store, input, { mainRoomId }), isError: false };
        if (name === 'search_chats') return { text: searchChats(store, input), isError: false };
        if (name === 'post_to_room') {
          const room = findRoom(store, input.room, mainRoomId);
          const message = String(input.message ?? '').trim().slice(0, 8000);
          if (!message) throw new MainError('Say what to post.');
          const { answering, busy } = post(room, message);
          const who = answering.length ? ` ${answering.join(' and ')} will answer it there.` : busy ? ' The room is busy right now, so nobody was asked to answer yet; they\'ll see it.' : ' Nobody was mentioned, so it waits there as a note.';
          return { text: `Posted in "${room.name}".${who}`, isError: false };
        }
        return { text: `There is no tool called "${name}".`, isError: true };
      } catch (err) {
        if (err instanceof MainError) return { text: err.message, isError: true };
        throw err;
      }
    },
  };
}
