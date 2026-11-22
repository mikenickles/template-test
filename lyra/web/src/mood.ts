// Lyra's face: what it feels and where it looks. Every <Face> on screen shares this one state,
// so the avatar in the top bar, the drawer and the Lyra page always agree.
//
//  - hold(source, mood): a mood that lasts while something is going on (a call, a reply being
//    written, music playing, late at night). The highest-priority hold wins.
//  - feel(mood, ms): a short reaction on top (a thumbs up, a reply done, an error).
//  - glance(x, y, ms): look somewhere for a moment (down at the message box while you type).
// On its own the face blinks every few seconds and looks around now and then. That idle motion
// stops while the app is in the background, and when Gentle motion is off (Settings, You).
import { useEffect, useState } from "react";
import { ambientOn } from "./sizes";

export type Mood = "calm" | "happy" | "love" | "thinking" | "surprised" | "concerned" | "sleepy" | "listening" | "talking" | "vibing";
export type Source = "voice" | "busy" | "music" | "night";
export interface FaceState {
  mood: Mood;
  /** where the eyes point, -1..1 on each axis (y down) */
  x: number;
  y: number;
  blink: boolean;
}

const PRIORITY: Record<Source, number> = { voice: 4, busy: 3, music: 2, night: 1 };
// some moods point the eyes somewhere on their own
const LOOK: Partial<Record<Mood, [number, number]>> = { thinking: [0.7, -0.75], sleepy: [0, 0.4], concerned: [0, 0.2], listening: [0, -0.1] };
const STILL: Mood[] = ["sleepy", "vibing", "happy", "love"]; // eyes are closed arcs: no blinking

const holds = new Map<Source, Mood>();
let flash: { mood: Mood; until: number } | null = null;
let glanceAt: { x: number; y: number; until: number } | null = null;
let idle: [number, number] = [0, 0];
let blink = false;
let state: FaceState = { mood: "calm", x: 0, y: 0, blink: false };
const listeners = new Set<(s: FaceState) => void>();
const timers: Partial<Record<"blink" | "look" | "flash" | "glance" | "night", ReturnType<typeof setTimeout>>> = {};

function moodNow(now = Date.now()): Mood {
  if (flash && flash.until > now) return flash.mood;
  let best: Mood = "calm";
  let rank = 0;
  for (const [source, mood] of holds) {
    if (PRIORITY[source] > rank) {
      rank = PRIORITY[source];
      best = mood;
    }
  }
  return best;
}

function update(): void {
  const now = Date.now();
  const mood = moodNow(now);
  const look = glanceAt && glanceAt.until > now ? [glanceAt.x, glanceAt.y] : (LOOK[mood] ?? idle);
  const next: FaceState = { mood, x: look[0], y: look[1], blink: blink && !STILL.includes(mood) };
  if (next.mood === state.mood && next.x === state.x && next.y === state.y && next.blink === state.blink) return;
  state = next;
  for (const l of listeners) l(state);
}

export function hold(source: Source, mood: Mood | null): void {
  if (mood) holds.set(source, mood);
  else holds.delete(source);
  update();
}

export function feel(mood: Mood, ms = 2600): void {
  flash = { mood, until: Date.now() + ms };
  clearTimeout(timers.flash);
  timers.flash = setTimeout(() => {
    flash = null;
    update();
  }, ms + 20);
  update();
}

export function glance(x: number, y: number, ms = 1400): void {
  glanceAt = { x, y, until: Date.now() + ms };
  clearTimeout(timers.glance);
  timers.glance = setTimeout(() => {
    glanceAt = null;
    update();
  }, ms + 20);
  update();
}

/** A tap on the face: a little start, then a smile. */
export function poke(): void {
  feel("surprised", 520);
  setTimeout(() => feel("happy", 1500), 540);
}

/** The emoji Lyra put on your message, as a face. */
export function moodForReaction(emoji: string): Mood | null {
  if (emoji === "❤️") return "love";
  if (emoji === "😮") return "surprised";
  if (emoji === "😢") return "concerned";
  if (["👍", "😂", "🎉", "🙏", "🔥", "🙌", "😅"].includes(emoji)) return "happy";
  return null;
}

const awake = () => listeners.size > 0 && document.visibilityState === "visible" && ambientOn();

function scheduleBlink(): void {
  clearTimeout(timers.blink);
  if (!awake()) return;
  timers.blink = setTimeout(
    () => {
      blink = true;
      update();
      setTimeout(() => {
        blink = false;
        update();
        // now and then a double blink
        if (Math.random() < 0.18)
          setTimeout(() => {
            blink = true;
            update();
            setTimeout(() => {
              blink = false;
              update();
            }, 120);
          }, 170);
      }, 130);
      scheduleBlink();
    },
    2200 + Math.random() * 4200,
  );
}

// mostly ahead, sometimes a look to the side or up, never for long
const SPOTS: [number, number][] = [
  [0, 0],
  [0, 0],
  [0, 0],
  [-0.8, 0.1],
  [0.8, 0.1],
  [-0.5, -0.6],
  [0.6, -0.5],
  [0.3, 0.6],
  [-0.4, 0.5],
];
function scheduleLook(): void {
  clearTimeout(timers.look);
  if (!awake()) return;
  timers.look = setTimeout(
    () => {
      const away = idle[0] !== 0 || idle[1] !== 0;
      idle = away ? [0, 0] : SPOTS[Math.floor(Math.random() * SPOTS.length)];
      update();
      scheduleLook();
    },
    idle[0] !== 0 || idle[1] !== 0 ? 900 + Math.random() * 1200 : 3000 + Math.random() * 5000,
  );
}

// late at night Lyra gets sleepy (unless something's going on)
function checkNight(): void {
  const h = new Date().getHours();
  hold("night", h >= 23 || h < 6 ? "sleepy" : null);
  clearTimeout(timers.night);
  timers.night = setTimeout(checkNight, 5 * 60_000);
}

function start(): void {
  scheduleBlink();
  scheduleLook();
}
function stop(): void {
  clearTimeout(timers.blink);
  clearTimeout(timers.look);
  idle = [0, 0];
  blink = false;
  update();
}

let wired = false;
function wire(): void {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("visibilitychange", () => (awake() ? start() : stop()));
  // Gentle motion switched in Settings
  new MutationObserver(() => (awake() ? start() : stop())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-ambient"] });
  checkNight();
}

export function useFace(): FaceState {
  const [s, setS] = useState(state);
  useEffect(() => {
    wire();
    const first = listeners.size === 0;
    listeners.add(setS);
    setS(state);
    if (first) start();
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) stop();
    };
  }, []);
  return s;
}

/** Test hook: the mood that would show now. */
export const currentMood = (): Mood => moodNow();
