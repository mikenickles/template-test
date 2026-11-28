import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { PEOPLE, PERSON_IDS, type PersonId } from '../data';
import { IClose, IPlus } from '../icons';
import { useStore } from '../store';
import { Check, Press, ease, spring, tap } from '../ui';

export default function Tasks() {
  const { data, act } = useStore();
  const [who, setWho] = useState<PersonId>('K');
  const [hideDone, setHideDone] = useState(false);
  const [draft, setDraft] = useState('');
  const [dir, setDir] = useState(1);
  const p = PEOPLE[who];
  const mine = data.tasks.filter((t) => t.who === who);
  const done = mine.filter((t) => t.done).length;
  const shown = mine.filter((t) => !(hideDone && t.done)).sort((a, b) => Number(a.done) - Number(b.done));
  const allDone = data.tasks.filter((t) => t.done).length;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    act.taskAdd(who, draft);
    setDraft('');
    tap('medium');
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="kicker" data-testid="tasks-summary">{allDone} of {data.tasks.length} done across the family</span>
          <h1 className="title">Tasks</h1>
        </div>
        <div role="tablist" aria-label="Family member" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {PERSON_IDS.map((k) => {
            const q = PEOPLE[k], on = k === who;
            const list = data.tasks.filter((t) => t.who === k);
            const d = list.filter((t) => t.done).length;
            return (
              <motion.button key={k} role="tab" aria-selected={on} onClick={() => { if (!on) { tap(); setDir(PERSON_IDS.indexOf(k) > PERSON_IDS.indexOf(who) ? 1 : -1); setWho(k); } }}
                whileTap={{ scale: 0.94 }} transition={spring} data-testid={'person-' + q.name}
                style={{ position: 'relative', height: 96, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: '1px solid rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.5)' }}>
                {on && <motion.span layoutId="person-ring" transition={spring} style={{ position: 'absolute', inset: -1, borderRadius: 18, background: 'rgba(255,255,255,0.94)', boxShadow: '0 0 0 2px ' + q.dot + ', 0 10px 24px rgba(30,36,60,0.1)' }} />}
                <motion.span animate={{ backgroundColor: on ? q.dot : q.tint, color: on ? '#FFFFFF' : q.text, scale: on ? 1.08 : 1 }} transition={spring}
                  style={{ position: 'relative', width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>{q.name[0]}</motion.span>
                <span style={{ position: 'relative', fontSize: 13, fontWeight: 600 }}>{q.name}</span>
                <span className="tnum" style={{ position: 'relative', fontSize: 11, fontWeight: 500, color: '#66656D' }}>{d}/{list.length}</span>
              </motion.button>
            );
          })}
        </div>
      </header>

      <main className="scroll noscroll">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.section key={who} custom={dir} aria-label={p.name} className="card" style={{ overflow: 'hidden' }}
            variants={{ enter: (d: number) => ({ opacity: 0, x: 36 * d, scale: 0.98 }), center: { opacity: 1, x: 0, scale: 1 }, exit: (d: number) => ({ opacity: 0, x: -36 * d, scale: 0.98 }) }}
            initial="enter" animate="center" exit="exit" transition={{ duration: 0.36, ease }}>
            <div className="col" style={{ padding: '16px 16px 12px', gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="col" style={{ gap: 2 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{who === 'F' ? 'Family tasks' : p.name + '’s tasks'}</h2>
                  <span className="small muted" data-testid="tasks-progress">{done} of {mine.length} done</span>
                </div>
                <button role="switch" aria-checked={hideDone} onClick={() => { tap(); setHideDone(!hideDone); }} className="row" style={{ height: 44, gap: 10, fontSize: 13, fontWeight: 600 }} data-testid="hide-done">
                  Hide done
                  <motion.span animate={{ backgroundColor: hideDone ? '#4F5BD5' : 'rgba(46,52,92,0.18)' }} style={{ width: 46, height: 28, borderRadius: 14, position: 'relative', display: 'inline-block' }}>
                    <motion.span animate={{ x: hideDone ? 18 : 0 }} transition={spring} style={{ position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </motion.span>
                </button>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(46,52,92,0.07)', overflow: 'hidden' }}>
                <motion.div animate={{ width: (mine.length ? (done / mine.length) * 100 : 0) + '%' }} transition={{ duration: 0.6, ease }} style={{ height: 4, borderRadius: 2, background: p.dot }} />
              </div>
              <form onSubmit={add} className="row" style={{ gap: 6 }}>
                <label htmlFor="new-task" className="sr-only">New task for {p.name}</label>
                <input id="new-task" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={'Add a task for ' + p.name} enterKeyHint="done" style={{ height: 46 }} />
                <Press type="submit" label={'Add task for ' + p.name} className="icon-btn" style={{ width: 46, height: 46, background: p.dot, borderRadius: 12 }}><IPlus size={18} color="#fff" w={2.4} /></Press>
              </form>
            </div>
            <div className="col" style={{ padding: '0 8px 8px' }}>
              <AnimatePresence initial={false}>
                {shown.map((t) => (
                  <motion.div key={t.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, x: 40, transition: { duration: 0.25 } }} transition={spring} style={{ overflow: 'hidden' }} data-testid="task-row" data-title={t.title}>
                    <div className="row" style={{ gap: 4, padding: '4px 0', minHeight: 56 }}>
                      <Check checked={t.done} onToggle={() => act.taskToggle(t.id)} label={t.title} color={p.dot} />
                      <div className="col grow" style={{ gap: 2 }}>
                        <motion.span className="ellipsis" animate={{ color: t.done ? '#66656D' : '#1B1B1F' }} style={{ fontSize: 15, fontWeight: 500, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</motion.span>
                        <span className="small muted">{t.due}</span>
                      </div>
                      <Press className="icon-btn" label={'Delete ' + t.title} onClick={() => { tap(); act.taskRemove(t.id); }}><IClose size={15} color="#A9A8AE" /></Press>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!shown.length && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring} style={{ padding: '24px 10px', textAlign: 'center', fontSize: 14, color: '#66656D' }}>
                  {mine.length ? 'All done. Nice.' : 'No tasks yet.'}
                </motion.div>
              )}
            </div>
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
}
