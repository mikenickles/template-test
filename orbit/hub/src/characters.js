// Agents look like one of 25 characters, numbered 1 to 25. The pictures live with the apps
// (web/avatars and the phone's drawables); the hub only stores the number.

export const CHARACTER_COUNT = 25;

/** The characters' names, in number order (character 1 is the Explorer Bot). */
export const CHARACTER_NAMES = [
  'Explorer Bot', 'Leaf Sprout', 'Red Yeti', 'Teal Fox', 'Mushroom Friend', 'Wise Owl', 'Mechanic Bot', 'Smiling Cloud',
  'White Astronaut', 'Teal Hiker', 'Forest Tree', 'Water Drop', 'Mushroom Explorer', 'Pink Axolotl', 'Penguin Pilot',
  'Purple Wizard', 'Retro Computer', 'Leafy Bush', 'Music Monster', 'Happy Sun', 'Ice Crystal', 'Raccoon Explorer',
  'Purple Alien', 'Sprout Bot', 'Blue Yeti',
];

const valid = (n) => Number.isInteger(n) && n >= 1 && n <= CHARACTER_COUNT;

/**
 * Before characters, an avatar was a shape, one of ten colors and an eye style. Each old color has
 * characters of about the same color; agents that shared a color get different ones where possible.
 */
const BY_OLD_COLOR = [
  [3, 5, 14], // coral
  [1, 13, 22, 11], // amber
  [7, 20, 17], // sun
  [2, 18, 24], // lime
  [10, 4], // mint
  [12, 21, 25], // cyan
  [9, 15, 19], // blue
  [16, 23], // violet
  [6, 23], // orchid
  [14, 8], // pink
];

function fromOld(avatar, taken) {
  const color = Number.isInteger(avatar?.color) ? avatar.color : 0;
  const choices = BY_OLD_COLOR[((color % 10) + 10) % 10];
  const free = choices.find((c) => !taken.has(c));
  if (free) return free;
  const pick = (Number(avatar?.shape) || 0) + (Number(avatar?.eyes) || 0);
  return choices[pick % choices.length];
}

/** The avatar to store for a saved agent: the character asked for, else the one it had. */
export function avatarFrom(body, existing) {
  const asked = body && typeof body === 'object' ? body.character : undefined;
  if (valid(asked)) return { character: asked };
  if (valid(existing?.character)) return { character: existing.character };
  return { character: fromOld(body, new Set()) };
}

/** Moves agents saved before characters onto one. Returns whether anything changed. */
export function migrateAvatars(agents) {
  const taken = new Set(agents.map((a) => a.avatar?.character).filter(valid));
  let changed = false;
  for (const agent of agents) {
    if (valid(agent.avatar?.character)) continue;
    const character = fromOld(agent.avatar, taken);
    taken.add(character);
    agent.avatar = { character };
    changed = true;
  }
  return changed;
}
