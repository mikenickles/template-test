import crypto from 'node:crypto';
import { CHARACTER_COUNT, CHARACTER_NAMES } from './characters.js';

/**
 * Hiring: an agent with the "crew" ability can add a new agent to the user's crew when they ask,
 * with detailed instructions it writes, the model the user chose, and a character nobody else has.
 */

export class RecruitError extends Error {
  name = 'RecruitError';
}

/** Characters no agent is using yet, by number. */
export function freeCharacters(agents) {
  const taken = new Set(agents.map((a) => a.avatar?.character));
  return [...Array(CHARACTER_COUNT).keys()].map((i) => i + 1).filter((n) => !taken.has(n));
}

export const AGENT_TOOL = {
  name: 'create_agent',
  description:
    'Add a new agent to the user\'s crew, when they ask you to create, add or hire one. Only call it once you know what ' +
    'the agent is for and the user has told you which AI model it should use. Write its instructions in detail.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short, friendly first name no other agent has.' },
      role: { type: 'string', description: 'What they do, in a few words, e.g. "the running coach".' },
      instructions: {
        type: 'string',
        description:
          'Detailed instructions, a few short paragraphs: who they are, what they do for this user and how, how they ' +
          'talk, what good work looks like, and what to avoid. Use what you know about the user.',
      },
      provider: { type: 'string', description: 'The provider id of the model the user chose, from the list you were given.' },
      model: { type: 'string', description: 'The model id the user chose, from the list you were given.' },
      character: { type: 'integer', minimum: 1, maximum: CHARACTER_COUNT, description: 'A free character that suits them.' },
      abilities: {
        type: 'array',
        items: { type: 'string', enum: ['web', 'code', 'memory'] },
        description: 'For Claude models only: search the web, run code, remember things. Defaults to web and memory.',
      },
      join_this_room: { type: 'boolean', description: 'Whether they join this room as well. Do it when the user wants them here.' },
    },
    required: ['name', 'role', 'instructions', 'provider', 'model'],
  },
  eager_input_streaming: true,
};

/**
 * What an agent that can hire is told: how to go about it, the models the user can choose from, and
 * the characters still free. `models` is [{ id, label, models: [...] }] for each usable provider.
 */
export function recruitPrompt(models, agents) {
  const free = freeCharacters(agents);
  return [
    '- Add agents to the user\'s crew with create_agent when they ask you to create, add or hire one. First be sure what the',
    '  new agent is for (ask if it isn\'t clear). Then ask which AI model it should use: offer the choices below, say',
    '  briefly which you would suggest and why, and wait for their answer. Write detailed instructions for it, pick a free',
    '  character that suits it, and once it exists, introduce the new member in a sentence or two.',
    '  Models the user can choose from (provider id: model ids):',
    ...models.map((p) => `  - ${p.id} (${p.label}): ${p.models.length ? p.models.join(', ') : 'any model id they name'}`),
    free.length
      ? `  Free characters (number: name): ${free.map((n) => `${n}: ${CHARACTER_NAMES[n - 1]}`).join(', ')}.`
      : '  Every character is in use; leave character out and one will be chosen.',
  ].join('\n');
}

const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Creates the agent `input` describes. `models` is the list the hiring agent was given, and checks the
 * provider is one the user can use. Joins `room` if asked (never the intro chat). Returns the agent.
 */
export function createAgent(store, providers, room, input, models) {
  const name = line(input?.name, 40).replace(/[@[\]]/g, '');
  if (!name) throw new RecruitError('The new agent needs a name.');
  if (store.state.agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    throw new RecruitError(`There's already an agent called ${name}. Choose another name.`);
  }
  const provider = line(input?.provider, 40);
  const offered = models.find((p) => p.id === provider);
  if (!offered) {
    throw new RecruitError(`"${provider}" isn't one of the providers the user can use: ${models.map((p) => p.id).join(', ') || 'none'}.`);
  }
  const model = line(input?.model, 120);
  if (!model) throw new RecruitError('Say which model the new agent uses.');
  // A local runtime only runs models it has downloaded.
  if (offered.local && !offered.models.some((m) => m === model || m === `${model}:latest`)) {
    throw new RecruitError(`${offered.label} doesn't have ${model}. It has: ${offered.models.join(', ') || 'no models yet'}.`);
  }
  const instructions = String(input?.instructions ?? '').trim().slice(0, 20_000);
  if (instructions.length < 40) throw new RecruitError('Write the new agent detailed instructions: a few short paragraphs.');

  const free = freeCharacters(store.state.agents);
  const asked = Number.isInteger(input?.character) ? input.character : 0;
  const character = free.includes(asked) ? asked : free.length ? free[Math.floor(Math.random() * free.length)] : 1 + Math.floor(Math.random() * CHARACTER_COUNT);

  const canDoMore = providers.supportsAbilities?.(provider);
  const wanted = Array.isArray(input?.abilities) ? input.abilities.filter((a) => ['web', 'code', 'memory'].includes(a)) : ['web', 'memory'];
  const agent = {
    id: crypto.randomUUID(),
    name,
    role: line(input?.role, 80),
    instructions,
    provider,
    model,
    avatar: { character },
    abilities: canDoMore ? [...new Set(wanted)] : [],
    createdAt: Date.now(),
  };
  store.state.agents.push(agent);
  if (input?.join_this_room && room && !room.intro && !room.agentIds.includes(agent.id)) room.agentIds.push(agent.id);
  store.save();
  return agent;
}
