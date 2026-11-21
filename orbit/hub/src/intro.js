import crypto from 'node:crypto';
import { CHARACTER_COUNT } from './characters.js';

/**
 * The first chat: one agent gets to know the user, saves what it learns to the memory the whole crew
 * shares, then suggests a crew for them and, once they agree, creates it with create_crew.
 */

export const INTRO_ROOM_NAME = 'Getting to know you';

/** The guide a new hub starts with, when it has a Claude key. */
export const GUIDE = {
  name: 'Nova',
  role: 'your guide',
  instructions:
    'You are warm, curious and to the point. You help the user get the most out of Orbit and their crew, and you ' +
    'keep the big picture of what they are working on.',
  character: 9,
};

/** What the guide is told in the intro chat, after its own instructions. */
export function introPrompt(profile) {
  const known = profile?.notes?.length ?? 0;
  return [
    '',
    'This chat is the user\'s introduction to Orbit, an app where a small crew of AI agents works with them. It is just',
    'you and them. Your job is to get to know them, so that every agent in their crew can help them well.',
    '- Start with a short, friendly hello. Say in a sentence who you are and what this chat is for, then ask what to call them.',
    '- Ask one question at a time, and keep each message short. React to their answers like a person would; this is a',
    '  conversation, not a form. Good things to learn: what they do, what they would like help with day to day, what',
    '  they are into, and how they like answers (short or detailed, playful or plain). Four to six questions is plenty,',
    '  and they can skip any.',
    '- Save each lasting fact with remember_about_user, one fact per note, as you learn it. Pass their name the first',
    '  time they tell you.',
    known
      ? `- The crew already knows ${known} thing${known === 1 ? '' : 's'} about them (listed above). Don't ask about those again; build on them.`
      : '- The crew knows nothing about them yet.',
    '- Once you have a good picture, suggest a crew of two or three agents shaped around their needs: for each, a',
    '  name, what they would do, and one of the characters below. Ask if they would like it, or want changes.',
    '- When they agree, call create_crew. Then tell them their crew is ready in a new room, that every agent there',
    '  already knows what they shared, and that they can come back to this chat anytime.',
    '',
    `Characters (number: name): ${CHARACTER_NAMES.map((n, i) => `${i + 1}: ${n}`).join(', ')}.`,
  ].join('\n');
}

const CHARACTER_NAMES = [
  'Explorer Bot', 'Leaf Sprout', 'Red Yeti', 'Teal Fox', 'Mushroom Friend', 'Wise Owl', 'Mechanic Bot', 'Smiling Cloud',
  'White Astronaut', 'Teal Hiker', 'Forest Tree', 'Water Drop', 'Mushroom Explorer', 'Pink Axolotl', 'Penguin Pilot',
  'Purple Wizard', 'Retro Computer', 'Leafy Bush', 'Music Monster', 'Happy Sun', 'Ice Crystal', 'Raccoon Explorer',
  'Purple Alien', 'Sprout Bot', 'Blue Yeti',
];

export const CREW_TOOL = {
  name: 'create_crew',
  description:
    'Create the crew you suggested, once the user has agreed: new agents, and a room where they and you work with the ' +
    'user. Everything the crew knows about the user comes with them. Call it once.',
  input_schema: {
    type: 'object',
    properties: {
      room_name: { type: 'string', description: 'A short name for the room, e.g. "Side project" or "Everyday help".' },
      room_description: {
        type: 'string',
        description: 'One or two sentences on what the room is for and anything every agent in it should keep in mind.',
      },
      agents: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A short, friendly first name.' },
            role: { type: 'string', description: 'What they do, in a few words, e.g. "the planner".' },
            instructions: { type: 'string', description: 'How they should work with this user, in two to four sentences.' },
            character: { type: 'integer', minimum: 1, maximum: CHARACTER_COUNT, description: 'Which character they look like.' },
          },
          required: ['name', 'role', 'instructions', 'character'],
        },
      },
    },
    required: ['room_name', 'agents'],
  },
  eager_input_streaming: true,
};

export class CrewError extends Error {
  name = 'CrewError';
}

const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Creates the agents and room the guide proposed. New agents use the guide's provider and model,
 * remember things and can search the web. The guide joins them, and the room is best fit.
 */
export function createCrew(store, guide, input) {
  const wanted = Array.isArray(input?.agents) ? input.agents.slice(0, 4) : [];
  if (!wanted.length) throw new CrewError('agents must list at least one agent.');
  const roomName = line(input?.room_name, 60) || 'Your crew';
  const taken = new Set([guide.avatar?.character, ...store.state.agents.map((a) => a.avatar?.character)]);
  const now = Date.now();
  const agents = wanted.map((w) => {
    const name = line(w?.name, 40).replace(/[@[\]]/g, '');
    if (!name) throw new CrewError('Every agent needs a name.');
    let character = Number.isInteger(w?.character) && w.character >= 1 && w.character <= CHARACTER_COUNT ? w.character : 0;
    if (!character) character = [...Array(CHARACTER_COUNT).keys()].map((i) => i + 1).find((c) => !taken.has(c)) ?? 1;
    taken.add(character);
    return {
      id: crypto.randomUUID(),
      name,
      role: line(w?.role, 80),
      instructions: String(w?.instructions ?? '').trim().slice(0, 2000),
      provider: guide.provider,
      model: guide.model,
      avatar: { character },
      abilities: ['web', 'memory'],
      createdAt: now,
    };
  });
  const room = {
    id: crypto.randomUUID(),
    name: roomName,
    agentIds: [guide.id, ...agents.map((a) => a.id)],
    // Best fit: whoever suits each message answers it, rather than everyone every time.
    mode: 'auto',
    leadId: null,
    description: String(input?.room_description ?? '').trim().slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  };
  store.state.agents.push(...agents);
  store.state.rooms.push(room);
  store.save();
  return { room, agents };
}
