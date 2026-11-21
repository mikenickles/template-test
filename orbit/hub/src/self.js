import fs from 'node:fs';
import { CHARACTER_COUNT } from './characters.js';
import { ProactiveError } from './proactive.js';

/**
 * What agents know about Treehouse itself, and what they can change for the user.
 *
 * guide.md describes the app: its features, settings and how it's built. It ships with every update, so it
 * stays current. Claude agents read it, with a live summary of this hub (agents, rooms, settings), through the
 * treehouse_guide tool; other agents get it in their instructions. Claude agents can also change themselves
 * (update_self) and the room and proactive settings (change_settings) when the user asks.
 */

export const GUIDE = fs.readFileSync(new URL('./guide.md', import.meta.url), 'utf8').trim();
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** Every agent hears this, whatever its model. */
export const APP_SUMMARY = [
  `About the app you're in: you live in Treehouse (version ${VERSION}), an app where the user works with a crew of AI agents in group chats called rooms, on their Android phone and their PC.`,
  "A hub on the user's always-on PC runs everything; the phone app pairs with it, and the desktop app is at http://localhost:8787 on the PC.",
  'Agents have a look (one of 25 characters), a model, abilities (web search, code, shared folders, memory, hiring new agents, the user\'s Google account), and can reach out on their own.',
  'Settings, on the phone or PC, hold model keys, About you, Proactive, Google, usage, updates and shared folders.',
  'Treehouse used to be called Orbit: if older messages, summaries or notes say Orbit, they mean this app. Call it Treehouse.',
].join(' ');

const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', xai: 'xAI', gemini: 'Google Gemini', openrouter: 'OpenRouter', ollama: 'Ollama, running on the user\'s PC', demo: 'the built-in demo' };

/** "claude-opus-5-5, from Anthropic": which model an agent runs on, in words. */
export const modelOf = (agent) => `${agent.model}, from ${PROVIDER_NAMES[agent.provider] ?? agent.provider}`;

/** Abilities an agent may turn on for itself. Google and files reach the user's data, so only the user turns those on. */
const SELF_ABILITIES = ['web', 'code', 'memory', 'crew'];
const LEVELS = ['off', 'gentle', 'active'];
const MODES = { 'best fit': 'auto', auto: 'auto', lead: 'lead', 'round table': 'roundtable', roundtable: 'roundtable' };
const MODE_NAMES = { auto: 'best fit', lead: 'lead', roundtable: 'round table' };

