import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useBackHandler } from './back';
import { peopleFor, STORES, WHERE_LABEL, type Task } from './data';
import { dateKey, fmtTime, fromKey, relativeLabel, today } from './dates';
import { IBag, ICalendar, ICheck, IFood, IFridge, IHome, IMic, ISend, ITasks } from './icons';
import { useNav } from './nav';
import { useStore, type Actions } from './store';
import { ease, spring, tap } from './ui';
import { parseCommand, personIn, speechSupported, startListening, type Command, type Listener, type Tab } from './voice';
import type { AppData } from './data';

type Phase = 'listening' | 'idle' | 'done' | 'error';
interface Result { ok: boolean; area: string; text: string; tab?: Tab; auto?: boolean; }

const EXAMPLES = [
  'Add milk and eggs to the shopping list',
  "We're almost out of coffee",
  'Put the dentist on Friday at 10',
  'Remind Dad to fix the sink tomorrow',
  'I just bought a dozen eggs',
  "What's for dinner?"
];

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'task', 'chore', 'kid', "kid's", 'kids', 'dad', "dad's", 'mom', "mom's", 'family', 'for', 'to', 'of', 'as', 'done']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/'s$/, '').replace(/(ing|es|s)$/, ''));

function findTask(tasks: Task[], query: string, names: string[]): Task | null {
  const nameSet = new Set(names.flatMap((n) => words(n)));
  const q = words(query).filter((w) => !nameSet.has(w));
  const who = personIn(query);
  let best: Task | null = null, score = 0;
  for (const t of tasks) {
    if (who && t.who !== who) continue;
    const tw = words(t.title);
    const s = q.filter((w) => tw.some((x) => x === w || x.startsWith(w) || w.startsWith(x))).length + (t.done ? 0 : 0.5);
    if (s > score) { score = s; best = t; }
  }
  return score >= 1 ? best : null;
}

export function runCommands(cmds: Command[], data: AppData, act: Actions): Result[] {
  const out: Result[] = [];
  const people = peopleFor(data.settings);
  const home = data.settings.defaultStore;
  for (const c of cmds) {
    switch (c.kind) {
      case 'grocery': {
        const store = c.store || home;
        c.items.forEach((i) => act.groceryAdd(i.name, i.qty, store));
        out.push({ ok: true, area: 'Groceries', text: c.items.map((i) => i.name).join(', ') + ' · ' + STORES[store].name, tab: 'groceries' });
        break;
      }
      case 'out': {
        const marked: string[] = [];
        c.items.forEach((i) => { if (!c.partial && act.stockOut(i.name)) marked.push(i.name); act.groceryAdd(i.name, i.qty, home); });
        out.push({ ok: true, area: 'Groceries', text: 'Added ' + c.items.map((i) => i.name).join(', '), tab: 'groceries' });
        if (marked.length) out.push({ ok: true, area: 'Stock', text: marked.join(', ') + ' marked as out', tab: 'stock' });
        break;
      }
      case 'stock': {
        const added = c.items.map((i) => act.stockAdd(i.name, i.qty, '', c.where));
        out.push({ ok: true, area: 'Stock', text: added.map((a, k) => a.name + ' +' + c.items[k].qty + ' · ' + WHERE_LABEL[a.where]).join(', '), tab: 'stock' });
        break;
      }
      case 'task': {
        act.taskAdd(c.who, c.title, c.due);
        out.push({ ok: true, area: 'Tasks', text: people[c.who].name + ': ' + c.title + ' · ' + c.due, tab: 'tasks' });
        break;
      }
      case 'done': {
        const t = findTask(data.tasks, c.query, Object.values(data.settings.names));
        if (t) { act.taskSetDone(t.id, true); out.push({ ok: true, area: 'Tasks', text: t.title + ' marked done', tab: 'tasks' }); }
        else out.push({ ok: false, area: 'Tasks', text: 'I couldn’t find a task like “' + c.query + '”', tab: 'tasks' });
        break;
      }
      case 'event': {
        act.eventAdd({ date: c.date, title: c.title, start: c.start, end: c.end, who: c.who });
        out.push({ ok: true, area: 'Calendar', text: c.title + ' · ' + relativeLabel(fromKey(c.date)) + ' at ' + fmtTime(c.start), tab: 'calendar' });
        break;
      }
      case 'plan': {
        act.planSet(c.date, c.meal);
        out.push({ ok: true, area: 'Meals', text: c.meal + ' for dinner ' + (c.date === dateKey(today()) ? 'tonight' : relativeLabel(fromKey(c.date))), tab: 'meals' });
        break;
      }
      case 'dinner': {
        const m = data.plan[dateKey(today())];
        out.push({ ok: true, area: 'Meals', text: m ? 'Tonight is ' + m : 'Nothing planned tonight. Here are ideas.', tab: 'meals', auto: true });
        break;
      }
      case 'nav': {
        const names: Record<Tab, string> = { home: 'Home', stock: 'Stock', calendar: 'Calendar', tasks: 'Tasks', groceries: 'Groceries', meals: 'Meals', settings: 'Settings' };
        out.push({ ok: true, area: 'Open', text: names[c.tab], tab: c.tab, auto: true });
        break;
      }
      default:
        out.push({ ok: false, area: 'Not sure', text: 'I didn’t catch that. Try “add milk to the list”.' });
    }
  }
  return out;
}

