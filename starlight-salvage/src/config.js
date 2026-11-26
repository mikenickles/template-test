// Everything you would want to rebalance lives here: what the junk is worth, where it floats,
// how long each tether is, and what repairs and upgrades cost. No other file needs editing.

/** What the cargo hold counts. `color` is used for the HUD chips and the rings under items. */
export const MATERIALS = {
  metal: { name: 'Metal', color: 0xffa81f },
  wire: { name: 'Wire', color: 0x2f9bff },
  power: { name: 'Power', color: 0x35d07f },
};

/**
 * Kinds of salvage. `gives` x `value` is what one pickup adds to the hold.
 * size 'small' can be grabbed by hand on a spacewalk; the winch can lift anything.
 * `carry` is how it hangs on the cable (same meaning as the toys in Backyard Air Rescue):
 *   len = cable length it rides at, mass = how hard it tugs the ship, damp = how fast the swing dies,
 *   g = its own "weight" (heavier = calmer swing), spring > 0 makes the cable stretchy.
 */
export const ITEMS = {
  panel: { name: 'Hull panel', gives: 'metal', value: 2, size: 'large', carry: { len: 1.6, damp: 0.9, mass: 0.1, spring: 0, g: 18 } },
  tank: { name: 'Fuel tank', gives: 'metal', value: 4, size: 'large', carry: { len: 1.8, damp: 1.2, mass: 0.22, spring: 0, g: 26 } },
  gear: { name: 'Gear', gives: 'metal', value: 1, size: 'small', carry: { len: 1.4, damp: 0.8, mass: 0.05, spring: 0, g: 16 } },
  coil: { name: 'Wire coil', gives: 'wire', value: 1, size: 'small', carry: { len: 1.4, damp: 0.8, mass: 0.05, spring: 120, g: 20 } },
  cell: { name: 'Power cell', gives: 'power', value: 1, size: 'small', carry: { len: 1.4, damp: 1.0, mass: 0.06, spring: 0, g: 18 } },
};

/** The debris field. x/z are positions on the debris plane; the wreck sits at (-16, -8). */
export const FIELD = {
  items: [
    { kind: 'panel', x: 8, z: -3 },
    { kind: 'panel', x: -6, z: 10 },
    { kind: 'panel', x: 21, z: 7 },
    { kind: 'tank', x: 14, z: -14 },
    { kind: 'tank', x: -25, z: 9 },
    { kind: 'gear', x: 3, z: 13 },
    { kind: 'coil', x: 25, z: -6 },
    { kind: 'cell', x: -3, z: -17 },
    // tucked inside the wreck, where the ship cannot fly: spacewalk for these
    { kind: 'coil', x: -15, z: -7 },
    { kind: 'coil', x: -18, z: -9.5 },
    { kind: 'gear', x: -14, z: -10 },
    { kind: 'cell', x: -17.5, z: -6 },
  ],
  respawnSeconds: 90,   // a collected item drifts back in after this long, so the field never runs dry
  driftHome: 0.5,       // how firmly a loose item drifts back to its spot (spring)
  driftDamp: 1.4,       // ...and how calmly
};

/** Winch feel. The flight model itself (FLY in main.js) is the helicopter's, unchanged. */
export const WINCH = {
  snapRadius: 1.4,      // hook this close (sideways) to an item's loop and it clicks on
  catchSpeed: 7,        // ...unless the hook is swinging faster than this
  maxLen: 9,            // longest the cable reels out
};

/** Spacewalk feel. */
export const EVA = {
  thrust: 3.4,          // acceleration at full stick
  maxSpeed: 4.4,        // ship flight tops out at 10.5
  drag: 0.35,           // low = long floaty drift
  grabRadius: 2.2,      // hand grapple snap radius
  carryMax: 3,          // small items towed at once
  dockRadius: 2.3,      // float this close to the ship and the airlock takes you in
  oxygenSeconds: 150,   // soft pacing only: when it runs low the tether reels you home and it refills
  lowOxygen: 0.2,       // fraction at which the tether starts shortening
};

/**
 * Tether tiers. `radius` is the one number to balance: free movement inside it, a gentle pull
 * (strength `pull`) outside it. `cost` is paid from the hold at the ship's workshop.
 * `ready: false` marks tiers whose special ability is not in the prototype yet.
 */
export const TETHER = [
  { tier: 1, name: 'Short cord', radius: 9, pull: 1.2, cost: null },
  { tier: 2, name: 'Reinforced line', radius: 15, pull: 2.6, cost: { metal: 6, wire: 2, power: 1 } },
  { tier: 3, name: 'Reel tether', radius: 24, pull: 2.6, reel: true, cost: { metal: 12, wire: 4, power: 2 }, ready: false },
  { tier: 4, name: 'Anchor line', radius: 24, pull: 2.6, reel: true, anchors: true, cost: { metal: 20, wire: 6, power: 4 }, ready: false },
];

/** Repair tasks at the ship. `unlocks` names an ability main.js checks with has('...'). */
export const REPAIRS = [
  { id: 'scanner', name: 'Mend the scanner dish', blurb: 'Arrows point the way to salvage, even off screen.', cost: { metal: 4, wire: 1 }, unlocks: 'scanner' },
];
