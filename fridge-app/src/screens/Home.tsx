import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { eventsOn, PEOPLE, WHERE_LABEL, type Where } from '../data';
import { addDays, dateKey, DOW_LONG, fmtTime, greeting, MONTHS, minutesNow, toMinutes, today } from '../dates';
import { IChevR, ICheck, ISpark } from '../icons';
import { useNav } from '../nav';
import { useStore } from '../store';
import { Count, ease, riseItem, stagger, useNow } from '../ui';
import { useWeather } from '../weather';

const THEMES = {
  morning: { grad: 'linear-gradient(140deg, #FFD1AE 0%, #FFE3BE 45%, #CFE0FF 100%)', glow: '#FFF1C9', ink: '#2A211B', sub: '#5E4C3E', chip: 'rgba(255,255,255,0.6)' },
  afternoon: { grad: 'linear-gradient(140deg, #BFE2FF 0%, #DDF1FF 50%, #CDF1E2 100%)', glow: '#FFFFFF', ink: '#10304A', sub: '#3A586E', chip: 'rgba(255,255,255,0.6)' },
  evening: { grad: 'linear-gradient(140deg, #262C72 0%, #4B3D9E 45%, #8A55B0 75%, #C8697A 100%)', glow: '#FFB59A', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.8)', chip: 'rgba(255,255,255,0.14)' },
  night: { grad: 'linear-gradient(140deg, #0B1230 0%, #18205A 55%, #31266A 100%)', glow: '#8FA2FF', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.75)', chip: 'rgba(255,255,255,0.10)' }
};

export function themeFor(h: number) {
  if (h >= 5 && h < 12) return THEMES.morning;
  if (h >= 12 && h < 17) return THEMES.afternoon;
  if (h >= 17 && h < 22) return THEMES.evening;
  return THEMES.night;
}

