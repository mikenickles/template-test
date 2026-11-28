import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { addDays, dateKey, DOW_LONG, today } from './dates';
import type { PersonId, StoreId, Where } from './data';

/* ============================================================
   Command parsing — turns a spoken sentence into app actions.
   ============================================================ */

export type Tab = 'home' | 'stock' | 'calendar' | 'tasks' | 'food';
export type Command =
  | { kind: 'grocery'; items: { name: string; qty: string }[]; store: StoreId | null }
  | { kind: 'out'; items: { name: string; qty: string }[]; partial: boolean }
  | { kind: 'stock'; items: { name: string; qty: number }[]; where: Where | null }
  | { kind: 'task'; who: PersonId; title: string; due: string }
  | { kind: 'done'; query: string }
  | { kind: 'event'; title: string; date: string; start: string; end: string; who: PersonId }
  | { kind: 'plan'; meal: string; date: string }
  | { kind: 'nav'; tab: Tab; food?: 'meals' | 'groceries' }
  | { kind: 'dinner' }
  | { kind: 'unknown'; text: string };

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12, couple: 2 };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const VERB_START = '(?:add|put|remind|schedule|book|create|plan|we|we\'re|i|i\'ve|show|open|go|what|buy|get|mark|need|pick)';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,.!?]+$/g, '').trim();

function personIn(s: string): PersonId | null {
  if (/\b(dad|daddy|father)\b/i.test(s)) return 'D';
  if (/\b(mom|mommy|mum|mother)\b/i.test(s)) return 'M';
  if (/\b(the kid|kid|kids|son|daughter)\b/i.test(s)) return 'K';
  if (/\b(family|everyone|everybody|us|all of us)\b/i.test(s)) return 'F';
  return null;
}

function storeIn(s: string): StoreId | null {
  if (/\bcostco\b/i.test(s)) return 'costco';
  if (/\btrader joe'?s?\b|\btj'?s\b/i.test(s)) return 'tj';
  if (/\btarget\b/i.test(s)) return 'target';
  if (/\bsafeway\b/i.test(s)) return 'safeway';
  return null;
}

/** "a bag of limes" -> { name: 'Limes', qty: '1 bag' } */
export function parseItem(raw: string): { name: string; qty: string; n: number } {
  let s = clean(raw.replace(/^(some|more|the|our|my)\s+/i, ''));
  const m = s.match(/^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|a couple of|couple of|a dozen|dozen)\s+(bags?|boxes?|cartons?|cans?|bottles?|packs?|packages?|dozen|lbs?|pounds?|gallons?|gal|loaf|loaves|bunch(?:es)?|jars?|heads?|cups?|sticks?|tubs?|blocks?)?\s*(?:of\s+)?(.+)$/i);
  if (m) {
    const word = m[1].toLowerCase().replace(/^a\s+/, '').replace(/\s+of$/, '');
    let n = /^\d+$/.test(word) ? parseInt(word, 10) : (NUM[word] ?? 1);
    let unit = (m[2] || '').toLowerCase();
    if (unit === 'dozen') { n = n * 12; unit = ''; }
    if (word === 'dozen') { n = 12; }
    unit = unit.replace(/^pounds?$/, 'lb').replace(/^lbs$/, 'lb').replace(/^gallons?$/, 'gal');
    if (unit && n > 1 && !/s$/.test(unit) && !['lb', 'gal'].includes(unit)) unit = unit.replace(/(ch|x)$/, '$1e') + 's';
    if (unit && n === 1) unit = unit.replace(/(ches|xes)$/, (x) => x.slice(0, -2)).replace(/s$/, '');
    s = m[3];
    return { name: cap(clean(s)), qty: unit ? n + ' ' + unit : String(n), n };
  }
  return { name: cap(s), qty: '1', n: 1 };
}

function splitItems(s: string) {
  return s.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i).map((x) => x.trim()).filter(Boolean).map(parseItem).filter((x) => x.name.length > 0);
}

