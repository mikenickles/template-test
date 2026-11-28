import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import type { ReactNode } from 'react';
import { useBackHandler } from './back';
import { eventsOn } from './data';
import { DOW_LONG, MONTHS, todayKey, today } from './dates';
import { IBag, ICalendar, IFood, IFridge, IGear, IHome, ITasks } from './icons';
import { useNav } from './nav';
import { useStore } from './store';
import { ease, spring, tap } from './ui';
import type { Tab } from './voice';

type Item = { id: Tab; label: string; Icon: typeof IHome };
export const SECTIONS: Item[] = [
  { id: 'home', label: 'Home', Icon: IHome },
  { id: 'stock', label: 'Stock', Icon: IFridge },
  { id: 'calendar', label: 'Calendar', Icon: ICalendar },
  { id: 'tasks', label: 'Tasks', Icon: ITasks },
  { id: 'groceries', label: 'Groceries', Icon: IBag },
  { id: 'meals', label: 'Meals', Icon: IFood }
];
const SETTINGS: Item = { id: 'settings', label: 'Settings', Icon: IGear };

/** Three-line button that opens the sidebar. */
export function MenuButton() {
  const nav = useNav();
  return (
    <motion.button className="glass-btn" aria-label="Open menu" data-testid="menu-button" onClick={() => { tap(); nav.openMenu(); }} whileTap={{ scale: 0.9 }} transition={spring}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B1B1F" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" />
      </svg>
    </motion.button>
  );
}

/** Screen header row: menu button, kicker + title, optional actions on the right. */
export function TitleBar({ kicker, title, right, size = 32 }: { kicker: ReactNode; title: ReactNode; right?: ReactNode; size?: number }) {
  return (
    <div className="head-row" style={{ gap: 12 }}>
      <MenuButton />
      <div className="col grow" style={{ gap: 2 }}>
        {kicker}
        {typeof title === 'string' ? <h1 className="title ellipsis" style={{ fontSize: size }}>{title}</h1> : title}
      </div>
      {right}
    </div>
  );
}

export default function Menu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore();
  const nav = useNav();
  useBackHandler(open, onClose);
  const t = today();

  const badge: Partial<Record<Tab, string>> = {
    stock: String(data.stock.length),
    calendar: String(eventsOn(data, todayKey()).length),
    tasks: String(data.tasks.filter((x) => !x.done).length),
    groceries: String(data.groceries.filter((g) => !g.got).length)
  };
  const dinner = data.plan[todayKey()];
  const pick = (id: Tab) => { tap(); nav.go(id); onClose(); };
  const onDragEnd = (_: unknown, info: PanInfo) => { if (info.offset.x < -70 || info.velocity.x < -500) onClose(); };

  const row = (it: Item, i: number) => {
    const on = nav.tab === it.id;
    const sub = it.id === 'meals' ? (dinner ? 'Tonight: ' + dinner : 'Nothing planned tonight') : null;
    return (
      <motion.button key={it.id} className={'menu-item' + (on ? ' on' : '')} onClick={() => pick(it.id)} aria-current={on ? 'page' : undefined} data-testid={'nav-' + it.id}
        variants={{ hidden: { opacity: 0, x: -24 }, show: { opacity: 1, x: 0, transition: { delay: 0.06 + i * 0.04, duration: 0.4, ease } } }} whileTap={{ scale: 0.97 }}>
        {on && <motion.span layoutId="menu-active" className="menu-active" transition={spring} />}
        <span className="menu-icon"><it.Icon size={22} color={on ? '#4F5BD5' : '#3D3C44'} /></span>
        <span className="col grow" style={{ position: 'relative', gap: 1 }}>
          <span>{it.label}</span>
          {sub && <span className="ellipsis" style={{ fontSize: 12, fontWeight: 500, color: '#66656D' }}>{sub}</span>}
        </span>
        {badge[it.id] !== undefined && <span className="menu-badge tnum">{badge[it.id]}</span>}
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="menu-scrim" className="scrim" style={{ zIndex: 34 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose} data-testid="menu-scrim" />
          <motion.nav key="menu" className="menu" aria-label="Sections" data-testid="menu"
            initial={{ x: '-105%' }} animate={{ x: 0 }} exit={{ x: '-105%' }} transition={{ type: 'spring', stiffness: 340, damping: 36 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.6, right: 0.04 }} onDragEnd={onDragEnd}>
            <motion.div className="col" style={{ gap: 4, flex: '1 1 auto', minHeight: 0 }} initial="hidden" animate="show">
              <div className="row" style={{ gap: 12, padding: '0 8px 18px' }}>
                <motion.span initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...spring, delay: 0.05 }}
                  style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #5B67E8, #4F5BD5 55%, #7A4FC9)', boxShadow: '0 8px 20px rgba(79,91,213,0.35)' }}>
                  <IFridge size={24} color="#fff" w={2} />
                </motion.span>
                <span className="col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Family Fridge</span>
                  <span className="small muted">{DOW_LONG[t.getDay()]}, {MONTHS[t.getMonth()]} {t.getDate()}</span>
                </span>
              </div>
              {SECTIONS.map(row)}
              <div className="grow" />
              <div style={{ height: 1, background: 'rgba(46,52,92,0.08)', margin: '8px 8px' }} />
              {row(SETTINGS, SECTIONS.length)}
            </motion.div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