export default function Home() {
  const { data } = useStore();
  const nav = useNav();
  const now = useNow();
  const { weather } = useWeather();
  const T = themeFor(now.getHours());
  const t = today();
  const tKey = dateKey(t);

  const todayEvents = eventsOn(data, tKey);
  const tomorrowEvents = eventsOn(data, dateKey(addDays(t, 1)));
  const mins = minutesNow();
  const upcoming = todayEvents.filter((e) => toMinutes(e.end) > mins);
  const next = upcoming[0];

  const doneCount = data.tasks.filter((x) => x.done).length;
  const total = data.tasks.length;
  const open = data.tasks.filter((x) => !x.done).slice(0, 3);
  const pct = total ? doneCount / total : 0;

  const counts = (['fridge', 'freezer', 'pantry'] as Where[]).map((w) => ({ w, n: data.stock.filter((s) => s.where === w).length }));
  const dinner = data.plan[tKey];
  const toBuy = data.groceries.filter((g) => !g.got);
  const storesUsed = new Set(toBuy.map((g) => g.store)).size;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (dinner) parts.push(dinner + ' for dinner');
    if (next) parts.push(next.title.toLowerCase().replace(/^./, (c) => c.toUpperCase()) + ' at ' + fmtTime(next.start));
    else parts.push(upcoming.length ? '' : 'nothing else on the calendar today');
    const left = data.tasks.filter((x) => !x.done && x.due === 'Today').length;
    parts.push(left ? left + (left === 1 ? ' task' : ' tasks') + ' left today' : 'all of today’s tasks are done');
    const s = parts.filter(Boolean).join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }, [dinner, next, upcoming.length, data.tasks]);

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="kicker">{DOW_LONG[t.getDay()]}, {MONTHS[t.getMonth()]} {t.getDate()}</span>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em' }}>Home</h1>
        </div>
      </header>
      <motion.main className="scroll noscroll" variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Hero */}
        <motion.section variants={riseItem} aria-label="Today" data-testid="hero" style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, borderRadius: 26, padding: '22px 20px 18px', display: 'flex', flexDirection: 'column', gap: 14, background: T.grad, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 16px 36px rgba(46,52,92,0.16)', color: T.ink }}>
          <motion.div aria-hidden style={{ position: 'absolute', width: 260, height: 260, right: -60, top: -130, borderRadius: '50%', background: 'radial-gradient(circle, ' + T.glow + ' 0%, rgba(255,255,255,0) 68%)', pointerEvents: 'none' }}
            animate={{ x: [0, -24, 0], y: [0, 12, 0], scale: [1, 1.08, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.02 }} data-testid="greeting">{greeting(now.getHours())}</h2>
            {weather && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }} data-testid="weather">
                <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.05em', lineHeight: 0.9 }}>{weather.temp}°</span>
                <div className="col" style={{ gap: 2, paddingTop: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{weather.label}</span>
                  <span style={{ fontSize: 12, color: T.sub }}>H {weather.hi}° · L {weather.lo}°</span>
                </div>
              </motion.div>
            )}
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.chip }}><ISpark size={14} color={T.ink} /></span>
            <span data-testid="summary">{summary}</span>
          </div>
          {weather && (
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {weather.days.map((d, i) => (
                <motion.div key={d.day + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 0', borderRadius: 14, background: T.chip }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.sub }}>{d.day}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{d.hi}°</span>
                  <span style={{ fontSize: 11, color: T.sub }}>{d.label}</span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Calendar */}
        <motion.button variants={riseItem} className="card card-pad" onClick={() => nav.go('calendar')} aria-label="Open Calendar" data-testid="home-calendar" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }} whileTap={{ scale: 0.98 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h2">Today</h2>
            <IChevR size={16} color="#66656D" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Count value={todayEvents.length} style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#5E5D66' }}>{todayEvents.length === 1 ? 'event' : 'events'}{next ? ' · next at ' + fmtTime(next.start) : ''}</span>
          </div>
          <EventList list={todayEvents} empty="Nothing scheduled today." />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5E5D66', letterSpacing: '0.04em', marginTop: 4 }}>TOMORROW</div>
          <EventList list={tomorrowEvents} empty="Nothing scheduled tomorrow." />
        </motion.button>

        {/* Tasks */}
        <motion.button variants={riseItem} className="card card-pad" onClick={() => nav.go('tasks')} aria-label="Open Tasks" data-testid="home-tasks" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }} whileTap={{ scale: 0.98 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="h2">Tasks</h2><IChevR size={16} color="#66656D" /></div>
          <div className="row" style={{ gap: 16 }}>
            <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
              <svg width="88" height="88" viewBox="0 0 108 108" aria-hidden style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="54" cy="54" r="46" fill="none" stroke="rgba(46,52,92,0.08)" strokeWidth="11" />
                <motion.circle cx="54" cy="54" r="46" fill="none" stroke="#4F5BD5" strokeWidth="11" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.001, pct) }} transition={{ duration: 1.1, ease, delay: 0.2 }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }} data-testid="home-task-count"><Count value={doneCount} /><span style={{ color: '#66656D', fontWeight: 500 }}>/{total}</span></span>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#5E5D66', marginTop: 2 }}>DONE</span>
              </div>
            </div>
            <div className="col" style={{ gap: 9 }}>
              {open.map((x) => (
                <div key={x.id} className="row" style={{ gap: 8 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 12, background: PEOPLE[x.who].tint, color: PEOPLE[x.who].text, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{PEOPLE[x.who].name[0]}</span>
                  <span className="ellipsis" style={{ fontSize: 14, fontWeight: 500 }}>{x.title}</span>
                </div>
              ))}
              {!open.length && <span className="muted" style={{ fontSize: 14 }}>Everything is done. Nice.</span>}
            </div>
          </div>
        </motion.button>

        {/* Stock */}
        <motion.button variants={riseItem} className="card card-pad" onClick={() => nav.go('stock')} aria-label="Open Stock" data-testid="home-stock" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }} whileTap={{ scale: 0.98 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="h2">Stock</h2><span className="small" style={{ color: '#5E5D66' }}>{data.stock.length} items</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {counts.map(({ w, n }) => (
              <div key={w} style={{ borderRadius: 16, padding: 12, height: 84, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: TILE[w].bg }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: TILE[w].ink }}>{WHERE_LABEL[w]}</span>
                <Count value={n} style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }} />
              </div>
            ))}
          </div>
        </motion.button>

        {/* Dinner */}
        <motion.button variants={riseItem} className="card" onClick={() => nav.go('food', 'meals')} aria-label="Open Meals" data-testid="home-dinner" style={{ textAlign: 'left', position: 'relative', overflow: 'hidden', minHeight: 140, display: 'flex', flexShrink: 0 }} whileTap={{ scale: 0.98 }}>
          <div className="col grow" style={{ padding: '18px 0 18px 18px', gap: 4 }}>
            <h2 className="h2">Dinner tonight</h2>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05, marginTop: 6 }}>{dinner || 'Nothing planned'}</div>
            <div style={{ fontSize: 13, color: '#5E5D66' }}>{dinner ? 'Tap to see this week’s plan' : 'Tap for ideas from your stock'}</div>
            {dinner && <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#1F6A42', background: 'rgba(233,245,238,0.9)', borderRadius: 10, padding: '6px 10px', alignSelf: 'flex-start' }}><ICheck size={13} color="#1F6A42" />Planned</div>}
          </div>
          <motion.div aria-hidden style={{ width: 120, flexShrink: 0, position: 'relative' }} initial={{ rotate: -20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.9, ease, delay: 0.3 }}>
            <Plate />
          </motion.div>
        </motion.button>

        {/* Groceries */}
        <motion.button variants={riseItem} className="card card-pad" onClick={() => nav.go('food', 'groceries')} aria-label="Open Groceries" data-testid="home-groceries" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }} whileTap={{ scale: 0.98 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="h2">Groceries</h2><span className="small" style={{ color: '#5E5D66' }}>{storesUsed} {storesUsed === 1 ? 'store' : 'stores'}</span></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Count value={toBuy.length} style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#5E5D66' }}>items to pick up</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {toBuy.slice(0, 6).map((g) => <span key={g.id} className="chip">{g.name}</span>)}
          </div>
        </motion.button>
      </motion.main>
    </div>
  );
}