const AREA_ICON: Record<string, (p: { size?: number; color?: string }) => React.ReactElement> = {
  Groceries: IBag, Stock: IFridge, Tasks: ITasks, Calendar: ICalendar, Meals: IFood, Open: IHome
};

export default function Assistant({ open, onClose, onListening }: { open: boolean; onClose: () => void; onListening: (on: boolean) => void }) {
  const { data, act } = useStore();
  const nav = useNav();
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const listener = useRef<Listener | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  useBackHandler(open, onClose);

  const run = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setHeard(t);
    const res = runCommands(parseCommand(t), dataRef.current, act);
    setResults(res);
    setPhase('done');
    tap('medium');
    const only = res.length === 1 ? res[0] : null;
    if (only && only.auto && only.tab) {
      window.setTimeout(() => { nav.go(only.tab!); onClose(); }, 700);
    }
  };

  const listen = async () => {
    setResults([]); setError(''); setHeard(''); setTyping(false);
    if (!speechSupported()) { setTyping(true); setPhase('idle'); return; }
    try {
      setPhase('listening'); onListening(true);
      listener.current = await startListening({
        onPartial: (t) => setHeard(t),
        onEnd: (t) => { onListening(false); listener.current = null; if (t.trim()) run(t); else { setPhase('idle'); setError('I didn’t hear anything. Tap the mic to try again, or type.'); } },
        onError: (m) => { onListening(false); listener.current = null; setPhase('error'); setError(m); }
      });
    } catch (e) {
      onListening(false);
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Voice isn’t available.');
      setTyping(true);
    }
  };

  useEffect(() => {
    if (open) listen();
    else { listener.current?.stop(); listener.current = null; onListening(false); setTyped(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); const t = typed; setTyped(''); run(t); };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="as-scrim" className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ zIndex: 24 }} />
          <motion.section key="as" role="dialog" aria-label="Assistant" aria-live="polite" className="sheet" data-testid="assistant"
            initial={{ y: 60, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0, scale: 0.96 }} transition={spring}
            style={{ zIndex: 25, bottom: 'calc(var(--tabbar) + 90px)', left: 12, right: 12, transformOrigin: '50% 100%' }}>
            <div className="sheet-body" style={{ paddingTop: 18 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 10 }}>
                  <Bars active={phase === 'listening'} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#66656D' }} data-testid="assistant-state">
                    {phase === 'listening' ? 'Listening…' : phase === 'done' ? 'Done' : phase === 'error' ? 'Voice unavailable' : 'Ask me anything'}
                  </span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {phase !== 'listening' && speechSupported() && (
                    <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label="Listen again" onClick={listen} style={{ borderRadius: 22, background: 'rgba(46,52,92,0.06)' }}><IMic size={18} /></motion.button>
                  )}
                  <button onClick={phase === 'listening' ? () => listener.current?.stop() : onClose} data-testid="assistant-done" style={{ height: 44, padding: '0 16px', borderRadius: 22, background: 'rgba(46,52,92,0.06)', fontSize: 13, fontWeight: 600 }}>
                    {phase === 'listening' ? 'Stop' : 'Close'}
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {heard ? (
                  <motion.div key="heard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontSize: 21, lineHeight: 1.35, fontWeight: 500, letterSpacing: '-0.02em' }} data-testid="heard">
                    {heard}{phase === 'listening' && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ color: '#CFCDC7' }}>|</motion.span>}
                  </motion.div>
                ) : phase === 'listening' ? (
                  <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ fontSize: 21, fontWeight: 500, color: '#A9A8AE', letterSpacing: '-0.02em' }}>Go ahead, I&rsquo;m listening</motion.div>
                ) : null}
              </AnimatePresence>

              {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="small" style={{ color: '#8A5200', background: '#FFF3DE', padding: '8px 12px', borderRadius: 10 }} data-testid="assistant-error">{error}</motion.div>}

              {results.length > 0 && (
                <motion.div className="col" style={{ gap: 6 }} initial="h" animate="s" variants={{ h: {}, s: { transition: { staggerChildren: 0.08 } } }} data-testid="results">
                  {results.map((r, i) => {
                    const Icon = AREA_ICON[r.area] || ICheck;
                    return (
                      <motion.button key={i} variants={{ h: { opacity: 0, y: 10, scale: 0.96 }, s: { opacity: 1, y: 0, scale: 1 } }} transition={spring} whileTap={{ scale: 0.98 }}
                        onClick={() => { if (r.tab) { nav.go(r.tab); onClose(); } }} data-testid="result"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: r.ok ? 'rgba(46,52,92,0.05)' : '#FFF3DE', textAlign: 'left' }}>
                        <span style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.ok ? '#ECEEFB' : '#FFE6BF' }}>
                          <Icon size={16} color={r.ok ? '#3D47B8' : '#8A5200'} />
                        </span>
                        <span className="col grow" style={{ gap: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#66656D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.area}</span>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{r.text}</span>
                        </span>
                        {r.ok && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.15 + i * 0.08 }}><ICheck size={16} color="#2F9E5B" /></motion.span>}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}

              <AnimatePresence>
                {phase !== 'listening' && (
                  <motion.form key="type" onSubmit={submit} className="row" style={{ gap: 6 }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }}>
                    <label htmlFor="assistant-input" className="sr-only">Type a request</label>
                    <input id="assistant-input" className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a request…" enterKeyHint="send" autoFocus={typing} />
                    <motion.button type="submit" className="icon-btn" aria-label="Send" whileTap={{ scale: 0.9 }} style={{ width: 48, height: 48, borderRadius: 14, background: '#4F5BD5' }}><ISend size={18} color="#fff" /></motion.button>
                  </motion.form>
                )}
              </AnimatePresence>

              {phase !== 'listening' && results.length === 0 && (
                <div className="col" style={{ gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#66656D' }}>Try saying</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {EXAMPLES.map((x, i) => (
                      <motion.button key={x} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} whileTap={{ scale: 0.95 }} onClick={() => run(x)} className="chip" style={{ background: 'rgba(46,52,92,0.05)', fontSize: 13, padding: '8px 12px', minHeight: 36 }}>
                        {x}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

function Bars({ active }: { active: boolean }) {
  return (
    <div className="row" style={{ gap: 3, height: 20 }} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span key={i} className="vbar" style={{ height: 20 }}
          animate={active ? { scaleY: [0.3, 1, 0.45, 0.9, 0.3] } : { scaleY: 0.3 }}
          transition={active ? { duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' } : { duration: 0.3 }} />
      ))}
    </div>
  );
}