export const SELF_TOOLS = [
  {
    name: 'treehouse_guide',
    description:
      'The guide to Treehouse, the app you live in: every feature, where each setting is, what agents can and cannot do, and how it is built, plus a live summary of this setup (agents, rooms, models, settings). Call it before answering any question about Treehouse, and before changing settings.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_self',
    description:
      'Change yourself, when the user asks or agrees: your name, role, instructions, look, model, abilities, or how often you reach out on your own. Pass only what changes. instructions replaces them all; add_to_instructions adds a line to them.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        role: { type: 'string', description: 'A few words, like "the planner".' },
        instructions: { type: 'string', description: 'Your full new instructions, replacing the old ones.' },
        add_to_instructions: { type: 'string', description: 'Something to add to your instructions, keeping the rest.' },
        character: { type: 'integer', minimum: 1, maximum: CHARACTER_COUNT, description: 'Your look, as a character number.' },
        provider: { type: 'string', description: 'anthropic, openai, xai, gemini, openrouter, ollama or demo. Only one that has a key.' },
        model: { type: 'string', description: 'A model id for the provider, like claude-sonnet-5-5.' },
        reaches_out: { type: 'string', enum: LEVELS },
        abilities_on: { type: 'array', items: { type: 'string', enum: SELF_ABILITIES } },
        abilities_off: { type: 'array', items: { type: 'string', enum: [...SELF_ABILITIES, 'google', 'files'] } },
      },
    },
  },
  {
    name: 'change_settings',
    description:
      "Change settings for the user, when they ask: this room's name, description, mode and members, and the crew's proactive settings (quiet hours, daily limit, morning brief). Pass only what changes. Agents are named by their names.",
    input_schema: {
      type: 'object',
      properties: {
        room_name: { type: 'string' },
        room_description: { type: 'string', description: 'What the room is for and rules every agent in it follows.' },
        room_mode: { type: 'string', enum: ['best fit', 'lead', 'round table'] },
        room_lead: { type: 'string', description: 'Who leads, in lead mode.' },
        add_members: { type: 'array', items: { type: 'string' } },
        remove_members: { type: 'array', items: { type: 'string' } },
        quiet_start: { type: 'string', description: 'HH:MM, 24-hour.' },
        quiet_end: { type: 'string', description: 'HH:MM, 24-hour.' },
        daily_limit: { type: 'integer', minimum: 1, maximum: 30 },
        brief_enabled: { type: 'boolean' },
        brief_time: { type: 'string', description: 'HH:MM, 24-hour.' },
        brief_from: { type: 'string', description: 'The agent who writes the morning brief.' },
      },
    },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

export const SELF_ACTIVITY = { treehouse_guide: 'guide', update_self: 'self', change_settings: 'settings' };

/** What agents with tools are told. */
export const SELF_PROMPT =
  "- Treehouse questions: for anything about Treehouse itself (a feature, a setting, how it's built, what's set up), call treehouse_guide and answer from it. Never guess, and don't say you don't know before checking.\n" +
  '- Doing things for the user: change your own name, role, instructions, look, model, abilities or how often you reach out with update_self, and this room or the proactive settings with change_settings, when they ask. Say what you changed. For what only the user can do (keys, Google, folders, updates), tell them where in the app to do it.';

export class SelfError extends Error {
  name = 'SelfError';
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const byName = (agents, name) => agents.find((a) => a.name.toLowerCase() === clean(name, 60).replace(/^@/, '').toLowerCase());

/** A live summary of this hub for the guide: who's in the crew, the rooms, and what's set up. No keys or secrets. */
export function snapshot({ store, providers, google = null, folders = null, hub = {} }) {
  const state = store.state;
  const lines = [`## This setup, right now`, '', `- Treehouse ${VERSION}, on the PC called "${hub.name ?? 'the PC'}".`];
  if (hub.addresses?.length) lines.push(`- The phone reaches it at ${hub.addresses[0]} at home${hub.remote?.length ? `, and at ${hub.remote[0]} away from home, through Tailscale` : '; Tailscale (for away from home) is not set up'}.`);
  const keyed = providers.list().filter((p) => p.configured && p.id !== 'demo').map((p) => p.label);
  lines.push(`- Model providers ready: ${keyed.length ? keyed.join(', ') : 'none yet (only Demo)'}.`);
  const g = google?.status?.();
  lines.push(`- Google: ${g?.connected ? `connected as ${g.email || 'the user'}` : g?.configured ? 'set up but not connected' : 'not connected'}.`);
  const shared = folders?.list?.() ?? [];
  lines.push(`- Folders shared from the PC: ${shared.length ? shared.map((f) => f.name).join(', ') : 'none'}.`);
  if (state.profile?.name) lines.push(`- The user goes by ${state.profile.name}; the crew knows ${state.profile.notes?.length ?? 0} things about them.`);
  lines.push('', 'Agents:');
  for (const a of state.agents) {
    const level = a.proactive && a.proactive !== 'off' ? `, reaches out: ${a.proactive}` : '';
    lines.push(`- ${a.name}${a.role ? ` (${a.role})` : ''}: ${a.model} on ${a.provider}; abilities: ${(a.abilities ?? []).join(', ') || 'none'}${level}.`);
  }
  lines.push('', 'Rooms:');
  for (const r of state.rooms) {
    const members = r.agentIds.map((id) => store.agent(id)?.name).filter(Boolean).join(', ');
    lines.push(`- "${r.name}" (${MODE_NAMES[r.mode] ?? r.mode}${r.mode === 'lead' ? `, led by ${store.agent(r.leadId)?.name ?? 'the first agent'}` : ''}): ${members || 'no agents'}${r.description ? `. About: ${clean(r.description, 160)}` : ''}.`);
  }
  const p = state.proactive;
  if (p) {
    lines.push('', `Proactive: quiet hours ${p.quietStart} to ${p.quietEnd}, at most ${p.dailyLimit} a day; morning brief ${p.brief?.enabled ? `at ${p.brief.time}, from ${store.agent(p.brief.agentId)?.name ?? 'the guide'}` : 'off'}; ${state.followups?.length ?? 0} follow-ups and ${state.watches?.length ?? 0} watches set.`);
  }
  const schedules = state.schedules ?? [];
  if (schedules.length) lines.push(`Scheduled messages: ${schedules.map((s) => `"${clean(s.text, 50)}" in ${store.room(s.roomId)?.name ?? '?'} at ${s.time}`).join('; ')}.`);
  return lines.join('\n');
}

/** Changes an agent, as it asked. Returns what changed, in words. */
export function updateSelf(agent, input, { store, providers }) {
  const changed = [];
  if (input.name !== undefined) {
    const name = clean(input.name, 40).replace(/[@[\]]/g, '');
    if (!name) throw new SelfError('A name can\'t be empty.');
    if (store.state.agents.some((a) => a.id !== agent.id && a.name.toLowerCase() === name.toLowerCase())) {
      throw new SelfError(`Another agent is already called ${name}.`);
    }
    if (name !== agent.name) {
      changed.push(`name to ${name}`);
      agent.name = name;
    }
  }
  if (input.role !== undefined) {
    agent.role = clean(input.role, 80);
    changed.push(agent.role ? `role to "${agent.role}"` : 'role (cleared)');
  }
  if (typeof input.instructions === 'string') {
    agent.instructions = input.instructions.trim().slice(0, 20000);
    changed.push('instructions');
  }
  if (typeof input.add_to_instructions === 'string' && input.add_to_instructions.trim()) {
    agent.instructions = `${(agent.instructions ?? '').trim()}\n${input.add_to_instructions.trim()}`.trim().slice(0, 20000);
    changed.push('instructions (added to)');
  }
  if (input.character !== undefined) {
    if (!Number.isInteger(input.character) || input.character < 1 || input.character > CHARACTER_COUNT) throw new SelfError(`Characters are 1 to ${CHARACTER_COUNT}.`);
    agent.avatar = { character: input.character };
    changed.push(`look to character ${input.character}`);
  }
  if (input.provider !== undefined || input.model !== undefined) {
    const provider = input.provider !== undefined ? clean(input.provider, 40).toLowerCase() : agent.provider;
    if (!providers.has(provider)) throw new SelfError(`There's no provider called ${provider}.`);
    if (!providers.isConfigured(provider)) throw new SelfError(`${provider} has no key yet. The user adds keys in Settings, under Model providers.`);
    const model = input.model !== undefined ? clean(input.model, 120) : provider === agent.provider ? agent.model : providers.list().find((p) => p.id === provider)?.models?.[0];
    if (!model) throw new SelfError('Say which model.');
    agent.provider = provider;
    agent.model = model;
    changed.push(`model to ${model} on ${provider}`);
  }
  if (input.reaches_out !== undefined) {
    if (!LEVELS.includes(input.reaches_out)) throw new SelfError('reaches_out is off, gentle or active.');
    agent.proactive = input.reaches_out;
    changed.push(`reaching out to ${input.reaches_out}`);
  }
  const on = Array.isArray(input.abilities_on) ? input.abilities_on : [];
  const off = Array.isArray(input.abilities_off) ? input.abilities_off : [];
  const refused = on.filter((a) => !SELF_ABILITIES.includes(a));
  if (refused.length) {
    throw new SelfError(`Only the user can turn on ${refused.join(' and ')}, in your settings (open you from Home, then Abilities).`);
  }
  if (on.length || off.length) {
    const next = new Set(agent.abilities ?? []);
    on.forEach((a) => next.add(a));
    off.forEach((a) => next.delete(a));
    agent.abilities = [...next];
    if (on.length) changed.push(`abilities on: ${on.join(', ')}`);
    if (off.length) changed.push(`abilities off: ${off.join(', ')}`);
  }
  if (!changed.length) throw new SelfError('Nothing to change: pass what should change.');
  store.save();
  return `Changed your ${changed.join('; ')}. It takes effect from your next reply.`;
}

/** Changes the room and proactive settings, as asked. Returns what changed, in words. */
export function changeSettings(room, input, { store, proactive }) {
  const changed = [];
  const agents = store.state.agents;
  if (input.room_name !== undefined) {
    const name = clean(input.room_name, 60);
    if (!name) throw new SelfError("A room name can't be empty.");
    room.name = name;
    changed.push(`room name to "${name}"`);
  }
  if (input.room_description !== undefined) {
    room.description = String(input.room_description ?? '').trim().slice(0, 2000);
    changed.push('room description');
  }
  for (const name of Array.isArray(input.add_members) ? input.add_members : []) {
    const agent = byName(agents, name);
    if (!agent) throw new SelfError(`There's no agent called ${name}. The crew is ${agents.map((a) => a.name).join(', ')}.`);
    if (!room.agentIds.includes(agent.id)) {
      room.agentIds.push(agent.id);
      changed.push(`added ${agent.name} to the room`);
    }
  }
  for (const name of Array.isArray(input.remove_members) ? input.remove_members : []) {
    const agent = byName(agents, name);
    if (!agent || !room.agentIds.includes(agent.id)) continue;
    if (room.agentIds.length === 1) throw new SelfError('A room needs at least one agent.');
    room.agentIds = room.agentIds.filter((id) => id !== agent.id);
    if (room.leadId === agent.id) room.leadId = room.agentIds[0];
    changed.push(`removed ${agent.name} from the room`);
  }
  if (input.room_mode !== undefined) {
    const mode = MODES[clean(input.room_mode, 20).toLowerCase()];
    if (!mode) throw new SelfError('The mode is best fit, lead or round table.');
    room.mode = mode;
    room.leadId = mode === 'lead' ? (room.agentIds.includes(room.leadId) ? room.leadId : room.agentIds[0]) : null;
    changed.push(`room mode to ${MODE_NAMES[mode]}`);
  }
  if (input.room_lead !== undefined) {
    const lead = byName(agents, input.room_lead);
    if (!lead || !room.agentIds.includes(lead.id)) throw new SelfError(`${input.room_lead} isn't in this room.`);
    room.mode = 'lead';
    room.leadId = lead.id;
    changed.push(`${lead.name} leads the room`);
  }
  const settings = {};
  if (input.quiet_start !== undefined) settings.quietStart = input.quiet_start;
  if (input.quiet_end !== undefined) settings.quietEnd = input.quiet_end;
  if (input.daily_limit !== undefined) settings.dailyLimit = input.daily_limit;
  const brief = {};
  if (input.brief_enabled !== undefined) brief.enabled = input.brief_enabled;
  if (input.brief_time !== undefined) brief.time = input.brief_time;
  if (input.brief_from !== undefined) {
    const writer = byName(agents, input.brief_from);
    if (!writer) throw new SelfError(`There's no agent called ${input.brief_from}.`);
    brief.agentId = writer.id;
  }
  if (Object.keys(brief).length) settings.brief = brief;
  if (Object.keys(settings).length) {
    if (!proactive) throw new SelfError("Proactive settings can't be changed right now.");
    try {
      const saved = proactive.update(settings);
      if (settings.quietStart || settings.quietEnd) changed.push(`quiet hours to ${saved.quietStart} to ${saved.quietEnd}`);
      if (settings.dailyLimit) changed.push(`daily limit to ${saved.dailyLimit}`);
      if (settings.brief) changed.push(`morning brief ${saved.brief.enabled ? `on, at ${saved.brief.time}, from ${store.agent(saved.brief.agentId)?.name ?? 'the guide'}` : 'off'}`);
    } catch (err) {
      if (err instanceof ProactiveError) throw new SelfError(err.message);
      throw err;
    }
  }
  if (!changed.length) throw new SelfError('Nothing to change: pass what should change.');
  room.updatedAt = Date.now();
  store.save();
  return `Changed ${changed.join('; ')}.`;
}

/** The tools for one agent in one room. */
export function selfTools(agent, room, deps) {
  return {
    run: (name, input = {}) => {
      try {
        if (name === 'treehouse_guide') return { text: `${GUIDE}\n\n${snapshot(deps)}`, isError: false };
        if (name === 'update_self') return { text: updateSelf(agent, input, deps), isError: false };
        if (name === 'change_settings') return { text: changeSettings(room, input, deps), isError: false };
        return { text: `There is no tool called "${name}".`, isError: true };
      } catch (err) {
        if (err instanceof SelfError) return { text: err.message, isError: true };
        throw err;
      }
    },
  };
}

/** The words shown beside one of these tools in the chat. */
export function selfDetail(name, input = {}) {
  if (name === 'update_self') {
    return Object.keys(input).filter((k) => input[k] !== undefined).map((k) => ({
      add_to_instructions: 'instructions', abilities_on: 'abilities', abilities_off: 'abilities', reaches_out: 'reaching out', character: 'look',
    })[k] ?? k).filter((v, i, all) => all.indexOf(v) === i).join(', ');
  }
  if (name === 'change_settings') {
    return Object.keys(input).filter((k) => input[k] !== undefined).map((k) => (k.startsWith('room_') ? 'room' : k.startsWith('brief') ? 'morning brief' : k.includes('member') ? 'members' : k.startsWith('quiet') ? 'quiet hours' : 'daily limit'))
      .filter((v, i, all) => all.indexOf(v) === i).join(', ');
  }
  return '';
}