const TILE: Record<Where, { bg: string; ink: string }> = {
  fridge: { bg: 'linear-gradient(160deg, rgba(196,228,247,0.85), rgba(225,241,250,0.6))', ink: '#2D4B5C' },
  freezer: { bg: 'linear-gradient(160deg, rgba(206,212,250,0.85), rgba(229,232,252,0.6))', ink: '#343B70' },
  pantry: { bg: 'linear-gradient(160deg, rgba(250,222,192,0.85), rgba(252,236,218,0.6))', ink: '#6A4523' }
};

function EventList({ list, empty }: { list: ReturnType<typeof eventsOn>; empty: string }) {
  if (!list.length) return <div className="muted" style={{ fontSize: 14, padding: '4px 2px' }}>{empty}</div>;
  return (
    <div className="col" style={{ gap: 6 }}>
      {list.slice(0, 4).map((e) => {
        const p = PEOPLE[e.who];
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 14, background: p.tint }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: p.dot, flexShrink: 0 }} />
            <span className="grow ellipsis" style={{ fontSize: 15, fontWeight: 500 }}>{e.title}</span>
            <span className="tnum" style={{ fontSize: 13, color: '#5E5D66' }}>{fmtTime(e.start)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Plate() {
  return (
    <svg width="160" height="160" viewBox="0 0 190 190" style={{ position: 'absolute', right: -44, top: -10 }}>
      <defs>
        <radialGradient id="pplate" cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#ECEBF2" /></radialGradient>
        <linearGradient id="pshell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7CF7A" /><stop offset="1" stopColor="#E2A447" /></linearGradient>
      </defs>
      <circle cx="95" cy="98" r="84" fill="#2E3460" opacity="0.08" />
      <circle cx="95" cy="92" r="82" fill="url(#pplate)" />
      <circle cx="95" cy="92" r="62" fill="none" stroke="#E4E2EA" strokeWidth="2" />
      <path d="M42 112 Q95 18 148 112 Z" fill="url(#pshell)" />
      <path d="M52 104 Q95 44 138 104" fill="none" stroke="#5FA35A" strokeWidth="12" strokeLinecap="round" />
      <circle cx="72" cy="88" r="7" fill="#E5533D" /><circle cx="96" cy="74" r="6" fill="#E5533D" /><circle cx="118" cy="86" r="7" fill="#E5533D" />
      <path d="M64 98 Q95 64 126 98" fill="none" stroke="#FFF2C4" strokeWidth="5" strokeLinecap="round" strokeDasharray="4 7" />
    </svg>
  );
}
