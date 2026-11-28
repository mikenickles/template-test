import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { eventsOn, PEOPLE, PERSON_IDS, type DayEvent, type PersonId } from '../data';
import { addDays, dateKey, DOW_LONG, DOW_SHORT, fmtTime, fromKey, MONTHS, minutesNow, sameDay, shortDate, today, weekStart } from '../dates';
import { IChevL, IChevR } from '../icons';
import { useStore } from '../store';
import { FabPlus, Field, Press, Segmented, Sheet, ease, spring, tap } from '../ui';

type View = 'month' | 'week' | 'day';
const HOUR = 48, FIRST = 7, HOURS = 15;

export default function Calendar() {
  const { data, act } = useStore();
  const [view, setView] = useState<View>('month');
  const [cur, setCur] = useState(() => today());
  const [dir, setDir] = useState(0);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<{ ev: DayEvent; date: string } | null>(null);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('12:00');
  const [date, setDate] = useState(dateKey(today()));
  const [who, setWho] = useState<PersonId>('F');
  const scroller = useRef<HTMLElement>(null);
  const T = today();

  useEffect(() => {
    if (view === 'day' && scroller.current) {
      const top = Math.max(0, (Math.floor(minutesNow() / 60) - FIRST - 1) * HOUR);
      scroller.current.scrollTo({ top, behavior: 'smooth' });
    }
  }, [view, cur]);

  const shift = (d: number) => {
    tap();
    setDir(d);
    if (view === 'month') setCur(new Date(cur.getFullYear(), cur.getMonth() + d, 1, 12));
    else setCur(addDays(cur, view === 'week' ? 7 * d : d));
  };
  const goToday = () => { setDir(cur > T ? -1 : 1); setCur(today()); };
  const select = (d: Date, v?: View) => { tap(); setCur(d); if (v) setView(v); };
  const swipe = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 70 && Math.abs(info.offset.x) > Math.abs(info.offset.y)) shift(info.offset.x < 0 ? 1 : -1);
  };

  const ws = weekStart(cur);
  const we = addDays(ws, 6);
  const heading = view === 'month' ? MONTHS[cur.getMonth()] + ' ' + cur.getFullYear()
    : view === 'week' ? MONTHS[ws.getMonth()].slice(0, 3) + ' ' + ws.getDate() + ' – ' + (we.getMonth() !== ws.getMonth() ? MONTHS[we.getMonth()].slice(0, 3) + ' ' : '') + we.getDate()
    : shortDate(cur);
  const pageKey = view + (view === 'month' ? cur.getFullYear() + '-' + cur.getMonth() : view === 'week' ? dateKey(ws) : dateKey(cur));
  const dayEvents = eventsOn(data, dateKey(cur));

  const openAdd = () => { setDate(dateKey(cur)); setTitle(''); setTime('12:00'); setWho('F'); setAdding(!adding); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const [h, m] = time.split(':').map(Number);
    act.eventAdd({ date, title, start: time, end: String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(m).padStart(2, '0'), who });
    setAdding(false);
    setCur(fromKey(date));
    tap('medium');
  };

  const slide = {
    enter: (d: number) => ({ opacity: 0, x: d * 60 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -60 })
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="head-row">
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="kicker">Family calendar</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1 key={heading} className="title ellipsis" style={{ fontSize: 28 }} data-testid="cal-title"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>{heading}</motion.h1>
            </AnimatePresence>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <Press className="glass-btn" label="Previous" onClick={() => shift(-1)} testId="cal-prev"><IChevL size={18} /></Press>
            <Press className="glass-btn" label="Next" onClick={() => shift(1)} testId="cal-next"><IChevR size={18} /></Press>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="grow">
            <Segmented label="View" value={view} onChange={(v) => { setDir(0); setView(v); }} testId="cal-views"
              options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]} />
          </div>
          <Press className="pill" onClick={goToday} testId="cal-today" style={{ height: 52, borderRadius: 26 }}>Today</Press>
        </div>
      </header>

      <main className="scroll noscroll" ref={scroller}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={pageKey} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.36, ease }}
            drag={view === 'day' ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={swipe} style={{ touchAction: 'pan-y' }}>
            {view === 'month' && <Month cur={cur} onPick={(d) => select(d)} onOpen={(ev) => setDetail({ ev, date: dateKey(cur) })} />}
            {view === 'week' && (
              <div className="col" style={{ gap: 10 }} data-testid="week-view">
                {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d, i) => {
                  const evs = eventsOn(data, dateKey(d));
                  const isT = sameDay(d, T);
                  return (
                    <motion.section key={dateKey(d)} className="card" aria-label={DOW_LONG[d.getDay()]} initial={{ opacity: 0, y: 12 }} animate={{ opacity: evs.length ? 1 : 0.7, y: 0 }} transition={{ delay: i * 0.035, duration: 0.4, ease }}
                      style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button className="row" style={{ minHeight: 36, textAlign: 'left' }} onClick={() => select(d, 'day')} aria-label={'Open ' + shortDate(d)}>
                        <span className="tnum" style={{ width: 34, height: 34, borderRadius: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0, background: isT ? '#4F5BD5' : 'rgba(46,52,92,0.06)', color: isT ? '#fff' : '#1B1B1F' }}>{d.getDate()}</span>
                        <span className="grow" style={{ fontSize: 15, fontWeight: 600 }}>{DOW_LONG[d.getDay()]}</span>
                        <span className="small muted">{evs.length ? evs.length + (evs.length === 1 ? ' event' : ' events') : 'Free'}</span>
                      </button>
                      {evs.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={() => setDetail({ ev, date: dateKey(d) })} />)}
                    </motion.section>
                  );
                })}
              </div>
            )}
            {view === 'day' && (
              <div className="col" style={{ gap: 12 }} data-testid="day-view">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                  {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
                    const sel = sameDay(d, cur), isT = sameDay(d, T);
                    return (
                      <motion.button key={dateKey(d)} onClick={() => { setDir(d > cur ? 1 : -1); select(d); }} aria-label={shortDate(d)} aria-pressed={sel} whileTap={{ scale: 0.92 }}
                        style={{ position: 'relative', height: 58, borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, border: '1px solid ' + (isT && !sel ? '#4F5BD5' : 'rgba(255,255,255,0.9)'), background: 'rgba(255,255,255,0.68)', color: sel ? '#fff' : isT ? '#2F3E9E' : '#1B1B1F' }}>
                        {sel && <motion.span layoutId="day-strip" transition={spring} style={{ position: 'absolute', inset: -1, borderRadius: 16, background: '#4F5BD5' }} />}
                        <span style={{ position: 'relative', fontSize: 11, fontWeight: 600, color: sel ? 'rgba(255,255,255,0.85)' : '#66656D' }}>{DOW_SHORT[(d.getDay() + 6) % 7][0]}</span>
                        <span className="tnum" style={{ position: 'relative', fontSize: 16, fontWeight: 600 }}>{d.getDate()}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <section className="card" aria-label="Timeline" style={{ padding: '14px 0 10px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', height: HOUR * HOURS }}>
                    <div style={{ position: 'relative' }}>
                      {Array.from({ length: HOURS }, (_, i) => {
                        const h = FIRST + i;
                        return <span key={h} style={{ position: 'absolute', right: 8, top: i === 0 ? 2 : i * HOUR - 7, fontSize: 11, fontWeight: 500, color: '#66656D', whiteSpace: 'nowrap' }}>{(h % 12 || 12) + (h < 12 ? ' AM' : ' PM')}</span>;
                      })}
                    </div>
                    <div style={{ position: 'relative', backgroundImage: 'linear-gradient(rgba(46,52,92,0.07) 1px, transparent 1px)', backgroundSize: '100% ' + HOUR + 'px' }}>
                      {sameDay(cur, T) && <NowLine />}
                      {dayEvents.map((ev, i) => {
                        const [sh, sm] = ev.start.split(':').map(Number), [eh, em] = ev.end.split(':').map(Number);
                        const top = Math.max(0, (sh + sm / 60 - FIRST) * HOUR);
                        const h = Math.max(32, (eh + em / 60 - sh - sm / 60) * HOUR - 3);
                        const p = PEOPLE[ev.who];
                        return (
                          <motion.button key={ev.id} onClick={() => setDetail({ ev, date: dateKey(cur) })} initial={{ opacity: 0, scaleY: 0.6 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ delay: 0.08 + i * 0.05, ...spring }} whileTap={{ scale: 0.97 }}
                            style={{ position: 'absolute', top, height: h, left: 6, right: 12, padding: '6px 12px', borderRadius: 10, background: p.tint, color: p.text, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden', textAlign: 'left', transformOrigin: 'top' }}>
                            <span className="ellipsis" style={{ fontSize: 14, fontWeight: 600, maxWidth: '100%' }}>{ev.title}</span>
                            <span style={{ fontSize: 12, opacity: 0.85 }}>{fmtTime(ev.start)} – {fmtTime(ev.end)} · {p.name}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <FabPlus open={adding} onClick={openAdd} label="New event" testId="cal-add" />
      <Sheet open={adding} onClose={() => setAdding(false)} label="New event" testId="event-sheet">
        <form onSubmit={submit} className="col" style={{ gap: 12 }}>
          <h2 className="sheet-title">New event</h2>
          <Field id="ev-title" label="Event title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's happening?" autoFocus />
          <div className="row" style={{ gap: 8 }}>
            <label htmlFor="ev-date" className="small muted" style={{ width: 40 }}>Day</label>
            <input id="ev-date" type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ flex: 1 }} />
            <label htmlFor="ev-time" className="sr-only">Time</label>
            <input id="ev-time" type="time" className="field" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} style={{ width: 120 }} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted grow">Who</span>
            {PERSON_IDS.map((k) => {
              const p = PEOPLE[k], on = k === who;
              return (
                <motion.button type="button" key={k} aria-label={p.name} aria-pressed={on} onClick={() => { tap(); setWho(k); }} whileTap={{ scale: 0.9 }}
                  animate={{ backgroundColor: on ? p.dot : p.tint, color: on ? '#FFFFFF' : p.text, scale: on ? 1.06 : 1 }} transition={spring}
                  style={{ width: 44, height: 44, borderRadius: 22, fontSize: 14, fontWeight: 700 }}>{p.name[0]}</motion.button>
              );
            })}
          </div>
          <button type="submit" className="btn-primary" disabled={!title.trim()}>Add to calendar</button>
        </form>
      </Sheet>

      <Sheet open={!!detail} onClose={() => setDetail(null)} label="Event details" testId="event-detail">
        {detail && (
          <div className="col" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: PEOPLE[detail.ev.who].dot }} />
              <div className="col" style={{ gap: 4 }}>
                <h2 className="sheet-title">{detail.ev.title}</h2>
                <span className="muted" style={{ fontSize: 14 }}>{shortDate(fromKey(detail.date))} · {fmtTime(detail.ev.start)} – {fmtTime(detail.ev.end)}</span>
                <span className="muted" style={{ fontSize: 14 }}>{PEOPLE[detail.ev.who].name}{detail.ev.routine ? ' · Repeats weekly' : ''}</span>
              </div>
            </div>
            <button className="btn-soft" style={{ color: '#B4372D', height: 48 }} data-testid="event-delete" onClick={() => { act.eventRemove(detail.ev.id); setDetail(null); tap('medium'); }}>
              {detail.ev.routine ? 'Skip this week' : 'Delete event'}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Month({ cur, onPick, onOpen }: { cur: Date; onPick: (d: Date) => void; onOpen: (ev: DayEvent) => void }) {
  const { data } = useStore();
  const T = today();
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1, 12);
  const start = weekStart(first);
  const evs = eventsOn(data, dateKey(cur));
  return (
    <div className="col" style={{ gap: 12 }} data-testid="month-view">
      <section aria-label="Month" className="card" style={{ padding: '12px 8px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center', paddingBottom: 6 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#66656D' }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
          {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
            const inM = d.getMonth() === cur.getMonth();
            const isT = sameDay(d, T), sel = sameDay(d, cur);
            const dots = eventsOn(data, dateKey(d)).slice(0, 3);
            return (
              <button key={dateKey(d)} onClick={() => onPick(d)} aria-label={shortDate(d) + ', ' + dots.length + ' events'} aria-pressed={sel} data-testid="month-cell"
                style={{ position: 'relative', height: 48, paddingTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, borderRadius: 12, opacity: inM ? 1 : 0.4 }}>
                {sel && !isT && <motion.span layoutId="month-sel" transition={spring} style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(79,91,213,0.1)' }} />}
                <span className="tnum" style={{ position: 'relative', width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, background: isT ? '#4F5BD5' : 'transparent', color: isT ? '#fff' : sel ? '#2F3E9E' : '#1B1B1F' }}>{d.getDate()}</span>
                <span style={{ position: 'relative', display: 'flex', gap: 3, height: 5 }}>
                  {dots.map((e) => <span key={e.id} style={{ width: 5, height: 5, borderRadius: 3, background: PEOPLE[e.who].dot }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section aria-label="Schedule" className="card card-pad col" style={{ gap: 10 }} data-testid="agenda">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="h2">{sameDay(cur, T) ? 'Today · ' : ''}{shortDate(cur)}</h2>
          <span className="small muted">{evs.length} {evs.length === 1 ? 'event' : 'events'}</span>
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {evs.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={() => onOpen(ev)} />)}
        </AnimatePresence>
        {!evs.length && <span className="muted" style={{ fontSize: 14 }}>Nothing planned. Tap + to add something.</span>}
      </section>
    </div>
  );
}

function EventRow({ ev, onOpen }: { ev: DayEvent; onOpen: () => void }) {
  const p = PEOPLE[ev.who];
  return (
    <motion.button layout onClick={onOpen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} whileTap={{ scale: 0.98 }} transition={spring}
      data-testid="event-row" style={{ display: 'flex', gap: 12, alignItems: 'stretch', padding: '10px 12px', borderRadius: 14, background: p.tint, textAlign: 'left', width: '100%' }}>
      <span style={{ width: 4, borderRadius: 2, flexShrink: 0, background: p.dot }} />
      <span className="col" style={{ gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{ev.title}</span>
        <span style={{ fontSize: 12, color: '#5E5D66' }}>{fmtTime(ev.start)} – {fmtTime(ev.end)} · {p.name}</span>
      </span>
    </motion.button>
  );
}

function NowLine() {
  const m = minutesNow() - FIRST * 60;
  if (m < 0 || m > HOURS * 60) return null;
  return (
    <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease }} style={{ position: 'absolute', left: 0, right: 0, top: (m / 60) * HOUR, height: 2, background: '#E5484D', zIndex: 2, transformOrigin: 'left' }}>
      <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, background: '#E5484D' }} />
    </motion.div>
  );
}
