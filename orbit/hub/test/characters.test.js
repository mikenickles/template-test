import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarFrom, migrateAvatars } from '../src/characters.js';

test('agents saved with the old shape-and-color look move onto distinct characters of that color', () => {
  const agents = [
    { name: 'A', avatar: { shape: 0, color: 7, eyes: 1 } },
    { name: 'B', avatar: { shape: 1, color: 7, eyes: 5 } },
    { name: 'C', avatar: { character: 16 } },
    { name: 'D' },
  ];
  assert.equal(migrateAvatars(agents), true);
  // Violet maps to the wizard (16) and the alien (23). C already has the wizard, so A gets the alien;
  // B shares one, since both are taken.
  assert.deepEqual(agents.map((a) => a.avatar.character), [23, 16, 16, 3]);
  assert.equal(migrateAvatars(agents), false);
});

test('a saved agent keeps a valid character, and anything else falls back sensibly', () => {
  assert.deepEqual(avatarFrom({ character: 12 }, { character: 3 }), { character: 12 });
  assert.deepEqual(avatarFrom({ character: 99 }, { character: 3 }), { character: 3 });
  assert.deepEqual(avatarFrom({ shape: 2, color: 3, eyes: 0 }, null), { character: 2 });
  assert.deepEqual(avatarFrom(undefined, null), { character: 3 });
});