/** Finds a day reference; returns the date key and the text with the phrase removed. */
export function extractDate(s: string, base = today()): { date: string | null; rest: string } {
  let m = s.match(/\b(today|tonight|this evening|this afternoon|this morning)\b/i);
  if (m) return { date: dateKey(base), rest: s.replace(m[0], ' ') };
  m = s.match(/\b(the day after tomorrow)\b/i);
  if (m) return { date: dateKey(addDays(base, 2)), rest: s.replace(m[0], ' ') };
  m = s.match(/\b(tomorrow)( night| morning| evening| afternoon)?\b/i);
  if (m) return { date: dateKey(addDays(base, 1)), rest: s.replace(m[0], ' ') };
  m = s.match(/\b(?:on\s+)?(this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i);
  if (m) {
    const target = DAYS.indexOf(m[2].toLowerCase());
    let diff = (target - base.getDay() + 7) % 7;
    // "next Friday" said on a Friday means a week from today; otherwise the coming one.
    if (m[1] && /next/i.test(m[1]) && diff === 0) diff = 7;
    return { date: dateKey(addDays(base, diff)), rest: s.replace(m[0], ' ') };
  }
  return { date: null, rest: s };
}

/** Finds a time ("at 10", "3:30 pm", "noon"); returns HH:MM. */
export function extractTime(s: string): { time: string | null; rest: string } {
  let m = s.match(/\b(?:at\s+)?(noon|midday)\b/i);
  if (m) return { time: '12:00', rest: s.replace(m[0], ' ') };
  m = s.match(/\b(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?(?=\s|$|[,.!?])/i);
  if (m && (m[3] || /\bat\s+\d/i.test(m[0]) || m[2])) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 23 || min > 59) return { time: null, rest: s };
    const ap = (m[3] || '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    else if (ap.startsWith('a') && h === 12) h = 0;
    else if (!ap.startsWith('a') && !ap.startsWith('p') && h >= 1 && h <= 6) h += 12;
    if (/\b(tonight|evening|night)\b/i.test(s) && h < 12) h += 12;
    return { time: String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'), rest: s.replace(m[0], ' ') };
  }
  return { time: null, rest: s };
}

function dueLabel(s: string): { due: string; rest: string } {
  const { date, rest } = extractDate(s);
  if (!date) return { due: 'Today', rest: s };
  const t = today();
  if (date === dateKey(t)) return { due: 'Today', rest };
  if (date === dateKey(addDays(t, 1))) return { due: 'Tomorrow', rest };
  const [y, mo, d] = date.split('-').map(Number);
  return { due: DOW_LONG[new Date(y, mo - 1, d).getDay()].slice(0, 3), rest };
}

export function splitClauses(text: string): string[] {
  const re = new RegExp('\\s*(?:[.;!?]+\\s+|,\\s*(?:and\\s+|then\\s+|and then\\s+)?(?=' + VERB_START + '\\b)|\\s+(?:and then|then|and)\\s+(?=(?:add|put|remind|schedule|book|create|plan|show|open|mark)\\b))\\s*', 'i');
  return text.split(re).map(clean).filter(Boolean);
}

export function parseClause(raw: string): Command {
  const s = clean(raw).replace(/^(hey|ok|okay|please|can you|could you|would you)\s+/i, '').replace(/^(please)\s+/i, '').replace(/\s+please$/i, '');
  const lower = s.toLowerCase();

  // Navigation
  let m = lower.match(/^(?:open|show(?: me)?|go to|switch to|take me to)\s+(?:the\s+|my\s+|our\s+)?(home|stock|fridge|freezer|pantry|calendar|schedule|tasks?|to-?dos?|chores|groceries|grocery list|shopping list|list|meals?|meal plan|food|recipes)\b/);
  if (m) {
    const w = m[1];
    if (/home/.test(w)) return { kind: 'nav', tab: 'home' };
    if (/stock|fridge|freezer|pantry/.test(w)) return { kind: 'nav', tab: 'stock' };
    if (/calendar|schedule/.test(w)) return { kind: 'nav', tab: 'calendar' };
    if (/task|to-?do|chore/.test(w)) return { kind: 'nav', tab: 'tasks' };
    if (/grocer|shopping|list/.test(w)) return { kind: 'nav', tab: 'food', food: 'groceries' };
    return { kind: 'nav', tab: 'food', food: 'meals' };
  }
  if (/what(?:'s| is| are we having)? for dinner|what are we (?:having|eating)/.test(lower)) return { kind: 'dinner' };
  if (/what can (?:we|i) (?:make|cook|have)|dinner ideas|meal ideas|ideas for dinner/.test(lower)) return { kind: 'nav', tab: 'food', food: 'meals' };

  // Mark a task done
  m = s.match(/^(?:mark|check off|tick off|finish(?:ed)?|complete(?:d)?)\s+(.+?)(?:\s+as)?(?:\s+(?:done|complete|completed|finished))?$/i);
  if (m && !/\blist\b/i.test(s)) return { kind: 'done', query: clean(m[1].replace(/^(the|my|our)\s+/i, '')) };
  m = s.match(/^(?:i|we|dad|mom|the kid|kid)\s+(?:just\s+)?(?:finished|did|completed)\s+(.+)$/i);
  if (m) return { kind: 'done', query: clean(m[1].replace(/^(the|my|our)\s+/i, '')) };

  // Out of / running low
  m = s.match(/^(?:we(?:'re| are)|i'?m|i am)?\s*(almost out of|out of|running low on|running out of|low on|all out of)\s+(.+)$/i);
  if (m) return { kind: 'out', items: splitItems(m[2]).map(({ name, qty }) => ({ name, qty })), partial: !/^(out of|all out of)$/i.test(m[1]) };

  // Bought / put away
  m = s.match(/^(?:i|we|dad|mom)\s+(?:just\s+)?(?:bought|got|picked up|put|added|stocked up on)\s+(.+?)(?:\s+(?:in|into|to)\s+the\s+(fridge|freezer|pantry))?$/i);
  if (m) return { kind: 'stock', items: splitItems(m[1]).map(({ name, n }) => ({ name, qty: n })), where: (m[2]?.toLowerCase() as Where) || null };
  m = s.match(/^(?:add|put)\s+(.+?)\s+(?:to|in|into)\s+(?:the\s+)?(fridge|freezer|pantry|stock)$/i);
  if (m) return { kind: 'stock', items: splitItems(m[1]).map(({ name, n }) => ({ name, qty: n })), where: m[2].toLowerCase() === 'stock' ? null : (m[2].toLowerCase() as Where) };

  // Meal plan
  m = s.match(/^(?:let's\s+)?(?:plan|have|make|cook)\s+(.+?)\s+for\s+(?:dinner\s+)?(?:on\s+)?(.+)$/i);
  if (m && /dinner|today|tonight|tomorrow|day\b/i.test(m[2] + ' ' + s)) {
    const { date } = extractDate(m[2]);
    if (date || /dinner/i.test(m[2])) return { kind: 'plan', meal: cap(clean(m[1].replace(/^(some|a|an)\s+/i, ''))), date: date || dateKey(today()) };
  }
  m = s.match(/^(?:put|add)\s+(.+?)\s+(?:on|to)\s+the\s+meal plan(?:\s+(?:for|on)\s+(.+))?$/i);
  if (m) return { kind: 'plan', meal: cap(clean(m[1])), date: (m[2] && extractDate(m[2]).date) || dateKey(today()) };

  // Tasks
  m = s.match(/^remind\s+(me|dad|mom|the kid|kid|the kids|everyone|us|the family)\s+to\s+(.+)$/i);
  if (m) {
    const who = (m[1].toLowerCase() === 'me' ? null : personIn(m[1])) || 'F';
    const { due, rest } = dueLabel(m[2]);
    return { kind: 'task', who, title: cap(clean(rest)), due };
  }
  m = s.match(/^(?:add|create|make|new)\s+(?:a\s+)?(?:task|to-?do|chore)(?:\s+for\s+(dad|mom|the kid|kid|the family|family|everyone))?(?:\s+to|:)?\s+(.+)$/i);
  if (m) {
    const { due, rest } = dueLabel(m[2]);
    return { kind: 'task', who: (m[1] && personIn(m[1])) || personIn(rest) || 'F', title: cap(clean(rest.replace(/\s+for\s+(dad|mom|the kid|kid|the family|family|everyone)\b/i, ''))), due };
  }
  m = s.match(/^(?:add|put)\s+(.+?)\s+(?:for|on)\s+(dad|mom|the kid|kid|the kids|the family|family|everyone)(?:'s\s+(?:list|tasks))?(?:\s+(.*))?$/i);
  if (m && !/\b(shopping|grocery|groceries)\b/i.test(s) && !extractTime(s).time) {
    const { due } = dueLabel(m[3] || '');
    return { kind: 'task', who: personIn(m[2]) || 'F', title: cap(clean(m[1])), due };
  }

  // Calendar events
  const t = extractTime(s);
  const d = extractDate(t.rest);
  if ((t.time || d.date) && /^(?:put|schedule|book|add|plan|set up|make|we have|there's|there is|i have)\b/i.test(s) && !/\b(shopping|grocery|groceries)\s+list\b/i.test(s)) {
    const start = t.time || '12:00';
    const [h, mi] = start.split(':').map(Number);
    const end = String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
    const who = personIn(d.rest) || 'F';
    const title = clean(d.rest
      .replace(/^(?:put|schedule|book|add|plan|set up|make|we have|there's|there is|i have)\s+/i, '')
      .replace(/\b(?:on|to|in)\s+(?:the|our|my)\s+calendar\b/gi, ' ')
      .replace(/\bfor\s+(?:dad|mom|the kid|kid|the kids|the family|family|everyone|us)\b/gi, ' ')
      .replace(/\b(?:on|at|for)\s*$/i, ' ')
      .replace(/^(?:a|an|the)\s+/i, ''));
    return { kind: 'event', title: cap(title || 'New event'), date: d.date || dateKey(today()), start, end, who };
  }

  // Groceries
  m = s.match(/^(?:add|put|get|buy|grab|pick up|we need|i need|need|we're going to need|we should get)\s+(.+?)(?:\s+(?:to|on|onto|for)\s+(?:the\s+|my\s+|our\s+)?(?:(costco|target|safeway|trader joe'?s)\s+)?(?:shopping\s+|grocery\s+|groceries\s+)?(?:list|run|trip)|\s+(?:at|from)\s+(costco|target|safeway|trader joe'?s))?$/i);
  if (m) {
    const store = storeIn(s);
    const items = splitItems(m[1].replace(/\s+(?:to|on)\s+(?:the\s+)?(?:costco|target|safeway|trader joe'?s)$/i, ''));
    if (items.length) return { kind: 'grocery', items: items.map(({ name, qty }) => ({ name, qty })), store };
  }

  return { kind: 'unknown', text: s };
}

export function parseCommand(text: string): Command[] {
  const clauses = splitClauses(text);
  return clauses.length ? clauses.map(parseClause) : [{ kind: 'unknown', text }];
}

/* ============================================================
   Speech recognition — native plugin on Android, Web Speech
   API in browsers that have it, otherwise typing only.
   ============================================================ */

export interface Listener { stop(): void; }
interface Handlers { onPartial(text: string): void; onEnd(finalText: string): void; onError(message: string): void; }

type WebRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; };

export function speechSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export async function startListening(h: Handlers): Promise<Listener> {
  if (Capacitor.isNativePlatform()) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error('Speech recognition is not available on this phone.');
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('Microphone permission is needed to listen.');
    let last = '';
    let ended = false;
    const finish = () => { if (ended) return; ended = true; window.clearTimeout(guard); SpeechRecognition.removeAllListeners(); h.onEnd(last); };
    // Never leave the panel stuck if the recognizer goes quiet.
    const guard = window.setTimeout(() => { SpeechRecognition.stop().catch(() => undefined); window.setTimeout(finish, 1500); }, 20000);
    await SpeechRecognition.addListener('partialResults', (d) => { if (d.matches && d.matches[0]) { last = d.matches[0]; h.onPartial(last); } });
    await SpeechRecognition.addListener('listeningState', (d) => { if (d.status === 'stopped') finish(); });
    SpeechRecognition.start({ language: 'en-US', partialResults: true, popup: false, maxResults: 1 }).catch((e: unknown) => {
      if (ended) return;
      ended = true; window.clearTimeout(guard); SpeechRecognition.removeAllListeners();
      if (last) h.onEnd(last); else h.onError(e instanceof Error ? e.message : 'I didn\u2019t catch that.');
    });
    return { stop() { SpeechRecognition.stop().catch(() => undefined); window.setTimeout(finish, 1500); } };
  }
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) throw new Error('Voice isn’t available here. Type your request instead.');
  const rec = new Ctor();
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
  let last = '';
  let ended = false;
  const end = () => { if (ended) return; ended = true; window.clearTimeout(guard); h.onEnd(last); };
  rec.onresult = (e) => {
    last = Array.from(e.results).map((r) => r[0].transcript).join(' ');
    h.onPartial(last);
  };
  rec.onerror = (e) => {
    if (ended || e.error === 'aborted' || e.error === 'no-speech') return;
    ended = true; window.clearTimeout(guard);
    h.onError(e.error === 'not-allowed' ? 'Microphone permission is needed to listen.' : e.error === 'audio-capture' ? 'No microphone was found.' : 'Voice error: ' + e.error);
  };
  rec.onend = end;
  // Some recognizers never report that they stopped; finish on our own if that happens.
  const guard = window.setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } window.setTimeout(end, 1200); }, 15000);
  rec.start();
  return { stop() { try { rec.stop(); } catch { /* already stopped */ } window.setTimeout(end, 1200); } };
}
